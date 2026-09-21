// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { TERMINAL_DOCUMENT_SCRIPT } from '../terminal-webview-document-script.generated'
import { TERMINAL_DOCUMENT_MARKUP } from '../terminal-webview-html'

/**
 * The bundle runs, and it is the same document.
 *
 * Ruling 25 ends the byte pin: the phone's script is an esbuild bundle of these modules rather than
 * text a concatenator emits, so it cannot be compared line by line with a golden — and the bundler
 * renames what collides, which made every text assertion against it a match on a rename.
 *
 * What replaces it is this: the bundle is executed exactly as the WebView executes it, and then
 * driven through the transport the WebView uses. That covers the whole path no text assertion ever
 * touched — the window listener, the frame parse, the router and `init` — and it is the one thing
 * that says the bundle is a working document rather than a well-formed string.
 *
 * `tap-routing` and `wheel-scroll` run the same bundle for behaviour of their own; this is the
 * bring-up, so a failure here says the bundle is broken rather than that a gesture is.
 */
function engineDouble() {
  const opened: HTMLElement[] = []
  class Terminal {
    cols = 80
    rows = 24
    options = { theme: {}, minimumContrastRatio: 3, fontSize: 13 }
    buffer = {
      active: {
        length: 1,
        viewportY: 0,
        baseY: 0,
        cursorY: 0,
        type: 'normal',
        getLine: () => undefined
      }
    }
    unicode = { activeVersion: '6' }
    write(_data: string, callback?: () => void) {
      callback?.()
    }
    open(element: HTMLElement) {
      opened.push(element)
    }
    loadAddon() {}
    attachCustomKeyEventHandler() {}
    onData() {
      return { dispose() {} }
    }
    onLineFeed() {
      return { dispose() {} }
    }
    onScroll() {
      return { dispose() {} }
    }
    onWriteParsed() {
      return { dispose() {} }
    }
    clear() {}
    reset() {}
    refresh() {}
    resize() {}
    selectAll() {}
    select() {}
    clearSelection() {}
    scrollLines() {}
    scrollToLine() {}
    scrollToBottom() {}
    dispose() {}
  }
  return { Terminal, opened }
}

describe('the bundled native document', () => {
  it('starts, reports itself ready, and opens the engine on an init frame', () => {
    document.body.innerHTML = TERMINAL_DOCUMENT_MARKUP
    const posted: Record<string, unknown>[] = []
    const { Terminal, opened } = engineDouble()
    // The three globals the WebView's HTML declares before the script runs: the bridge it posts
    // through, the engine the script reads, and the error buffer the shell's handler fills.
    Object.assign(globalThis, {
      ReactNativeWebView: {
        postMessage: (message: string) => posted.push(JSON.parse(message))
      },
      Terminal,
      __engineErrors: []
    })

    // The WebView evaluates this string; so does this case.
    new Function(TERMINAL_DOCUMENT_SCRIPT)()

    // The document's last act at start: it has the engine, so it says so.
    expect(posted.map((message) => message.type)).toContain('web-ready')

    // And the transport it installed for itself carries a host frame into the router.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'init',
          cols: 80,
          rows: 24,
          initialData: '',
          preserveScroll: false
        })
      })
    )
    expect(opened).toHaveLength(1)
    expect(document.getElementById('terminal-surface')?.contains(opened[0]!)).toBe(true)
  })

  it('answers a ping through the bridge, which is what native readiness reads', () => {
    document.body.innerHTML = TERMINAL_DOCUMENT_MARKUP
    const posted: Record<string, unknown>[] = []
    const { Terminal } = engineDouble()
    Object.assign(globalThis, {
      ReactNativeWebView: {
        postMessage: (message: string) => posted.push(JSON.parse(message))
      },
      Terminal,
      __engineErrors: []
    })
    new Function(TERMINAL_DOCUMENT_SCRIPT)()

    window.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify({ type: 'ping', id: 9 }) })
    )
    expect(posted).toContainEqual({ type: 'pong', pingId: 9 })
  })

  it('reports a missing engine rather than starting without one', () => {
    document.body.innerHTML = TERMINAL_DOCUMENT_MARKUP
    const posted: Record<string, unknown>[] = []
    Object.assign(globalThis, {
      ReactNativeWebView: {
        postMessage: (message: string) => posted.push(JSON.parse(message))
      },
      __engineErrors: []
    })
    // The engine global is the one the bundle reads for readiness, and a script tag that failed to
    // load leaves it undefined. The precondition for the case above.
    Reflect.deleteProperty(globalThis, 'Terminal')

    new Function(TERMINAL_DOCUMENT_SCRIPT)()

    expect(posted.map((message) => message.type)).not.toContain('web-ready')
    expect(posted).toContainEqual(
      expect.objectContaining({
        type: 'error',
        fatal: true,
        message: expect.stringContaining('terminal engine missing')
      })
    )
  })
})
