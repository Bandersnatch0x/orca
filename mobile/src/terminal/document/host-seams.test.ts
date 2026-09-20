// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { TerminalDocumentScope } from './document-scope'

/**
 * The four host seams the page sets, and the window reads they default to.
 *
 * The document reached its host through `window.ReactNativeWebView` and built its engine from
 * `window.Terminal` and the two addon globals the engine bundle installs. On the page neither is
 * available the way the document assumes: `window.ReactNativeWebView` is the *shell's* bridge, so
 * a terminal notify posted through it would put raw terminal JSON into the bridge's own channel,
 * and there is no engine bundle at all because the page imports xterm as a module.
 *
 * So each of the four is a scope field. The default is the window read the document already did,
 * unchanged and still performed at call time rather than captured when the scope is built; the
 * page assigns the field instead. Both halves are asserted here, because a seam whose default
 * quietly stopped reading the window would leave the native document mute with every other
 * terminal test still green — they stub those globals and would be stubbing nothing.
 */

const SURFACE_MARKUP =
  '<div id="terminal-container"><div id="terminal-surface"></div></div>' +
  '<div id="selection-overlay"><div id="sel-handle-start"></div>' +
  '<div id="sel-handle-end"></div><div id="sel-menu">' +
  '<button id="sel-menu-copy"></button><button id="sel-menu-all"></button></div></div>' +
  '<div id="scroll-indicator"><div id="scroll-thumb"></div></div>'

// Imported after the markup exists: the document's modules read their elements as they are
// parsed, exactly as they do inside the WebView, and a static import would run them against an
// empty body and leave the surface null.
let createTerminalDocumentScope: () => TerminalDocumentScope
let scope: TerminalDocumentScope
let handleMsg: typeof import('./host-message-router').handleMsg
let notify: typeof import('./host-notify').notify
let flog: typeof import('./viewport-transform').flog
let attachWebglAddon: typeof import('./webgl-recovery').attachWebglAddon

beforeAll(async () => {
  document.body.innerHTML = SURFACE_MARKUP
  // The document is one script whose modules run in a pinned order, and three of them read their
  // elements as they run: `runtime-constants` takes the surface, `surface-swap` takes the surface
  // it was handed, `selection-state-and-eviction` takes the overlay. Reached in that order here
  // for the same reason the generator emits them in it.
  await import('./runtime-constants')
  await import('./surface-swap')
  await import('./selection-state-and-eviction')
  const documentScope = await import('./document-scope')
  createTerminalDocumentScope = documentScope.createTerminalDocumentScope
  scope = documentScope.scope
  ;({ handleMsg } = await import('./host-message-router'))
  ;({ notify } = await import('./host-notify'))
  ;({ flog } = await import('./viewport-transform'))
  ;({ attachWebglAddon } = await import('./webgl-recovery'))
})

function terminalDouble() {
  const loaded: unknown[] = []
  let opened: HTMLElement | undefined
  const terminal = {
    cols: 80,
    rows: 24,
    options: { theme: {}, minimumContrastRatio: 3, fontSize: 13 },
    buffer: { active: { baseY: 0, viewportY: 0, cursorY: 0, length: 1, type: 'normal' } },
    get element() {
      return opened
    },
    unicode: { activeVersion: '6' },
    loaded,
    write(_data: string, callback?: () => void) {
      callback?.()
    },
    open(element: HTMLElement) {
      opened = element
    },
    loadAddon: (addon: unknown) => loaded.push(addon),
    attachCustomKeyEventHandler() {},
    onData: () => ({ dispose() {} }),
    onLineFeed: () => ({ dispose() {} }),
    onScroll: () => ({ dispose() {} }),
    onWriteParsed: () => ({ dispose() {} }),
    clear() {},
    reset() {},
    refresh() {},
    resize() {},
    selectAll() {},
    select() {},
    clearSelection() {},
    scrollLines() {},
    scrollToLine() {},
    scrollToBottom() {},
    dispose() {}
  }
  return terminal
}

