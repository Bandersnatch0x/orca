import type {
  TerminalDocumentTerminal,
  TerminalDocumentWebglAddon
} from './document-terminal-shape'

/**
 * The six seams between the document and whatever is hosting it, as the document's own
 * defaults. The document reads them at seven places: `postToHost` twice, `createTerminal`,
 * `createUnicode11Addon`, `createWebglAddon`, `installErrorReporter` and
 * `paintDocumentBackground` once each.
 *
 * Inside the WebView the host is React Native and the engine is an IIFE that hangs its
 * constructors off `window`; on the page the host is the component that mounted these modules and
 * the engine is an import. Each function below is the window read or write the document already
 * did, kept at call time rather than captured when the script is parsed, and the scope carries it
 * as a field the page assigns over.
 */

/** What a thrown value can be here: an Error-shaped object, a string, or nothing. */
export type TerminalEngineError = string | null | undefined | { message?: unknown }

/** The document's runtime error reporter, taking the window error handler's own arguments. */
export type TerminalDocumentErrorReporter = (
  message: string | (Event & { message?: unknown }),
  source?: string,
  line?: number,
  column?: number,
  error?: TerminalEngineError
) => void

/**
 * The six host seams, kept out of the state above because they are the one thing a reset must
 * not touch: the page sets them once per mount, before the start sequence runs.
 */
export type TerminalDocumentHostSeams = {
  /** `host-notify`, `viewport-transform`: where a message for the host goes. */
  postToHost: (message: Record<string, unknown>) => void
  /** `terminal-init`: builds the xterm terminal. */
  createTerminal: (options: Record<string, unknown>) => TerminalDocumentTerminal
  /** `terminal-init`: builds the unicode11 addon, or answers null when the host has none. */
  createUnicode11Addon: () => TerminalDocumentWebglAddon | null
  /** `webgl-recovery`: builds the WebGL addon, or answers null when the host has none. */
  createWebglAddon: () => TerminalDocumentWebglAddon | null
  /** `host-notify`: installs the document's runtime error reporter with the host. */
  installErrorReporter: (report: TerminalDocumentErrorReporter) => () => void
  /** `terminal-theme`: paints the terminal's background behind the grid. */
  paintDocumentBackground: (background: string) => void
}

/**
 * What a host may hand the document instead of a window read.
 *
 * Every seam has a default, so a host names only the ones it owns differently: inside the WebView
 * that is none of them, and the page names all six. Absent and present-but-undefined mean the same
 * thing, which is why the scope's spread filters rather than trusting key order.
 */
export type TerminalDocumentHost = Partial<TerminalDocumentHostSeams>

/**
 * A running document: the two things a host can do to one it has started.
 *
 * `send` is the router the WebView already reached through its message listener, which the page
 * calls directly. `stop` runs every module's stop and takes back the frames the document is owed;
 * the page's dispose calls it, and the WebView never does.
 */
export type TerminalDocument = {
  send: (message: Record<string, unknown>) => void
  stop: () => void
}

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
    Unicode11Addon?: { Unicode11Addon: new () => TerminalDocumentWebglAddon }
    WebglAddon?: { WebglAddon?: new () => TerminalDocumentWebglAddon }
  }
  const Terminal: new (options: Record<string, unknown>) => TerminalDocumentTerminal
}

export function postToReactNativeWebView(message: Record<string, unknown>) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message))
  }
}

export function createEngineTerminal(options: Record<string, unknown>) {
  return new Terminal(options)
}

export function createEngineUnicode11Addon() {
  return window.Unicode11Addon && window.Unicode11Addon.Unicode11Addon
    ? new window.Unicode11Addon.Unicode11Addon()
    : null
}

export function createEngineWebglAddon() {
  return window.WebglAddon && window.WebglAddon.WebglAddon
    ? new window.WebglAddon.WebglAddon()
    : null
}

/**
 * The WebView's own background: the document owns `html` and `body` there, and the terminal's
 * theme is the page's colour. A page mounting these modules owns neither, so this is a field —
 * painting the application's roots would recolour every screen the shell can show, and leave them
 * recoloured after the terminal is gone.
 */
export function paintWindowDocumentBackground(background: string) {
  document.documentElement.style.background = background
  document.body.style.background = background
}

/**
 * The WebView's own installation: the document owns that page, so taking `window.onerror` is
 * taking nothing from anyone. A page mounting these modules must not, which is why this is a
 * field rather than a statement.
 *
 * It hands back its own undo, because ruling 20 makes the install a per-mount act and the page's
 * override is a listener that has to come off again.
 */
export function installWindowErrorReporter(report: TerminalDocumentErrorReporter) {
  window.onerror = report
  return function () {
    window.onerror = null
  }
}
