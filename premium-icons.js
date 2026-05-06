/* Lifeflow premium duotone icons.
   This keeps the existing data-lucide API, then replaces common stock
   outlines with a branded filled/stroked set after every createIcons call. */
(function () {
  if (typeof window === 'undefined') return;

  var NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    'layout-dashboard': '<rect class="pf" x="3.2" y="3.2" width="7.2" height="7.2" rx="2.2"/><rect class="ps" x="13.6" y="3.2" width="7.2" height="4.9" rx="2"/><rect class="ps" x="3.2" y="13.6" width="4.9" height="7.2" rx="2"/><rect class="pf" x="10.4" y="10.4" width="10.4" height="10.4" rx="2.8"/><circle class="plf" cx="15.6" cy="15.6" r="2.3"/>',
    'pencil-line': '<path class="ps" d="M5.2 15.4 4 20l4.6-1.2L18.9 8.5a2.6 2.6 0 0 0-3.7-3.7L5.2 15.4Z"/><path class="pl" d="m13.8 6.1 4.1 4.1M5.2 15.4l3.4 3.4M4 20l4.6-1.2"/>',
    'calendar-days': '<rect class="ps" x="3.3" y="4.7" width="17.4" height="15.3" rx="3"/><path class="pf" d="M6.3 4.7h11.4a3 3 0 0 1 3 3v2.1H3.3V7.7a3 3 0 0 1 3-3Z"/><path class="pl" d="M8 3v4.2M16 3v4.2"/><circle class="plf" cx="8.1" cy="13.5" r="1.1"/><circle class="plf" cx="12" cy="13.5" r="1.1"/><circle class="plf" cx="15.9" cy="13.5" r="1.1"/><circle class="plf" cx="8.1" cy="17" r="1.1"/><circle class="plf" cx="12" cy="17" r="1.1"/>',
    'calendar': '<rect class="ps" x="3.3" y="4.7" width="17.4" height="15.3" rx="3"/><path class="pf" d="M6.3 4.7h11.4a3 3 0 0 1 3 3v2H3.3v-2a3 3 0 0 1 3-3Z"/><path class="pl" d="M8 3v4M16 3v4M7.5 13h9M7.5 16.5h5.3"/>',
    'calendar-plus': '<rect class="ps" x="3.3" y="4.7" width="17.4" height="15.3" rx="3"/><path class="pf" d="M6.3 4.7h11.4a3 3 0 0 1 3 3v2H3.3v-2a3 3 0 0 1 3-3Z"/><path class="pl" d="M8 3v4M16 3v4"/><circle class="plf" cx="12" cy="15.3" r="3.2"/><path class="pw" d="M12 13.4v3.8M10.1 15.3h3.8"/>',
    'target': '<circle class="ps" cx="12" cy="12" r="8.9"/><circle class="pf" cx="12" cy="12" r="5.4"/><circle class="pwf" cx="12" cy="12" r="2"/><path class="pl" d="M17.7 6.3 21 3M17.7 6.3h-3.3M17.7 6.3v3.3"/>',
    'crosshair': '<circle class="ps" cx="12" cy="12" r="8.5"/><circle class="pf" cx="12" cy="12" r="3.2"/><path class="pl" d="M12 2.6v4M12 17.4v4M2.6 12h4M17.4 12h4"/>',
    'timer': '<circle class="ps" cx="12" cy="13" r="7.8"/><path class="pf" d="M12 5.2a7.8 7.8 0 0 1 7.8 7.8H12Z"/><path class="pl" d="M9 2.8h6M12 13V8.7M12 13l3 2.1"/>',
    'bell': '<path class="ps" d="M5.4 17.1h13.2l-1.4-2.2V10a5.2 5.2 0 0 0-10.4 0v4.9Z"/><path class="pf" d="M9.1 17.1h5.8a2.9 2.9 0 0 1-5.8 0Z"/><path class="pl" d="M10.2 4.2a2 2 0 0 1 3.6 0"/>',
    'bell-plus': '<path class="ps" d="M5.4 17.1h13.2l-1.4-2.2V10a5.2 5.2 0 0 0-10.4 0v4.9Z"/><path class="pf" d="M9.1 17.1h5.8a2.9 2.9 0 0 1-5.8 0Z"/><circle class="plf" cx="17.6" cy="6.4" r="3.1"/><path class="pw" d="M17.6 4.9v3M16.1 6.4h3"/>',
    'gamepad-2': '<path class="ps" d="M7.2 8.2h9.6a4.4 4.4 0 0 1 4.1 3l1 3.2a3.4 3.4 0 0 1-5.7 3.3l-1.7-1.8h-5l-1.7 1.8a3.4 3.4 0 0 1-5.7-3.3l1-3.2a4.4 4.4 0 0 1 4.1-3Z"/><path class="pl" d="M7.5 11.7v4M5.5 13.7h4"/><circle class="plf" cx="16.3" cy="12.2" r="1"/><circle class="plf" cx="18.6" cy="14.6" r="1"/>',
    'settings': '<circle class="ps" cx="12" cy="12" r="7.2"/><circle class="pf" cx="12" cy="12" r="3.1"/><path class="pl" d="M12 2.8v3M12 18.2v3M21.2 12h-3M5.8 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1M18.5 18.5l-2.1-2.1M7.6 7.6 5.5 5.5"/>',
    'search': '<circle class="ps" cx="10.7" cy="10.7" r="6.5"/><circle class="pl" cx="10.7" cy="10.7" r="6.5"/><path class="pl" d="m15.5 15.5 4.4 4.4"/><path class="pl" d="M8.5 8.2a3.5 3.5 0 0 1 4.4-.4"/>',
    'play': '<circle class="ps" cx="12" cy="12" r="9"/><path class="pf" d="M10 8.1 16.4 12 10 15.9Z"/>',
    'pause': '<circle class="ps" cx="12" cy="12" r="9"/><path class="pf" d="M8.7 7.6h2.4v8.8H8.7zM12.9 7.6h2.4v8.8h-2.4z"/>',
    'plus': '<circle class="ps" cx="12" cy="12" r="8.6"/><path class="pf" d="M10.7 6.8h2.6v3.9h3.9v2.6h-3.9v3.9h-2.6v-3.9H6.8v-2.6h3.9Z"/>',
    'rotate-ccw': '<path class="ps" d="M6.2 6.2A8.1 8.1 0 1 1 5 15"/><path class="pf" d="M5.8 3.5v5h5Z"/><path class="pl" d="M6.2 6.2 10.8 8.5"/>',
    'refresh-cw': '<path class="ps" d="M17.8 17.8A8.1 8.1 0 1 1 19 9"/><path class="pf" d="M18.2 20.5v-5h-5Z"/><path class="pl" d="M17.8 17.8 13.2 15.5"/>',
    'command': '<path class="ps" d="M8 8H6.4A3.4 3.4 0 1 1 9.8 4.6V8h4.4V4.6A3.4 3.4 0 1 1 17.6 8H16v4.4h1.6a3.4 3.4 0 1 1-3.4 3.4v-1.6H9.8v1.6a3.4 3.4 0 1 1-3.4-3.4H8Z"/><path class="pf" d="M9.8 9.8h4.4v4.4H9.8Z"/>',
    'zap': '<path class="pf" d="M13.5 2.7 4.9 13h5.6l-1 8.3 8.7-10.7h-5.7Z"/><path class="pl" d="m13.5 2.7-8.6 10.3h5.6l-1 8.3 8.7-10.7h-5.7Z"/>',
    'coffee': '<path class="ps" d="M5.1 8.2h10.8v5.5a4.8 4.8 0 0 1-4.8 4.8H9.9a4.8 4.8 0 0 1-4.8-4.8Z"/><path class="pf" d="M15.9 10h1.5a2.4 2.4 0 0 1 0 4.8h-1.5Z"/><path class="pl" d="M7.2 4.4c1.2 1 2.4 1 3.6 0M12 4.4c1.2 1 2.4 1 3.6 0"/>',
    'moon': '<path class="pf" d="M19.8 14.1A8.3 8.3 0 0 1 9.9 4.2 8.6 8.6 0 1 0 19.8 14.1Z"/><path class="pl" d="M19.8 14.1A8.3 8.3 0 0 1 9.9 4.2 8.6 8.6 0 1 0 19.8 14.1Z"/>',
    'flame': '<path class="pf" d="M12 21a6.8 6.8 0 0 0 6.8-6.8c0-4.1-3.1-6.5-5.2-10.7-.5 3.1-2.2 4.2-4 5.9A6.8 6.8 0 0 0 12 21Z"/><path class="pwf" d="M12.2 18.3a2.8 2.8 0 0 0 2.8-2.8c0-1.7-1.3-2.7-2.1-4.5-.3 1.4-1 1.9-1.8 2.7a2.8 2.8 0 0 0 1.1 4.6Z"/>',
    'sparkles': '<path class="pf" d="m12 2.8 1.7 5.1 5.1 1.7-5.1 1.7-1.7 5.1-1.7-5.1-5.1-1.7 5.1-1.7Z"/><path class="ps" d="m18.2 14.4.9 2.6 2.5.8-2.5.9-.9 2.5-.8-2.5-2.6-.9 2.6-.8Z"/><path class="ps" d="m5.1 14.9.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6Z"/>',
    'lightbulb': '<path class="ps" d="M12 3.3a6 6 0 0 0-3.7 10.8c.7.5 1.1 1.2 1.1 2.1h5.2c0-.9.4-1.6 1.1-2.1A6 6 0 0 0 12 3.3Z"/><path class="pf" d="M9.5 18h5l-.7 2.2h-3.6Z"/><path class="pl" d="M10.2 16.2h3.6"/>',
    'list-checks': '<path class="ps" d="M9.4 5.5h10.1M9.4 12h10.1M9.4 18.5h10.1"/><path class="pf" d="m3.7 5.5 1.2 1.2 2.4-3M3.7 12l1.2 1.2 2.4-3M3.7 18.5l1.2 1.2 2.4-3"/>',
    'utensils': '<path class="ps" d="M7.3 3v7.1a2.3 2.3 0 0 1-2.3 2.3V21M4.2 3v7.2M10.4 3v7.2M16.4 3.4v17.4"/><path class="pf" d="M16.4 3.4c2.3 1 3.6 3.2 3.6 5.7 0 2.3-1.2 4.1-3.6 4.8Z"/>',
    'sun': '<circle class="pf" cx="12" cy="12" r="4.3"/><circle class="ps" cx="12" cy="12" r="7.2"/><path class="pl" d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/>',
    'smile': '<circle class="ps" cx="12" cy="12" r="8.8"/><path class="pf" d="M8.1 13.2c.9 2 2.2 3 3.9 3s3-1 3.9-3Z"/><circle class="plf" cx="8.8" cy="10" r="1.1"/><circle class="plf" cx="15.2" cy="10" r="1.1"/>',
    'meh': '<circle class="ps" cx="12" cy="12" r="8.8"/><path class="pf" d="M8.3 14h7.4v2H8.3Z"/><circle class="plf" cx="8.8" cy="10" r="1.1"/><circle class="plf" cx="15.2" cy="10" r="1.1"/>',
    'cloud-rain': '<path class="ps" d="M7.4 15.4h9.7a3.8 3.8 0 0 0 .6-7.5 5.7 5.7 0 0 0-10.9 1.8A2.9 2.9 0 0 0 7.4 15.4Z"/><path class="pf" d="M8.3 18.2 7.2 21M12 18.2 10.9 21M15.7 18.2 14.6 21"/>',
    'droplets': '<path class="pf" d="M8.2 3.6C6.1 6.4 5 8.4 5 10.3a3.2 3.2 0 0 0 6.4 0c0-1.9-1.1-3.9-3.2-6.7Z"/><path class="ps" d="M16.4 7.1c-2.3 3.1-3.5 5.2-3.5 7.3a3.5 3.5 0 0 0 7 0c0-2.1-1.2-4.2-3.5-7.3Z"/><path class="pl" d="M15.4 15.8a2 2 0 0 0 2.2-2"/>',
    'dumbbell': '<path class="pf" d="M3.2 9.2h3.2v5.6H3.2zM17.6 9.2h3.2v5.6h-3.2z"/><path class="ps" d="M6.4 7.6h2.8v8.8H6.4zM14.8 7.6h2.8v8.8h-2.8z"/><path class="pl" d="M9.2 12h5.6M2 12h1.2M20.8 12H22"/>',
    'book-open': '<path class="ps" d="M4 5.4h5.1A3 3 0 0 1 12 8.4v11.1a3.9 3.9 0 0 0-3.1-1.5H4Z"/><path class="pf" d="M20 5.4h-5.1A3 3 0 0 0 12 8.4v11.1a3.9 3.9 0 0 1 3.1-1.5H20Z"/><path class="pl" d="M8 9h1.7M8 12h1.7M14.3 9H16M14.3 12H16"/>',
    'graduation-cap': '<path class="pf" d="M2.8 8.5 12 4.2l9.2 4.3-9.2 4.3Z"/><path class="ps" d="M7.1 11v4.2c1.3 1.3 2.9 2 4.9 2s3.6-.7 4.9-2V11L12 12.8Z"/><path class="pl" d="M21.2 8.5v5.1M21.2 13.6l-1.3 2.1"/>',
    'file-text': '<path class="ps" d="M5.3 3.2h8.2l5.2 5.2v12.4H5.3Z"/><path class="pf" d="M13.5 3.2v5.2h5.2"/><path class="pl" d="M8.5 12.1h7M8.5 15.2h7M8.5 18.3h4.6"/>',
    'medal': '<path class="ps" d="M7 3.4h10l-2.2 6.1H9.2Z"/><circle class="pf" cx="12" cy="15" r="5.5"/><path class="pwf" d="m12 12.2.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3Z"/>',
    'heart': '<path class="pf" d="M12 20.3S4.2 15.7 4.2 9.6A4.1 4.1 0 0 1 11.7 7 4.1 4.1 0 0 1 19.8 9.6c0 6.1-7.8 10.7-7.8 10.7Z"/><path class="pl" d="M12 20.3S4.2 15.7 4.2 9.6A4.1 4.1 0 0 1 11.7 7 4.1 4.1 0 0 1 19.8 9.6c0 6.1-7.8 10.7-7.8 10.7Z"/>',
    'brain': '<path class="ps" d="M8.5 4.2a3.4 3.4 0 0 0-3.3 4.1A4.2 4.2 0 0 0 6.4 16a3.9 3.9 0 0 0 4.2 3.5H12V5.8a3.6 3.6 0 0 0-3.5-1.6Z"/><path class="pf" d="M15.5 4.2a3.4 3.4 0 0 1 3.3 4.1A4.2 4.2 0 0 1 17.6 16a3.9 3.9 0 0 1-4.2 3.5H12V5.8a3.6 3.6 0 0 1 3.5-1.6Z"/><path class="pl" d="M8 8.1a3 3 0 0 1 4 .5M16 8.1a3 3 0 0 0-4 .5M7.2 13.4a3.2 3.2 0 0 0 3.4 1.2M16.8 13.4a3.2 3.2 0 0 1-3.4 1.2"/>',
    'crown': '<path class="pf" d="M4.4 18.5h15.2l1-10.4-4.7 3.7L12 4.1l-3.9 7.7-4.7-3.7Z"/><path class="pl" d="M4.4 18.5h15.2M6.2 21h11.6M12 4.1v7.4"/>',
    'chevron-left': '<path class="ps" d="M14.8 5.2 8 12l6.8 6.8"/><path class="pl" d="M9 12h10"/>',
    'chevron-right': '<path class="ps" d="m9.2 5.2 6.8 6.8-6.8 6.8"/><path class="pl" d="M15 12H5"/>',
    'calendar-check': '<rect class="ps" x="3.3" y="4.7" width="17.4" height="15.3" rx="3"/><path class="pf" d="M6.3 4.7h11.4a3 3 0 0 1 3 3v2H3.3v-2a3 3 0 0 1 3-3Z"/><path class="pl" d="M8 3v4M16 3v4"/><path class="pw" d="m8.2 15 2.2 2.2 5.5-6.2"/>',
    'download': '<path class="ps" d="M5 19.5h14a2 2 0 0 0 2-2v-2.2H3v2.2a2 2 0 0 0 2 2Z"/><path class="pf" d="M10.7 3.4h2.6v8l3-3 1.8 1.8L12 16.3 5.9 10.2l1.8-1.8 3 3Z"/>',
    'upload': '<path class="ps" d="M5 19.5h14a2 2 0 0 0 2-2v-2.2H3v2.2a2 2 0 0 0 2 2Z"/><path class="pf" d="M13.3 16.2h-2.6v-8l-3 3-1.8-1.8L12 3.3l6.1 6.1-1.8 1.8-3-3Z"/>',
    'trash-2': '<path class="ps" d="M6.3 7.3h11.4l-.9 12a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8Z"/><path class="pf" d="M9.1 4.3h5.8l.8 3H8.3Z"/><path class="pl" d="M4.7 7.3h14.6M10 11v5.8M14 11v5.8"/>',
    'save': '<path class="ps" d="M4 4h12.7L20 7.3V20H4Z"/><path class="pf" d="M7.2 4h7.4v5.2H7.2Z"/><path class="pwf" d="M7.4 14.3h9.2V20H7.4Z"/><path class="pl" d="M9.2 16.2h5.6"/>',
    'log-in': '<path class="ps" d="M13.4 4.4h5.2a2 2 0 0 1 2 2v11.2a2 2 0 0 1-2 2h-5.2"/><path class="pf" d="m10.6 7.5 4.5 4.5-4.5 4.5v-3H3.4v-3h7.2Z"/>',
    'log-out': '<path class="ps" d="M10.6 4.4H5.4a2 2 0 0 0-2 2v11.2a2 2 0 0 0 2 2h5.2"/><path class="pf" d="m13.4 7.5 4.5 4.5-4.5 4.5v-3H6.2v-3h7.2Z"/>',
    'hard-drive': '<rect class="ps" x="3.5" y="5" width="17" height="14" rx="3"/><path class="pf" d="M5.4 13.5h13.2V19H5.4Z"/><circle class="pwf" cx="16.8" cy="16.2" r="1.1"/><path class="pl" d="M7.2 16.2h5.2M8.1 8.7h7.8"/>',
    'lock': '<rect class="ps" x="5" y="10" width="14" height="10" rx="3"/><path class="pf" d="M8.1 10V7.7a3.9 3.9 0 0 1 7.8 0V10"/><circle class="pwf" cx="12" cy="15" r="1.3"/>',
    'alert-triangle': '<path class="ps" d="M10.1 4.7 2.9 17.4A2.1 2.1 0 0 0 4.7 20.5h14.6a2.1 2.1 0 0 0 1.8-3.1L13.9 4.7a2.2 2.2 0 0 0-3.8 0Z"/><path class="pf" d="M10.8 9h2.4v5.5h-2.4Z"/><circle class="plf" cx="12" cy="17" r="1.1"/>',
    'x': '<circle class="ps" cx="12" cy="12" r="8.6"/><path class="pl" d="m8.7 8.7 6.6 6.6M15.3 8.7l-6.6 6.6"/>',
    'check': '<circle class="ps" cx="12" cy="12" r="8.6"/><path class="pf" d="m7.6 12.3 2.9 2.9 6-6.8"/>',
    'trophy': '<path class="ps" d="M7 4h10v5.2A5 5 0 0 1 12 14a5 5 0 0 1-5-4.8Z"/><path class="pf" d="M9.5 18h5l.8 3H8.7Z"/><path class="pl" d="M7 6H4.5a3 3 0 0 0 3 4M17 6h2.5a3 3 0 0 1-3 4M12 14v4"/>',
    'coins': '<ellipse class="ps" cx="12" cy="6.2" rx="6.4" ry="3.2"/><path class="pf" d="M5.6 6.2v5.6c0 1.8 2.9 3.2 6.4 3.2s6.4-1.4 6.4-3.2V6.2"/><path class="pl" d="M5.6 9.1c0 1.8 2.9 3.2 6.4 3.2s6.4-1.4 6.4-3.2M5.6 12c0 1.8 2.9 3.2 6.4 3.2s6.4-1.4 6.4-3.2"/>',
    'swords': '<path class="ps" d="m4 20 6.1-6.1M14 10 20 4M17.5 3.5 20.5 6.5M3.5 17.5l3 3"/><path class="pf" d="m4 4 6 6M14 14l6 6M3.5 6.5l3-3M17.5 20.5l3-3"/>',
    'users': '<path class="ps" d="M8.6 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2.9 20a5.7 5.7 0 0 1 11.4 0"/><path class="pf" d="M16 12.3a3.2 3.2 0 1 0 0-6.4M15.6 15.1A4.7 4.7 0 0 1 21.1 20"/>',
    'user-plus': '<path class="ps" d="M9 12a4.1 4.1 0 1 0 0-8.2A4.1 4.1 0 0 0 9 12ZM3 20a6 6 0 0 1 12 0"/><circle class="pf" cx="18" cy="10" r="3.8"/><path class="pw" d="M18 7.9v4.2M15.9 10h4.2"/>',
    'bar-chart-2': '<rect class="ps" x="4" y="10" width="3.8" height="9" rx="1.4"/><rect class="pf" x="10.1" y="5" width="3.8" height="14" rx="1.4"/><rect class="ps" x="16.2" y="8" width="3.8" height="11" rx="1.4"/>',
    'bot': '<rect class="ps" x="4.2" y="7" width="15.6" height="11.8" rx="4"/><path class="pf" d="M8 7V5a4 4 0 0 1 8 0v2Z"/><circle class="pwf" cx="8.8" cy="12.4" r="1.2"/><circle class="pwf" cx="15.2" cy="12.4" r="1.2"/><path class="pw" d="M9.2 16h5.6M3 12h1.2M19.8 12H21"/>',
    'send': '<path class="pf" d="M3.5 4.2 21 12 3.5 19.8l2.8-7.8Z"/><path class="pw" d="M6.3 12H21"/><path class="pl" d="m3.5 4.2 2.8 7.8-2.8 7.8L21 12Z"/>',
    'flag': '<path class="ps" d="M5.2 3.8v17.4"/><path class="pf" d="M5.2 4.8h11.6l-1.9 4.1 1.9 4.1H5.2Z"/><path class="pl" d="M5.2 13h11.6"/>',
    'message-circle': '<path class="ps" d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5c0 1.6-.4 3.1-1.2 4.4L21 20.5l-4.1-1.7A8.5 8.5 0 1 1 12 3.5Z"/><path class="pf" d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5c0 1.6-.4 3.1-1.2 4.4L21 20.5l-4.1-1.7A8.5 8.5 0 0 1 12 3.5Z"/><path class="pw" d="M8 11.5h8M8 14.5h5"/>',
    'copy': '<rect class="ps" x="8" y="8" width="12" height="12" rx="2.5"/><path class="pf" d="M4 16V6a2 2 0 0 1 2-2h10"/><path class="pl" d="M4 16V6a2 2 0 0 1 2-2h10"/>'
  };

  function fallbackIcon() {
    return '<rect class="ps" x="4" y="4" width="16" height="16" rx="5"/><path class="pf" d="M12 6.5 15.2 12 12 17.5 8.8 12Z"/>';
  }

  function iconNameFromSvg(svg) {
    var classes = Array.prototype.slice.call(svg.classList || []);
    for (var i = 0; i < classes.length; i++) {
      if (classes[i].indexOf('lucide-') === 0 && classes[i] !== 'lucide-icon') {
        return classes[i].replace('lucide-', '');
      }
    }
    return null;
  }

  function makeSvg(name, oldSvg) {
    var hasIcon = Object.prototype.hasOwnProperty.call(ICONS, name);
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('data-premium-icon', name);
    if (!hasIcon) svg.setAttribute('data-premium-fallback', 'true');
    svg.setAttribute('width', oldSvg.getAttribute('width') || '16');
    svg.setAttribute('height', oldSvg.getAttribute('height') || '16');
    svg.setAttribute('class', 'premium-icon premium-icon-' + name + ' lucide lucide-' + name);
    svg.innerHTML =
      '<g class="premium-icon-layer" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">' +
      (hasIcon ? ICONS[name] : fallbackIcon()) +
      '</g>';
    return svg;
  }

  function upgradePremiumIcons(root) {
    root = root || document;
    var svgs = root.querySelectorAll('svg.lucide:not([data-premium-icon])');
    svgs.forEach(function (svg) {
      var name = iconNameFromSvg(svg);
      if (!name) return;
      svg.replaceWith(makeSvg(name, svg));
    });
  }

  function patchLucide() {
    if (!window.lucide || !window.lucide.createIcons || window.lucide.__lifeflowPremiumPatched) return false;
    var original = window.lucide.createIcons.bind(window.lucide);
    window.lucide.createIcons = function () {
      var result = original.apply(window.lucide, arguments);
      requestAnimationFrame(function () { upgradePremiumIcons(document); });
      return result;
    };
    window.lucide.__lifeflowPremiumPatched = true;
    requestAnimationFrame(function () { upgradePremiumIcons(document); });
    return true;
  }

  if (!patchLucide()) {
    document.addEventListener('DOMContentLoaded', function () {
      patchLucide();
      upgradePremiumIcons(document);
    });
  }

  window.lifeflowPremiumIcons = {
    refresh: function () { upgradePremiumIcons(document); }
  };
})();
