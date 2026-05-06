/* Lifeflow AI server.
   Serves the app and keeps the Groq API key out of browser code. */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const Ajv = require('ajv');
const OpenAI = require('openai');
const { getToolDefinitions, isSafeToolCall } = require('./tools');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:4173';

// ── Groq client (OpenAI-compatible) ─────────────────────────────────────────

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1'
});

// ── AJV validator ────────────────────────────────────────────────────────────

const ajv = new Ajv({ allErrors: true });

// Pre-compile validators for each tool schema
const _toolValidators = {};
for (const def of getToolDefinitions()) {
  _toolValidators[def.name] = ajv.compile(def.parameters);
}

function validateToolArgs(name, args) {
  const validate = _toolValidators[name];
  if (!validate) return false;
  return validate(args);
}

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();

// Trust Railway's proxy so express-rate-limit works correctly
app.set('trust proxy', 1);

// CORS — only the app's own origin; no wildcard
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Rate limiter — 20 requests per minute per IP across all routes
// Disabled in test environment to avoid interference with property-based tests
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Rate limit exceeded. Please wait.' });
  }
});
app.use(limiter);

// Body parser — JSON only, 100 KB limit
app.use(express.json({ limit: '100kb' }));

// Static files — serve everything from the project root
app.use(express.static(ROOT));

// ── Tool definitions ─────────────────────────────────────────────────────────
// The six approved creation tools come from tools.js (single source of truth).
// set_today_focus is a server-only tool kept here for backward compatibility;
// it is NOT in the approved six and isSafeToolCall() returns false for it.

const SET_TODAY_FOCUS_TOOL = {
  type: 'function',
  name: 'set_today_focus',
  description: 'Set the user current Today Focus field.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      goal: { type: 'string' }
    },
    required: ['goal']
  }
};

// Full tool list sent to OpenAI: the six approved tools + set_today_focus.
const TOOLS = [...getToolDefinitions(), SET_TODAY_FOCUS_TOOL];

// ── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build a concise system prompt that includes the user's name, today's date,
 * workspace summary counts, and the tool-use policy statement.
 * Total length is kept well under 2000 tokens.
 *
 * @param {object} context - ContextSnapshot
 * @param {boolean} isDailyPlan - Whether to include the DailyPlanPrompt block
 * @returns {string}
 */
function buildSystemPrompt(context = {}, isDailyPlan = false) {
  const name = context.name || 'User';
  const date = context.key || today();
  const counts = {
    notes: Array.isArray(context.notes) ? context.notes.length : 0,
    goals: Array.isArray(context.goals) ? context.goals.length : 0,
    reminders: Array.isArray(context.reminders) ? context.reminders.length : 0,
    events: Array.isArray(context.events) ? context.events.length : 0,
    focusMinutes: context.focusMinutes || 0
  };

  let prompt = `You are Lifeflow AI, a personal productivity assistant built into the Lifeflow app.
Keep responses short and actionable. For simple questions, use at most 3 sentences.
Respond in the same language the user writes in.
When the user asks you to create a note, goal, reminder, event, or focus session — call the appropriate tool immediately. Do not ask for confirmation, just do it.
After calling a tool, briefly confirm what you created in one sentence.
Use the workspace context to give relevant answers, but keep responses short and practical.

User: ${name}
Today: ${date}
Workspace: ${counts.notes} notes, ${counts.goals} goals, ${counts.reminders} reminders, ${counts.events} events, ${counts.focusMinutes} focus minutes today.

Tool policy: You may call creation tools autonomously when asked. You must NOT call any tool that modifies or deletes existing records.`;

  if (isDailyPlan) {
    prompt += `

The user is asking about their daily plan. Respond with EXACTLY:
1. Three numbered priorities based on their active goals, open reminders, and upcoming events.
2. One recommended focus session with duration in minutes.
3. One small win they can achieve quickly.
Use the workspace context provided. If no goals/reminders/events exist, suggest generic productivity activities.`;
  }

  return prompt;
}

