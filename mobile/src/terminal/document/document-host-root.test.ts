// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { createTerminalDocument } from '../terminal-webview-document-factory.generated'
import type { TerminalDocumentTerminal } from './document-terminal-shape'
import { TERMINAL_DOCUMENT_MARKUP } from '../terminal-webview-html'

/**
 * Two documents on one page read their own elements.
 *
 * Ruling 22 gave each call its own scope, which left the element reads as the last thing two
 * documents shared: they were `document.getElementById`, and the ids are in the markup every host
 * plants, so the second document's start sequence found the first host's surface, overlay, handles
 * and menu. Both documents then drove one terminal, and the second host stayed empty.
 *
 * It is reachable rather than theoretical. expo-router keeps the outgoing screen mounted for the
 * length of a stack transition, so two routes that both hold a terminal have two live documents on
 * the page while the animation runs.
 *
 * The oracle is where the engine opens. `term.open(element)` is the one call that says which
 * surface a document is actually driving, and it is read off the seam rather than off the scope,
 * which no caller can reach.
 */
/**
 * The engine, as the shape the seam promises rather than as a cast.
 *
 * Every member is here because the type names it; the ones the start sequence and `init` actually
 * reach do something, and the rest answer in the shape their caller would read. `open` is the one
 * the assertions want, and where it was called is handed back beside the terminal so the double
 * itself carries nothing the shape does not declare.
 */
function terminalDouble() {
  let openedOn: HTMLElement | undefined
  const terminal: TerminalDocumentTerminal = {
    cols: 80,
    rows: 24,
    options: { theme: {}, minimumContrastRatio: 3, fontSize: 13 },
    buffer: {
      active: {
        length: 1,
        viewportY: 0,
        baseY: 0,
        cursorY: 0,
        type: 'normal',
        getLine: () => undefined
      }
    },
    get element() {
      return openedOn
    },
    unicode: { activeVersion: '6' },
    write(_data: string, callback?: () => void) {
      callback?.()
    },
    open(element: HTMLElement) {
      openedOn = element
    },
    loadAddon() {},
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
  return { terminal, openedOn: () => openedOn }
}

/** One host element carrying the document's markup, as the page's mount plants it. */
function plantHost(id: string) {
  const host = document.createElement('div')
  host.id = id
  host.innerHTML = TERMINAL_DOCUMENT_MARKUP
  document.body.appendChild(host)
  return host
}

function startDocumentIn(host: HTMLElement) {
  const engine = terminalDouble()
  const posted: Array<Record<string, unknown>> = []
  const started = createTerminalDocument({
    root: host,
    postToHost: (message) => {
      posted.push(message)
    },
    hasEngine: () => true,
    installHostTransport: () => () => {},
    installErrorReporter: () => () => {},
    paintDocumentBackground: () => {},
    createTerminal: () => engine.terminal,
    createUnicode11Addon: () => null,
    createWebglAddon: () => null
  })
  started.send({ type: 'init', cols: 80, rows: 24, initialData: '', preserveScroll: false })
  return { started, openedOn: engine.openedOn, posted }
}

/**
 * Two fingers landing on one surface, as the page's dispatcher sees them.
 *
 * `document` rather than the surface, because the four dispatcher listeners are document-level —
 * which is the whole reason a touch in one host reached the other host's document.
 */
function fireTwoFingerTouchStart(surface: HTMLElement) {
  const event = new Event('touchstart', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', {
    value: [0, 1].map((identifier) => ({
      identifier,
      clientX: 10 + identifier * 20,
      clientY: 10,
      target: surface
    }))
  })
  Object.defineProperty(event, 'target', { value: surface })
  document.dispatchEvent(event)
}

function surfaceOf(host: HTMLElement) {
  const surface = host.querySelector<HTMLElement>('#terminal-surface')
  if (surface === null) {
    throw new Error(`${host.id} carries no surface`)
  }
  return surface
}

/** Both documents in select mode, with what they posted getting there discarded. */
function selectAllInBoth(...documents: Array<ReturnType<typeof startDocumentIn>>) {
  for (const started of documents) {
    started.started.send({ type: 'do-select-all' })
    expect(started.posted.map((message) => message.type)).toContain('set-select-mode')
    started.posted.length = 0
  }
}

const pinchCancels = (posted: Array<Record<string, unknown>>) =>
  posted.filter((message) => message.type === 'mobile-clip-cancel-by-pinch')

describe('two terminal documents on one page', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('opens each engine on the surface inside its own host', () => {
    const first = plantHost('first-host')
    const second = plantHost('second-host')

    // The precondition, read before either document starts: both hosts carry a surface under the
    // same id, which is the shape that made a page-wide read wrong. A page with one surface on it
    // would agree with the assertions below for no reason.
    expect(first.querySelector('#terminal-surface')).not.toBe(null)
    expect(second.querySelector('#terminal-surface')).not.toBe(null)

    const one = startDocumentIn(first)
    const two = startDocumentIn(second)

    expect(first.contains(one.openedOn() ?? null)).toBe(true)
    expect(second.contains(two.openedOn() ?? null)).toBe(true)

    one.started.stop()
    two.started.stop()
  })

  /**
   * The reviewer's repro (round 1, H1): the dispatcher's four listeners are on `document`, and the
   * two-finger branch acts before it looks at the target, so a pinch anywhere on the page dropped
   * the selection of every document on it.
   */
  it('leaves the other document alone when two fingers land in that other host', () => {
    const first = plantHost('first-host')
    const second = plantHost('second-host')
    const one = startDocumentIn(first)
    const two = startDocumentIn(second)
    selectAllInBoth(one, two)

    fireTwoFingerTouchStart(surfaceOf(second))

    expect(pinchCancels(one.posted)).toHaveLength(0)
    expect(one.posted).toEqual([])
    expect(pinchCancels(two.posted)).toHaveLength(1)

    one.started.stop()
    two.started.stop()
  })

  // The control: the same event inside the document's own host still reaches it. Without this the
  // assertion above passes for a dispatcher that ignores every touch.
  it('cancels its own selection when the two fingers land in its own host', () => {
    const first = plantHost('first-host')
    const second = plantHost('second-host')
    const one = startDocumentIn(first)
    const two = startDocumentIn(second)
    selectAllInBoth(one, two)

    fireTwoFingerTouchStart(surfaceOf(first))

    expect(pinchCancels(one.posted)).toHaveLength(1)
    expect(pinchCancels(two.posted)).toHaveLength(0)

    one.started.stop()
    two.started.stop()
  })
})
