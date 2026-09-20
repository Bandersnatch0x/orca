import type {
  TerminalDocumentTerminal,
  TerminalDocumentWebglAddon
} from './document-terminal-shape'

/**
 * The four seams between the document and whatever is hosting it, as the document's own defaults.
 *
 * Inside the WebView the host is React Native and the engine is an IIFE that hangs its
 * constructors off `window`; on the page the host is the component that mounted these modules and
 * the engine is an import. Each function below is the window read the document already did, kept
 * as a read at call time rather than a value captured when the script is parsed, and the scope
 * carries it as a field the page assigns over.
 */

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
