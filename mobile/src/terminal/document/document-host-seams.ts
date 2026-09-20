import type {
  TerminalDocumentTerminal,
  TerminalDocumentWebglAddon
} from './document-terminal-shape'

/**
 * The five seams between the document and whatever is hosting it, as the document's own defaults.
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
 * The WebView's own installation: the document owns that page, so taking `window.onerror` is
 * taking nothing from anyone. A page mounting these modules must not, which is why this is a
 * field rather than a statement.
 */
export function installWindowErrorReporter(report: TerminalDocumentErrorReporter) {
  window.onerror = report
}
