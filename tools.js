/* tools.js — Single source of truth for the six approved tool schemas.
   These are passed to the OpenAI Responses API so the model knows when
   and how to call each tool. */

'use strict';

// ── Tool schemas ─────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    name: 'create_note',
    description: 'Create a new Lifeflow note for the user.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        body:  { type: 'string' },
        type:  { type: 'string', enum: ['idea', 'recipe', 'schedule', 'list'] }
      },
      required: ['title', 'body', 'type']
    }
  },
  {
    type: 'function',
    name: 'create_goal',
    description: 'Create a new Lifeflow goal.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title:       { type: 'string' },
        description: { type: 'string' },
        category:    { type: 'string', enum: ['health', 'learning', 'career', 'personal', 'finance', 'creative'] },
        deadline:    { type: 'string', description: 'YYYY-MM-DD or empty string.' },
        progress:    { type: 'number', minimum: 0, maximum: 100 }
      },
      required: ['title']
    }
  },
  {
    type: 'function',
    name: 'create_reminder',
    description: 'Create a new Lifeflow reminder.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title:    { type: 'string' },
        date:     { type: 'string', description: 'YYYY-MM-DD.' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] }
      },
      required: ['title', 'date']
    }
  },
  {
    type: 'function',
    name: 'create_event',
    description: 'Create a new Lifeflow calendar event.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD.' },
        time: { type: 'string', description: 'HH:MM or empty string.' }
      },
      required: ['name', 'date']
    }
  },
  {
    type: 'function',
    name: 'start_focus_session',
    description: 'Prepare the focus timer with a task and duration. Do not start it automatically.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        task:    { type: 'string' },
        minutes: { type: 'integer', minimum: 5, maximum: 90 }
      },
      required: ['task', 'minutes']
    }
  },
  {
    type: 'function',
    name: 'update_daily_plan',
    description: 'Update the user\'s daily plan with a list of tasks.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title:    { type: 'string' },
              duration: { type: 'integer' }
            },
            required: ['title']
          }
        }
      },
      required: ['items']
    }
  }
];

// The set of approved tool names — all six are creation-only and therefore safe.
const SAFE_TOOL_NAMES = new Set([
  'create_note',
  'create_goal',
  'create_reminder',
  'create_event',
  'start_focus_session',
  'update_daily_plan'
]);

// ── Exports ──────────────────────────────────────────────────────────────────

/**
 * Returns all six approved tool schemas as an array.
 * Pass the result directly to the OpenAI `tools` field.
 *
 * @returns {object[]}
 */
function getToolDefinitions() {
  return TOOL_DEFINITIONS;
}

/**
 * Returns true only when `name` is one of the six approved tool names.
 * All approved tools are creation-only, so they are always safe to auto-execute.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isSafeToolCall(name) {
  return SAFE_TOOL_NAMES.has(name);
}

module.exports = { getToolDefinitions, isSafeToolCall };
