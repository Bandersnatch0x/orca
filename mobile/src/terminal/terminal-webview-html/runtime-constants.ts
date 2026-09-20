// The first declarations inside the IIFE the document shell opens.
export const TERMINAL_HTML_RUNTIME_CONSTANTS = `  var surface = document.getElementById('terminal-surface');
  var ESC = String.fromCharCode(27);
  var C1_CSI = String.fromCharCode(155);
  var CLAUDE_STATUS_DOT = String.fromCharCode(0x23fa);
  var TEXT_PRESENTATION_SELECTOR = String.fromCharCode(0xfe0e);
  var EMOJI_PRESENTATION_SELECTOR = String.fromCharCode(0xfe0f);
  var CLAUDE_STATUS_DOT_PATTERN = new RegExp(CLAUDE_STATUS_DOT + '[' + TEXT_PRESENTATION_SELECTOR + EMOJI_PRESENTATION_SELECTOR + ']*', 'g');
  var statusDotPendingSelector = false;
`
