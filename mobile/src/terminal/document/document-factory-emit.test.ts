import { describe, expect, it } from 'vitest'
import {
  bindScopeToHost,
  buildTerminalDocumentScript,
  TERMINAL_DOCUMENT_FACTORY_NAME,
  terminalDocumentStopCalls
} from '../../../scripts/build-terminal-document-script.mjs'
import {
  TERMINAL_DOCUMENT_HOST_SEAMS_MODULE,
  TERMINAL_DOCUMENT_MODULE_ORDER,
  TERMINAL_DOCUMENT_SCOPE_MODULE
} from '../../../scripts/terminal-document-module-order.mjs'

/**
 * The shape the generator emits, which ruling 22 makes the document itself.
 *
 * The concatenation always gave the modules one function scope with one local `scope`; naming that
 * scope a function is what lets both hosts run the same program and gives each call its own state.
 * So what is asserted here is the wrapper: the declaration, the host the scope is built from, the
 * stop sequence, the handle, and the one call the WebView makes. The body is the modules, and the
 * byte golden holds that.
 */
describe('the emitted terminal document factory', () => {
  it('declares one factory and calls it once, with no host', async () => {
    const script = await buildTerminalDocumentScript()
    expect(script.startsWith(`function ${TERMINAL_DOCUMENT_FACTORY_NAME}(host) {\n`)).toBe(true)
    // The WebView passes nothing: inside it every seam is the window read the document always did.
    expect(script.endsWith(`\n${TERMINAL_DOCUMENT_FACTORY_NAME}();`)).toBe(true)
    expect(script.split(`${TERMINAL_DOCUMENT_FACTORY_NAME}();`)).toHaveLength(2)
  })

  it('builds the scope from the factory host argument, not from the window defaults', async () => {
    // The one line the host reaches. A document that built its scope with no argument would run
    // every seam on `window`, which on the page is the shell's own bridge (ruling 19).
    const script = await buildTerminalDocumentScript()
    expect(script.split('const scope = createTerminalDocumentScope(host);')).toHaveLength(2)
    expect(script).not.toContain('const scope = createTerminalDocumentScope();')
  })

  it('refuses to emit a scope module it cannot bind to the host', () => {
    // The rewrite is textual, so a rename in the module would otherwise leave the document reading
    // the defaults with nothing to say so.
    expect(() => bindScopeToHost('const scope = makeScope();')).toThrow(
      /expected exactly one .* in the emitted scope module, found 0/
    )
  })

  it('stops in reverse module order and takes its frames back last', async () => {
    // A stop undoes what its own start did, so the last thing started is the first thing stopped;
    // the frames go last because a stop above may still have been holding one (ruling 21).
    const script = await buildTerminalDocumentScript()
    const stops = await terminalDocumentStopCalls([
      TERMINAL_DOCUMENT_HOST_SEAMS_MODULE,
      TERMINAL_DOCUMENT_SCOPE_MODULE,
      ...TERMINAL_DOCUMENT_MODULE_ORDER
    ])
    expect(stops.length).toBeGreaterThan(0)
    const body = script.slice(script.indexOf('  function stop() {'))
    const called = [...body.matchAll(/^ {4}(\w+)\(\);$/gm)].map((match) => match[1])
    expect(called).toEqual(stops.toReversed().concat('cancelDocumentFrames'))
  })

  it('hands back the document own send and stop', async () => {
    // `send` is the router the WebView already reached through its message listener; the page calls
    // it directly. `stop` is what a page dispose runs, and what the WebView never calls.
    const script = await buildTerminalDocumentScript()
    expect(script).toContain('  return { send: handleMsg, stop: stop };')
  })
})
