import { DEFAULT_TERMINAL_THEME } from '../terminal-webview-html/theme'
import type { TerminalDocumentThemeMessage } from './terminal-theme'
/**
 * The state the in-WebView terminal document shares across its parts.
 *
 * The document is one function scope: 2,758 lines around 100 `var` declarations, 57 of which are
 * written from more than one place. Moving its parts into modules is what lets the web page import
 * them instead of re-implementing them, and a variable assigned from another module cannot be an
 * import — assigning an imported binding is a syntax error. So the written ones become fields here,
 * and the group that owns each is named beside it.
 *
 * Two things keep a variable out of this table. One the script never assigns again is an ordinary
 * local. One both declared and assigned inside a single group is that module's own state, however
 * often it is written — `terminalDataRepliesEnabled` is written from four places and all four are
 * in `query-reply`, so it stays a `let` there.
 *
 * Declared, not merely written: while the rest of the document is still strings, a variable the
 * main slice declares is shared even when every use of it is in one group, because the declaration
 * has nowhere else to live yet. `webglRecoveryTimer` is that case. Those can migrate out of this
 * table when the flip makes the main slice modules too, and doing it before then would emit a
 * second declaration beside the one the slice still carries.
 *
 * The table grows one group at a time as C7.1 extracts them; a field arrives with its group.
 */

/** One cell of a buffer line, as the document inspects it. */
export type TerminalDocumentCell = {
  isBgDefault: () => boolean
  isInverse: () => boolean
  isUnderline?: () => boolean
  isStrikethrough?: () => boolean
  isOverline?: () => boolean
}

/** One buffer line, as the document inspects it. */
export type TerminalDocumentLine = {
  readonly length: number
  translateToString: (trimRight: boolean) => string
  getCell?: (x: number, cell: TerminalDocumentCell | null) => TerminalDocumentCell | null
}

/** One side of xterm's buffer, as the document reads it. */
export type TerminalDocumentBuffer = {
  readonly viewportY: number
  readonly baseY: number
  readonly cursorY: number
  readonly type: string
  getNullCell?: () => TerminalDocumentCell
  getLine: (index: number) => TerminalDocumentLine | undefined
}

/** As much of xterm's terminal as the document's own code touches. */
/** A terminal colour theme: xterm reads it as a flat map of slot to CSS colour. */
export type TerminalDocumentTheme = Record<string, string>

/** The xterm options the document writes; each field is owned by the group that sets it. */
export type TerminalDocumentTerminalOptions = {
  theme: TerminalDocumentTheme
  minimumContrastRatio: number
}

export type TerminalDocumentTerminal = {
  readonly cols: number
  readonly rows: number
  readonly buffer: { readonly active: TerminalDocumentBuffer }
  readonly options: TerminalDocumentTerminalOptions
  resize: (cols: number, rows: number) => void
  refresh: (start: number, end: number) => void
  dispose: () => void
  loadAddon: (addon: TerminalDocumentWebglAddon) => void
  scrollToBottom: () => void
  scrollLines: (amount: number) => void
}

