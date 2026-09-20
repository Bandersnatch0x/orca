import { Terminal } from '@xterm/xterm'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import type { TerminalDocumentWebglAddon } from './document/document-terminal-shape'
import { TERMINAL_DOCUMENT_MARKUP, TERMINAL_DOCUMENT_STYLE } from './terminal-webview-html'
import { XTERM_ENGINE_CSS } from './terminal-webview-engine-css.generated'
import type { TerminalWebViewCommand } from './terminal-webview-messages'

/**
 * The terminal document, mounted in the page instead of in a WebView.
 *
 * Same program: the modules the WebView's script is generated from, run here in the order the
 * generator emits them. What the WebView's HTML gave them — the stylesheet, the elements they read
 * by id, the engine on `window` and a `postMessage` back to React Native — this supplies instead,
 * through the four scope seams and the host's own element.
 *
 * The modules are reached by dynamic imports on purpose, and in two steps. They read their
 * elements as they are parsed, so the markup has to be in the document first and a static import
 * would hoist above the planting and leave every one of them holding null. And one seam —
 * the error reporter — is *called* as they are parsed rather than later, so the scope is reached
 * on its own first and every field is set before a single module runs.
 */

export type TerminalWebDocument = {
  /** Hands one host command to the document, as `postMessage` does inside the WebView. */
  send: (command: TerminalWebViewCommand & { id: number }) => void
  dispose: () => void
}

const STYLE_ELEMENT_ID = 'orca-terminal-document-style'

/**
 * The stylesheet, planted in the head once per document.
 *
 * `<style>` rather than a constructed sheet or inline attributes: the document's own rules and
 * xterm's are written against ids and classes, and this is the same text the WebView's `<head>`
 * carries. It stays in the head after unmount, because a second terminal on the same page would
 * want it and re-parsing 6 KiB per mount is the only thing removing it would buy.
 */
function ensureDocumentStyle() {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = `${XTERM_ENGINE_CSS}\n${TERMINAL_DOCUMENT_STYLE}`
  document.head.appendChild(style)
}

/**
 * The WebGL addon, or null when the browser refuses it.
 *
 * `webgl-recovery` treats null as the DOM renderer, which is the fallback the document already
 * has for a context loss; the page reaches it one step earlier, when the context was never
 * granted at all. The caller is told, because a terminal quietly on the slow renderer is worth a
 * line in the log rather than a silent halving of the drain rate.
 */
function createPageWebglAddon(onFallback: (reason: string) => void) {
  try {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the addon's public surface is `dispose`, which the document's shape names; the two optional members it also reads are absent here and guarded at every call.
    return new WebglAddon() as unknown as TerminalDocumentWebglAddon
  } catch (error) {
    onFallback(error instanceof Error ? error.message : String(error))
    return null
  }
}

export async function mountTerminalWebDocument(
  host: HTMLElement,
  receive: (message: Record<string, unknown>) => void
): Promise<TerminalWebDocument> {
  ensureDocumentStyle()
  host.innerHTML = TERMINAL_DOCUMENT_MARKUP
  // The WebView's `<head>` declares this before anything runs, and the document's error reporter
  // reads it unguarded. Without it the first report throws inside `window.onerror`.
  window.__engineErrors = []

  // The scope alone, before the modules that read it: `host-notify` installs the error reporter
  // as it is parsed, so a field set after the whole document had loaded would be set after the
  // default had already run.
  const { scope } = await import('./document/document-scope')

  // Ruling 19 reaches `window.onerror` too: the WebView's document owns its page and may take
  // that handler, but this one is a guest. An `error` listener reports the same failures without
  // displacing whatever the page installed, and it is removed on dispose. Held here so the
  // listener can be taken off again.
  let errorListener: ((event: ErrorEvent) => void) | null = null
  scope.installErrorReporter = (report) => {
    errorListener = (event) => {
      report(event.message, event.filename, event.lineno, event.colno, event.error)
    }
    window.addEventListener('error', errorListener)
  }

  scope.postToHost = receive
  scope.createTerminal = (options) =>
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: xterm's own Terminal is the engine the document was written against; its options are declared optional where the document's shape declares them present, which is the only difference.
    new Terminal(options) as unknown as ReturnType<typeof scope.createTerminal>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the addon's public surface is `dispose`, which the document's shape names; the two optional members it also reads are absent here and guarded there.
  scope.createUnicode11Addon = () => new Unicode11Addon() as unknown as TerminalDocumentWebglAddon
  scope.createWebglAddon = () =>
    createPageWebglAddon((reason) =>
      receive({
        type: 'log',
        tag: '[fit]webgl-unavailable',
        payload: { renderer: 'dom', message: reason }
      })
    )

  // Now the document itself, with every seam already in place.
  const documentModules = await import('./document/page-document-modules')

  // `message-bridge` is not imported (ruling 19), so its one non-bridge duty is re-armed here:
  // a viewport change has to re-fit, or opening the keyboard leaves the terminal at the old scale.
  const onWindowResize = () => {
    documentModules.applyFitScale('window-resize')
    documentModules.adjustRowsForViewport()
    documentModules.repositionOverlay()
    documentModules.clampPan()
    documentModules.updateTransform()
  }
  window.addEventListener('resize', onWindowResize)

  return {
    send: (command) => {
      documentModules.handleMsg(command)
    },
    dispose: () => {
      window.removeEventListener('resize', onWindowResize)
      if (errorListener) {
        window.removeEventListener('error', errorListener)
        errorListener = null
      }
      try {
        scope.term?.dispose()
      } catch {}
      scope.term = null
      host.innerHTML = ''
    }
  }
}
