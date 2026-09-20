import { readdir } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'

/**
 * What the render fixture gives back when it never finishes starting.
 *
 * The handle is the only way to close it, so a setup that throws before returning one leaves the
 * caller nothing to call: `afterAll` has no fixture, and the listening socket and the scratch tree
 * stay where they are. The socket is the part that bites — an open server handle keeps the vitest
 * worker alive after its last test has reported, so the file hangs rather than failing.
 *
 * The browser is the step that fails in practice and the last one taken, so by then everything
 * else is allocated. It is made to fail the way it actually does, by pointing the launch at an
 * executable that is not there, rather than by standing a double in front of Playwright.
 */

const SCRATCH_PREFIX = 'orca-c75-terminal-render-'
const describeFixture = mobileWebAppDependenciesPresent() ? describe : describe.skip

// The port the fixture served on, which it never hands out and which `close` makes unreachable.
// Recorded through the real server rather than a double: what is under test is whether the thing
// that was actually listening stopped.
const { ports } = vi.hoisted(() => ({ ports: [] }))
vi.mock('./mobile-web-app-render-harness.mjs', async (importOriginal) => {
  const harness = await importOriginal()
  return {
    ...harness,
    createBundleServer: async (options) => {
      const served = await harness.createBundleServer(options)
      ports.push(served.server.address().port)
      return served
    }
  }
})

const { startTerminalRenderFixture } = await import('./mobile-web-app-terminal-render-fixture.mjs')

/** Whether a connection to this port is refused, which is what a closed listener answers. */
function refusesConnections(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    socket.on('connect', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(true))
  })
}

async function scratchDirectories() {
  const entries = await readdir(tmpdir())
  return entries.filter((entry) => entry.startsWith(SCRATCH_PREFIX)).sort()
}

describeFixture('the terminal render fixture', () => {
  it('takes back the server and the scratch tree when the browser will not start', async () => {
    const scratchBefore = await scratchDirectories()
    const realBrowser = process.env.ORCA_MOBILE_WEB_RENDER_BROWSER
    process.env.ORCA_MOBILE_WEB_RENDER_BROWSER = join(tmpdir(), 'orca-c75-no-such-browser')
    try {
      // Named, not merely thrown: a build that broke for its own reason would also reject, and
      // would satisfy a bare `toThrow` while saying nothing about the rollback under test. It
      // also has to be the original error and not whatever the cleanup raised on its way out.
      await expect(startTerminalRenderFixture()).rejects.toThrow(
        /Failed to launch chromium because executable doesn't exist/
      )
    } finally {
      if (realBrowser === undefined) {
        delete process.env.ORCA_MOBILE_WEB_RENDER_BROWSER
      } else {
        process.env.ORCA_MOBILE_WEB_RENDER_BROWSER = realBrowser
      }
    }

    // The precondition: the launch has to have been reached with a server already listening, or
    // there is nothing for the rollback to have released and the refusal below means nothing.
    expect(ports, 'the setup got as far as serving the bundle').toHaveLength(1)
    expect(await refusesConnections(ports[0])).toBe(true)
    expect(await scratchDirectories()).toEqual(scratchBefore)
  }, 600_000)
})