function compactContext(context = {}) {
  const take = (items, count, mapper) => Array.isArray(items) ? items.slice(0, count).map(mapper) : [];

  // Helper: exclude fields with null, undefined, or empty string values from an object
  const stripEmpty = (obj) => {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && v !== undefined && v !== '') {
        result[k] = v;
      }
    }
    return result;
  };

  // Mandatory fields always present
  const compact = {
    today: context.key || today(),
    userName: context.name || 'User',
    counts: {
      notes: Array.isArray(context.notes) ? context.notes.length : 0,
      goals: Array.isArray(context.goals) ? context.goals.length : 0,
      reminders: Array.isArray(context.reminders) ? context.reminders.length : 0,
      events: Array.isArray(context.events) ? context.events.length : 0,
      focusMinutesToday: context.focusMinutes || 0
    }
  };

  // todayFocus — only include if non-null, non-empty object
  const tf = context.todayFocus;
  if (tf !== null && tf !== undefined && !(typeof tf === 'object' && Object.keys(tf).length === 0)) {
    compact.todayFocus = tf;
  }

  // notes — max 5, exclude if empty
  const notes = take(context.notes, 5, n => stripEmpty({ title: n.title, type: n.type, body: String(n.body || '').slice(0, 500), date: n.date }));
  if (notes.length > 0) compact.notes = notes;

  // activeGoals — max 5, exclude if empty
  const activeGoals = take(context.activeGoals || context.goals, 5, g => stripEmpty({ title: g.title, description: g.desc || g.description, category: g.category, deadline: g.deadline, progress: g.progress }));
  if (activeGoals.length > 0) compact.activeGoals = activeGoals;

  // openReminders — max 5, exclude if empty
  const openReminders = take(context.openReminders || context.reminders, 5, r => stripEmpty({ title: r.title, date: r.date, time: r.time, priority: r.priority }));
  if (openReminders.length > 0) compact.openReminders = openReminders;

  // upcomingEvents — max 5, exclude if empty
  const upcomingEvents = take(context.upcomingEvents || context.events, 5, e => stripEmpty({ name: e.name, date: e.date, time: e.time }));
  if (upcomingEvents.length > 0) compact.upcomingEvents = upcomingEvents;

  // plan — max 5, exclude if empty
  const plan = take(context.plan, 5, p => stripEmpty({ title: p.title, meta: p.meta, duration: p.duration, done: p.done }));
  if (plan.length > 0) compact.plan = plan;

  return compact;
}

/**
 * Safely parse a raw text response from the AI model into { reply, toolCalls }.
 * Never throws — always returns a valid object.
 *
 * @param {string|null|undefined} rawText
 * @returns {{ reply: string, toolCalls: Array }}
 */
function safeParseResponse(rawText) {
  // 1. null / undefined / empty → empty result
  if (rawText == null || rawText === '') {
    return { reply: '', toolCalls: [] };
  }

  // 2. Strip markdown code fences (```json ... ``` or ``` ... ```)
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  // 3. Attempt JSON.parse
  try {
    const parsed = JSON.parse(cleaned);

    // 4. Extract reply and toolCalls with safe fallbacks
    const reply = parsed.reply != null ? String(parsed.reply) : '';
    const toolCalls = Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [];

    return { reply, toolCalls };
  } catch {
    // 5. Parse failed → treat entire text as plain reply
    return { reply: rawText, toolCalls: [] };
  }
}

/**
 * Classify a user message as 'simple' or 'complex' based on keywords.
 *
 * - If the message contains creation or planning keywords → 'complex'
 * - If the message has fewer than 10 words and no keywords → 'simple'
 * - Otherwise → 'complex' (default safe)
 *
 * @param {string} message
 * @returns {'simple' | 'complex'}
 */
function classifyIntent(message) {
  const lower = String(message || '').toLowerCase();

  const creationKeywords = [
    'create', 'add', 'remind me', 'set a goal', 'make a note', 'schedule',
    'creează', 'adaugă', 'amintește-mi', 'setează', 'creaza', 'adauga'
  ];

  const planningKeywords = [
    'plan', 'today', 'what should', 'schedule',
    'azi', 'ce fac', 'planul', 'planifica'
  ];

  const allKeywords = [...creationKeywords, ...planningKeywords];

  const hasKeyword = allKeywords.some(kw => lower.includes(kw));

  if (hasKeyword) return 'complex';

  const wordCount = lower.trim().split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 10) return 'simple';

  return 'complex';
}

/**
 * Detect whether a message is asking about the user's daily plan.
 * Case-insensitive matching against known patterns in EN and RO.
 *
 * @param {string} message
 * @returns {boolean}
 */