export type TerminalDocumentScope = {
  /** `terminal-init-and-write`: the live xterm terminal, or null before the first init. */
  term: TerminalDocumentTerminal | null
  /** `smooth-scroll-and-cell-geometry`: the surface's pan offset, in viewport pixels. */
  panX: number
  panY: number
  /** `terminal-init-and-write`: bumped on every re-init, so a late callback can tell it is stale. */
  terminalGeneration: number
  /** `term-observers`: xterm listener handles to dispose when the terminal is replaced. */
  termObserverDisposables: TerminalDocumentDisposable[]
  /** `terminal-init-and-write`: the row count the last init or reflow settled on. */
  initRows: number
  /** `webgl-recovery`: the loaded WebGL addon, or null on the DOM renderer. */
  webglAddon: TerminalDocumentWebglAddon | null
  /** `webgl-recovery`: the pending single retry after a context loss. */
  webglRecoveryTimer: ReturnType<typeof setTimeout> | null
  /** `runtime-state-and-text-scaling`: the theme the host last sent, replayed on visibility. */
  terminalThemeInput: TerminalDocumentThemeMessage
  /** `wheel-scroll`: sub-line wheel travel carried between events; reset by a touch scroll. */
  wheelAccumDeltaY: number
  /** `runtime-state`: the built-in theme, and the fallback for every slot a host theme omits. */
  defaultTheme: TerminalDocumentTheme
  /** `terminal-theme`: the host theme normalised against the built-in one. */
  terminalTheme: TerminalDocumentTheme
  /** `terminal-theme`: the contrast floor in force, published or derived from the background. */
  terminalMinimumContrastRatio: number
  /** `runtime-state`: the escape byte every report is prefixed with. */
  ESC: string
  /** `runtime-state`: whether the TUI asked for SGR (1006) mouse reports. */
  sgrMouseMode: boolean
  /** `runtime-state`: whether the TUI asked for SGR pixel (1016) mouse reports. */
  sgrMousePixelsMode: boolean
  /** `selection-overlay`: the press duration that starts a selection, in milliseconds. */
  LONG_PRESS_MS: number
  /** `selection-overlay`: the travel that cancels a pending long press, in pixels. */
  LONG_PRESS_SLOP: number
  /** `selection-overlay`: the travel that disqualifies a tap, in pixels. */
  TAP_SLOP: number
  /** `selection-overlay`: the longest press still counted as a tap, in milliseconds. */
  TAP_MAX_MS: number
  /** `selection-overlay`: the overlay element that carries the handles and the menu pill. */
  selectionOverlay: HTMLElement | null
  /** `selection-overlay`: the selection's leading handle element. */
  handleStart: HTMLElement | null
  /** `selection-overlay`: the selection's trailing handle element. */
  handleEnd: HTMLElement | null
  /** `selection-overlay`: `navigate` or `select`. */
  selMode: string
  /** `selection-overlay`: the live selection, or null when there is none. */
  sel: TerminalDocumentSelection | null
  /** `selection-overlay`: the pending long-press timer. */
  longPressTimer: ReturnType<typeof setTimeout> | null
  /** `selection-overlay`: where the pending long press started. */
  longPressOrigin: TerminalDocumentTouchOrigin | null
  /** `selection-overlay`: the touch that may still resolve as a tap. */
  tapCandidate: TerminalDocumentTapCandidate | null
  /** `surface-swap`: the element xterm is currently mounted on. */
  surface: HTMLElement | null
  /** `surface-swap`: the terminal of a hidden replacement surface that has not committed. */
  pendingTerm: TerminalDocumentTerminal | null
}

/** An xterm listener handle, as the document disposes of one. */
/** The live selection; only the dragged handle is read outside the overlay slice. */
export type TerminalDocumentSelection = {
  anchor: { row: number; col: number }
  focus: { row: number; col: number }
  activeHandle: string | null
}

/** Where a press began, and which finger began it. */
export type TerminalDocumentTouchOrigin = { x: number; y: number; identifier: number }

/** A touch that may still resolve as a tap: its origin, its start time and its finger. */
export type TerminalDocumentTapCandidate = TerminalDocumentTouchOrigin & { t: number }

export type TerminalDocumentDisposable = { dispose?: () => void }

/** xterm's WebGL addon, as the document loads, repaints and disposes of it. */
export type TerminalDocumentWebglAddon = {
  onContextLoss?: (listener: () => void) => void
  clearTextureAtlas?: () => void
  dispose: () => void
}

/**
 * The initial values, which are the ones the document's own declarations carried.
 *
 * A factory rather than a shared literal so a second document — a test, or a page that remounts —
 * starts from its own state instead of inheriting what the last one left.
 */
export function createTerminalDocumentScope(): TerminalDocumentScope {
  return {
    term: null,
    panX: 0,
    panY: 0,
    terminalGeneration: 0,
    termObserverDisposables: [],
    initRows: 24,
    webglAddon: null,
    webglRecoveryTimer: null,
    terminalThemeInput: null,
    defaultTheme: DEFAULT_TERMINAL_THEME,
    terminalTheme: DEFAULT_TERMINAL_THEME,
    terminalMinimumContrastRatio: 3,
    ESC: String.fromCharCode(27),
    sgrMouseMode: false,
    sgrMousePixelsMode: false,
    LONG_PRESS_MS: 500,
    LONG_PRESS_SLOP: 10,
    TAP_SLOP: 24,
    TAP_MAX_MS: 700,
    selectionOverlay: null,
    handleStart: null,
    handleEnd: null,
    selMode: 'navigate',
    sel: null,
    longPressTimer: null,
    longPressOrigin: null,
    tapCandidate: null,
    wheelAccumDeltaY: 0,
    surface: null,
    pendingTerm: null
  }
}

/** The document's own scope. The generator emits this declaration at the top of the script. */
export const scope: TerminalDocumentScope = createTerminalDocumentScope()