/** Restores every field a case assigns, so one of them cannot leave the singleton scope moved. */
function withSeams(seams: Partial<TerminalDocumentScope>, run: () => void) {
  const previous: Record<string, unknown> = {}
  for (const key of Object.keys(seams)) {
    previous[key] = Object.getOwnPropertyDescriptor(scope, key)?.value
  }
  Object.assign(scope, seams)
  try {
    run()
  } finally {
    Object.assign(scope, previous)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the document host seams, by default', () => {
  it('posts to the React Native bridge, reading it at call time', () => {
    const postMessage = vi.fn<(data: string) => void>()
    // Built before the global exists: the default must read the window when it posts, not when
    // the scope was created, because the document's scope is built as its script is parsed.
    const built = createTerminalDocumentScope()
    vi.stubGlobal('ReactNativeWebView', { postMessage })
    built.postToHost({ type: 'ready', cols: 80, rows: 24 })
    expect(postMessage.mock.calls).toEqual([['{"type":"ready","cols":80,"rows":24}']])
  })

  it('posts nothing when there is no bridge, which is the guard the document carried', () => {
    expect(() => createTerminalDocumentScope().postToHost({ type: 'ready' })).not.toThrow()
  })

  it('builds the terminal from the engine bundle global', () => {
    const constructed: Record<string, unknown>[] = []
    function TerminalStub(this: unknown, options: Record<string, unknown>) {
      constructed.push(options)
    }
    vi.stubGlobal('Terminal', TerminalStub)
    const term = createTerminalDocumentScope().createTerminal({ cols: 80, rows: 24 })
    expect(constructed).toEqual([{ cols: 80, rows: 24 }])
    expect(term).toBeInstanceOf(TerminalStub)
  })

  it('builds each addon from its engine global, and answers null when the engine has none', () => {
    const built = createTerminalDocumentScope()
    expect(built.createUnicode11Addon()).toBe(null)
    expect(built.createWebglAddon()).toBe(null)
    class Unicode11Addon {
      dispose() {}
    }
    class WebglAddon {
      dispose() {}
    }
    vi.stubGlobal('Unicode11Addon', { Unicode11Addon })
    vi.stubGlobal('WebglAddon', { WebglAddon })
    expect(built.createUnicode11Addon()).toBeInstanceOf(Unicode11Addon)
    expect(built.createWebglAddon()).toBeInstanceOf(WebglAddon)
  })
})

describe('the document host seams, once the page sets them', () => {
  it('routes every notify to the field and nothing to the bridge', () => {
    const postMessage = vi.fn<(data: string) => void>()
    vi.stubGlobal('ReactNativeWebView', { postMessage })
    const posted: Record<string, unknown>[] = []
    withSeams({ postToHost: (message) => posted.push(message) }, () => {
      notify({ type: 'pong', pingId: 7 })
      flog('probe', { n: 1 })
    })
    expect(posted).toEqual([
      { type: 'pong', pingId: 7 },
      { type: 'log', tag: '[fit]probe', payload: { n: 1 } }
    ])
    // The whole reason the seam exists: on the page this object belongs to the shell.
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('routes a host message into the document and builds the engine from the fields', () => {
    const terminal = terminalDouble()
    const options: Record<string, unknown>[] = []
    const unicodeAddon = { dispose() {} }
    const webglAddon = { dispose() {} }
    const posted: Record<string, unknown>[] = []
    withSeams(
      {
        createTerminal: (created) => {
          options.push(created)
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the double implements every member `init` reaches; the calls below are what check it.
          return terminal as unknown as ReturnType<typeof scope.createTerminal>
        },
        createUnicode11Addon: () => unicodeAddon,
        createWebglAddon: () => webglAddon,
        postToHost: (message) => posted.push(message)
      },
      () => {
        handleMsg({ type: 'init', cols: 80, rows: 24, initialData: '', preserveScroll: false })
        expect(options).toHaveLength(1)
        expect(options[0]!.cols).toBe(80)
        expect(terminal.loaded).toContain(webglAddon)
        expect(terminal.loaded).toContain(unicodeAddon)
        expect(terminal.unicode.activeVersion).toBe('11')
        // The other direction: a document-side report reaches the page's sink, not the bridge.
        handleMsg({ type: 'ping', id: 3 })
        expect(posted).toContainEqual({ type: 'pong', pingId: 3 })
      }
    )
  })

  it('reports no webgl addon as a DOM-renderer fallback rather than as a failure', () => {
    withSeams({ createWebglAddon: () => null }, () => {
      expect(attachWebglAddon(true)).toBe(false)
    })
  })
})