function isDailyPlanQuery(message) {
  const lower = String(message || '').toLowerCase();

  const patterns = [
    'what should i do today',
    'what to do today',
    'plan for today',
    'my plan',
    'daily plan',
    'ce fac azi',
    'ce ar trebui să fac',
    'planul meu',
    'plan de azi',
    'ce sa fac azi'
  ];

  return patterns.some(p => lower.includes(p));
}

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function normalizeAction(name, args) {
  const payload = { ...args };
  if (name === 'create_goal') {
    payload.description = payload.description || payload.desc || '';
    payload.category = payload.category || 'personal';
    payload.deadline = payload.deadline || '';
    payload.progress = Number(payload.progress || 0);
  }
  if (name === 'create_note') {
    payload.type = payload.type || 'idea';
    payload.body = payload.body || payload.text || '';
  }
  if (name === 'create_reminder') {
    payload.date = payload.date || today();
    payload.time = payload.time || '';
    payload.priority = payload.priority || 'medium';
  }
  if (name === 'create_event') {
    payload.date = payload.date || today();
    payload.time = payload.time || '';
  }
  return { type: name, payload };
}

// ── Groq AI call helper ───────────────────────────────────────────────────────

/**
 * Call Groq with a system prompt, user message, and tool definitions.
 * Returns { reply, toolCalls, responseId }
 */
async function callGroq(systemPrompt, userMessage, tools) {
  const groqTools = tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));

  const response = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    tools: groqTools.length > 0 ? groqTools : undefined,
    tool_choice: groqTools.length > 0 ? 'auto' : undefined,
    temperature: 0.3,
    max_tokens: 1024
  });

  const choice = response.choices[0];
  const msg = choice.message;

  // Extract text reply
  const reply = msg.content || null;

  // Extract tool calls
  const toolCalls = (msg.tool_calls || []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    args: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })()
  }));

  return {
    reply,
    toolCalls,
    responseId: response.id
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.post('/api/assistant', async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({
      mode: 'setup',
      message: 'AI not configured. Set GROQ_API_KEY in .env and restart the server.'
    });
  }

  const body = req.body || {};

  // Validate message
  const rawMessage = body.message;
  if (rawMessage === undefined || rawMessage === null || rawMessage === '') {
    return res.status(400).json({ error: 'Invalid message' });
  }
  const message = String(rawMessage).trim();
  if (!message || message.length > 4000) {
    return res.status(400).json({ error: 'Invalid message' });
  }

  const context = body.context || {};

  try {
    const intent = classifyIntent(message);
    const isDailyPlan = isDailyPlanQuery(message);
    const systemPrompt = buildSystemPrompt(context, isDailyPlan);
    const userMessage = JSON.stringify({
      userMessage: message,
      lifeflowContext: compactContext(context)
    });

    const tools = (isDailyPlan || intent === 'complex') ? TOOLS : [];

    const { reply: rawReply, toolCalls: rawToolCalls, responseId } = await callGroq(
      systemPrompt,
      userMessage,
      tools
    );

    // Apply safeParseResponse on the text reply if it's a string
    const parsed = typeof rawReply === 'string' ? safeParseResponse(rawReply) : { reply: rawReply || '', toolCalls: [] };
    const reply = parsed.reply;

    // Merge tool calls from both the model's native tool_calls and any parsed from text
    const allRawToolCalls = [...rawToolCalls, ...parsed.toolCalls];

    // Validate and annotate tool calls
    const toolCalls = allRawToolCalls.map(call => {
      const safe = isSafeToolCall(call.name);
      const result = { id: call.id, name: call.name, args: call.args, safe };
      if (!validateToolArgs(call.name, call.args)) {
        result.safe = false;
        result.error = 'Invalid arguments';
      }
      return result;
    });

    return res.status(200).json({ reply, toolCalls, responseId, intent, isDailyPlan });
  } catch (error) {
    console.error('[/api/assistant error]', error.message);
    return res.status(502).json({ error: 'AI backend unavailable' });
  }
});

// ── Goal loop helpers ─────────────────────────────────────────────────────────

/**
 * Detect calendar conflicts: pairs of events that share the same date and time,
 * where neither time field is empty.
 *
 * Pure function — does not mutate the input array.
 *
 * @param {Array<{date: string, time: string, name?: string}>} events
 * @returns {Array<{a: object, b: object}>}
 */
function detectCalendarConflicts(events) {
  if (!Array.isArray(events)) return [];
  const pairs = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      if (
        a.time && b.time &&
        a.time !== '' && b.time !== '' &&
        a.date === b.date &&
        a.time === b.time
      ) {
        pairs.push({ a, b });
      }
    }
  }
  return pairs;
}

