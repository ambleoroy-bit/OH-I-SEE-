// OH I SEE — Lucide-style SVG icons for Requirements step (single icon system)
(function (root) {
  'use strict';

  const S = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  function svg(body) {
    return `<svg ${S} aria-hidden="true">${body}</svg>`;
  }

  const ICONS = {
    residential: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    villa: svg('<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 21v-6h6v6"/>'),
    apartment: svg('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01M9 18h.01M15 18h.01"/>'),
    commercial: svg('<path d="M3 21h18"/><path d="M6 21V7l6-4 6 4v14"/><path d="M9 21v-4h6v4"/>'),
    renovation: svg('<path d="m15 5 4 4"/><path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13"/><path d="m2 22 5.5-1.5L21.17 6.83a2.82 2.82 0 0 0-4-4L3.5 16.5Z"/>'),
    other: svg('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
  };

  root.RequirementsIcons = {
    get: (key) => ICONS[key] || ICONS.other,
    render: (key) => ICONS[key] || ICONS.other,
  };
})(typeof window !== 'undefined' ? window : global);
