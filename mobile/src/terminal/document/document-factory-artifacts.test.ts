import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  buildTerminalDocumentFactoryBody,
  buildTerminalDocumentFactoryModule,
  buildTerminalDocumentScript,
  TERMINAL_DOCUMENT_FACTORY_MODULE_PATH,
  TERMINAL_DOCUMENT_FACTORY_NAME
} from '../../../scripts/build-terminal-document-script.mjs'

/**
 * The two artifacts the generator writes, held to one body (ruling 23).
 *
 * The WebView gets a string it loads; the page gets a module it imports, because building a
 * function from that string needs `eval` and the page's policy refuses it. Two files is the cost of
 * that, and the risk is the obvious one: they drift, and the terminal on the page stops being the
 * terminal on the phone while every other test stays green. So the wrappers are stripped and the
 * remainder compared byte for byte, which is also what makes the byte golden pin the page's file.
 */

/** What is left of the native script once its declaration line, closing brace and call are gone. */
function nativeFactoryBody(script: string): string {
  const open = `function ${TERMINAL_DOCUMENT_FACTORY_NAME}(host) {\n`
  const close = `\n}\n${TERMINAL_DOCUMENT_FACTORY_NAME}();`
  expect(script.startsWith(open), 'the native script opens with the factory').toBe(true)
  expect(script.endsWith(close), 'the native script ends with the closing brace and the call').toBe(
    true
  )
  return script.slice(open.length, script.length - close.length)
}

/** What is left of the page module once its header, directive, import and signature are gone. */
function pageFactoryBody(module: string): string {
  const open = `): TerminalDocument {\n`
  const at = module.indexOf(open)
  expect(at, 'the page module declares the annotated signature').toBeGreaterThan(0)
  const close = '\n}\n'
  expect(module.endsWith(close), 'the page module ends with the closing brace').toBe(true)
  return module.slice(at + open.length, module.length - close.length)
}

describe('the two terminal document artifacts', () => {
  it('carry the same factory body, byte for byte', async () => {
    const body = await buildTerminalDocumentFactoryBody()
    expect(nativeFactoryBody(await buildTerminalDocumentScript())).toBe(body)
    expect(pageFactoryBody(await buildTerminalDocumentFactoryModule())).toBe(body)
  })

  it('is on disk as the generator would write it now', async () => {
    // The page's file is gitignored and built by postinstall, so a tree whose modules moved after
    // the last build would import yesterday's document. The native script's staleness is already
    // caught by the byte golden; this is the same reading for the file beside it.
    const onDisk = await readFile(TERMINAL_DOCUMENT_FACTORY_MODULE_PATH, 'utf8')
    expect(onDisk).toBe(await buildTerminalDocumentFactoryModule())
  })

  it('gives the page a factory it can call and no call of its own', async () => {
    // A trailing call would start a document as the module was imported, which is the parse-time
    // work ruling 20 removed — and on the page it would run before any host element existed.
    const module = await buildTerminalDocumentFactoryModule()
    expect(module).toContain(`export function ${TERMINAL_DOCUMENT_FACTORY_NAME}(`)
    expect(module).not.toContain(`\n${TERMINAL_DOCUMENT_FACTORY_NAME}();`)
  })
})
