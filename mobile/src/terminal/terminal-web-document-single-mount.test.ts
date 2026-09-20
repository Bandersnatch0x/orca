// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { mountTerminalWebDocument } from './terminal-web-document-mount'

/**
 * One live document per page, and the undo that frees the page for the next one.
 *
 * `document-scope` is a module singleton: every module in `document/` reads that one object, so
 * two mounts at once would not be two terminals but two drivers of the same fields and the same
 * elements. The component cannot reach that state — it mounts and disposes in one effect — which
 * is why the refusal is named here rather than left to surface as two terminals overwriting each
 * other's surface. The second half is the one the page actually uses: dispose has to give the
 * page back, or a remount and the error overlay's Reload would both be refused.
 */
describe('the page terminal document', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('refuses a second mount while one is live, and takes it back on dispose', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const second = document.createElement('div')
    document.body.appendChild(second)

    const mounted = await mountTerminalWebDocument(host, () => {})
    await expect(mountTerminalWebDocument(second, () => {})).rejects.toThrow(
      'the terminal document is already mounted on this page'
    )

    mounted.dispose()
    const remounted = await mountTerminalWebDocument(second, () => {})
    expect(second.querySelector('#terminal-container')).not.toBe(null)
    remounted.dispose()
  })

  it('gives the page back when the mount itself fails, so Reload can try again', async () => {
    // The overlay's Reload path. A mount that threw holds nothing, and a flag left set would
    // refuse every later attempt — the document's chunk failing to load is exactly that case.
    const detached = document.createElement('div')
    Object.defineProperty(detached, 'innerHTML', {
      set() {
        throw new Error('orca-mount-failed')
      },
      get() {
        return ''
      }
    })
    await expect(mountTerminalWebDocument(detached, () => {})).rejects.toThrow('orca-mount-failed')

    const host = document.createElement('div')
    document.body.appendChild(host)
    const mounted = await mountTerminalWebDocument(host, () => {})
    expect(host.querySelector('#terminal-container')).not.toBe(null)
    mounted.dispose()
  })
})