/**
 * Build the system prompt for the goal loop.
 * Instructs the model to generate actionable suggestions and optionally call
 * safe creation tools to draft items for user review.
 *
 * @returns {string}
 */
function buildLoopSystemPrompt() {
  return `You are Lifeflow AI running a proactive workspace scan.
Your job is to review the user's workspace issues and generate helpful, actionable suggestions.

You MUST respond with a JSON array of suggestion objects. Each object must have:
  - "type": "warning" or "tip"
  - "icon": a single emoji relevant to the suggestion
  - "title": a short title (max 60 chars)
  - "body": a helpful explanation or recommendation (max 200 chars)
  - "action": null (informational) or a tool call object { "name": string, "args": object }

Example response format:
[
  {
    "type": "warning",
    "icon": "⚠️",
    "title": "Overdue reminder: Submit tax forms",
    "body": "This reminder is 3 days overdue. Consider rescheduling or completing it today.",
    "action": null
  }
]

Rules:
- You may optionally call safe creation tools (create_note, create_goal, create_reminder, create_event, start_focus_session, update_daily_plan) to draft items for the user to review.
- You must NOT call any tool that modifies or deletes existing records.
- Keep suggestions concise and actionable.
- If there are no issues, return an empty array: []
- Always return valid JSON — no markdown fences, no extra text outside the JSON array.`;
}

/**
 * Serialize the issues array into a human-readable summary for the model.
 *
 * @param {Array} issues
 * @param {object} ctx - ContextSnapshot
 * @returns {string}
 */
function serializeIssues(issues, ctx) {
  if (issues.length === 0) {
    return `Workspace scan for ${ctx.name || 'User'} on ${ctx.key || today()}: No issues detected. Return an empty suggestions array [].`;
  }

  const lines = [`Workspace scan for ${ctx.name || 'User'} on ${ctx.key || today()}:`];
  for (const issue of issues) {
    lines.push(`\n[${issue.type.toUpperCase()}] ${issue.title}`);
    if (issue.items && issue.items.length > 0) {
      const itemSummary = issue.items.slice(0, 5).map(item => {
        if (item.title) return `  - ${item.title}`;
        if (item.a && item.b) return `  - "${item.a.name || item.a.title}" and "${item.b.name || item.b.title}" at ${item.a.time} on ${item.a.date}`;
        return `  - ${JSON.stringify(item)}`;
      }).join('\n');
      lines.push(itemSummary);
    }
  }
  lines.push('\nGenerate actionable suggestions as a JSON array.');
  return lines.join('\n');
}

/**
 * Parse the model's text output into an array of Suggestion objects.
 * If parsing fails for any reason, returns an empty array — never throws.
 *
 * @param {object} response - OpenAI Responses API response
 * @returns {Array<{type: string, icon: string, title: string, body: string, action: object|null}>}
 */
function parseSuggestions(response) {
  try {
    const text = response.output_text || extractText(response) || '';
    if (!text.trim()) return [];

    // Strip markdown code fences if present
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        type: ['warning', 'tip', 'draft'].includes(item.type) ? item.type : 'tip',
        icon: typeof item.icon === 'string' ? item.icon : '💡',
        title: typeof item.title === 'string' ? item.title : '',
        body: typeof item.body === 'string' ? item.body : '',
        action: item.action && typeof item.action === 'object' ? item.action : null
      }));
  } catch {
    return [];
  }
}

// ── Goal loop endpoint ────────────────────────────────────────────────────────

app.post('/api/agent/loop', async (req, res) => {
  // Goal loop disabled to conserve free-tier Gemini quota.
  // Returns empty response so the frontend handles it gracefully.
  return res.status(200).json({ suggestions: [], safeDrafts: [] });
});

// ── Start ────────────────────────────────────────────────────────────────────

// Only bind to a port when this file is run directly (not when required by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Lifeflow running at http://127.0.0.1:${PORT}/`);
    const key = process.env.GROQ_API_KEY;
    console.log(key ? `AI enabled with ${GROQ_MODEL} (Groq)` : 'AI setup needed: set GROQ_API_KEY in .env to enable AI responses.');
  });
}

// ── Exports (for testing) ─────────────────────────────────────────────────────

module.exports = { app, buildSystemPrompt, validateToolArgs, detectCalendarConflicts, buildLoopSystemPrompt, safeParseResponse, classifyIntent, isDailyPlanQuery };
