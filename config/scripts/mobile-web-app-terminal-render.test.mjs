import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium } from 'playwright-core'
import { buildMobileWebAppBundle } from './build-mobile-web-app-bundle.mjs'
import { MOBILE_WEB_APP_ROUTE_ROOT } from './mobile-web-app-route-manifest.mjs'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'
import {
  COLS,
  CONTROL_SOURCE,
  escapeDenseStream,
  FIRST_MARKER,
  LAST_MARKER,
  LAYOUT_SOURCE,
  MIN_STREAM_BYTES,
  probeRouteSource,
  ROWS,
  scrollbackRows
} from './mobile-web-app-terminal-probe-route.mjs'
import {
  createBundleServer,
  installCspViolationRecorder,
  installPageErrorSentinel,
  installSchedulerRecorder,
  installShellDouble,
  readBridgeFaultGrant,
  readBridgeProtocolVersion,
  readShellCsp
} from './mobile-web-app-render-harness.mjs'

/**
 * The page's terminal, in a real browser, under the policy the shell sends.
 *
 * Everything below the contract is new on the page: xterm is an import rather than a 612 KiB
 * string in a WebView document, the document's modules run in the page's own realm, and the
 * stylesheet and the elements they read by id are planted by the component. None of that is
 * settled by a module test. What a browser settles is whether it opens at all under
 * `script-src 'self'` with no `unsafe-inline` and no `unsafe-eval`, whether a real terminal byte
 * stream reaches the buffer intact, and whether anything the page does is refused by the policy.
 *
 * The stream is deliberately escape-dense: colour changes, cursor moves and erases at every cell
 * boundary, which is the shape that expands worst through the transport and the shape a TUI
 * actually paints. It is read back through the document's own selection path — select all, then
 * the Copy button the overlay carries — so the oracle is the component's `onSelectionCopy` prop
 * and not a private reach into xterm.
 *
 * No route serves this screen until C7.7, so the component is bundled through a scratch route
 * tree. That step retires the moment the session route is registered.
 */

const projectDir = fileURLToPath(new URL('../..', import.meta.url))
const mobileDir = join(projectDir, 'mobile')

const PROBE_ROUTE = '/h/terminal-probe'
const CONTROL_ROUTE = '/h/terminal-control'
const PAGE_ROUTE_PATTERNS = [PROBE_ROUTE, CONTROL_ROUTE]
const SHELL_SESSION_ID = 'terminal-render-session'
const SHELL_BUILD_ID = 'terminal-render-build'
const SHELL_HOST = {
  id: 'terminal-render-host',
  name: 'Terminal Render Host',
  endpoint: 'ws://terminal-render',
  lastConnected: 1
}

const bundles = mobileWebAppDependenciesPresent()
const describeRender = bundles ? describe : describe.skip

let scratch
let server
let browser
let origin
let cspHeader = null
let bridgeVersion = null
let faultGrant = null
let controlCspViolations = []
const stream = escapeDenseStream()

beforeAll(async () => {
  if (!bundles) {
    return
  }
  cspHeader = await readShellCsp()
  bridgeVersion = await readBridgeProtocolVersion()
  faultGrant = await readBridgeFaultGrant()
  scratch = await mkdtemp(join(tmpdir(), 'orca-c75-terminal-render-'))
  const appDir = join(scratch, 'app')
  const routeDir = join(appDir, MOBILE_WEB_APP_ROUTE_ROOT)
  await mkdir(routeDir, { recursive: true })
  await writeFile(join(routeDir, '_layout.tsx'), LAYOUT_SOURCE)
  // Extensionless, so the bundler resolves the `.web.tsx` sibling exactly as it would for a real
  // route. Naming the `.tsx` would mount the WebView wrapper no browser can render.
  await writeFile(
    join(routeDir, 'terminal-probe.tsx'),
    probeRouteSource(join(mobileDir, 'src', 'terminal', 'TerminalWebView'))
  )
  await writeFile(join(routeDir, 'terminal-control.tsx'), CONTROL_SOURCE)
  const built = await buildMobileWebAppBundle({
    appDir,
    outDir: join(scratch, 'bundle'),
    pageRoutes: [
      { pathname: PROBE_ROUTE, grants: [] },
      { pathname: CONTROL_ROUTE, grants: [] }
    ]
  })
  const served = await createBundleServer({ outDir: built.outDir, cspHeader })
  server = served.server
  origin = served.origin
  const executablePath = process.env.ORCA_MOBILE_WEB_RENDER_BROWSER
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
}, 600_000)

afterAll(async () => {
  await browser?.close()
  server?.close()
  if (scratch) {
    await rm(scratch, { recursive: true, force: true })
  }
})

async function openPage(
  pathname,
  { errorSentinel = false, scheduler = false, beforeNavigate } = {}
) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await beforeNavigate?.(page)
  if (scheduler) {
    await page.addInitScript(installSchedulerRecorder)
  }
  await page.addInitScript(installCspViolationRecorder)
  if (errorSentinel) {
    await page.addInitScript(installPageErrorSentinel)
  }
  await page.addInitScript(installShellDouble, {
    version: bridgeVersion,
    sessionId: SHELL_SESSION_ID,
    buildId: SHELL_BUILD_ID,
    route: { pathname, params: {} },
    host: SHELL_HOST,
    storage: {},
    faultGrant,
    grants: [faultGrant],
    pageRoutes: PAGE_ROUTE_PATTERNS,
    replies: {}
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`)
    }
  })
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.documentElement.dataset.orcaWebEntry === 'mounted', {
    timeout: 60_000,
    polling: 250
  })
  return { errors, page }
}

async function openTerminal(options) {
  const opened = await openPage(PROBE_ROUTE, options)
  await opened.page.waitForFunction(() => globalThis.__orcaTerminalReady === true, {
    timeout: 60_000,
    polling: 100
  })
  return opened
}

/** Violations this page recorded that the control did not, which is the terminal's own account. */
async function terminalCspViolations(page) {
  const seen = await page.evaluate(() => globalThis.__orcaCspViolations)
  const shared = new Set(controlCspViolations.map(stripAssetPath))
  return seen.map(stripAssetPath).filter((entry) => !shared.has(entry))
}

/** The asset name is a content hash and the port is per run; neither is part of the finding. */
function stripAssetPath(entry) {
  return entry.replace(/ @ .*$/, '')
}

/**
 * The markup, then `init`, then the engine.
 *
 * xterm is opened by the document's `init`, not by the mount: the component plants the elements
 * and the modules read them, and the terminal appears on the first host command. So the order
 * here is the order a session screen uses, and each step is waited for rather than assumed —
 * `.xterm` before `init` would time out on a page that was working perfectly.
 */
async function openProbeTerminal(page) {
  await page.locator('#terminal-container').waitFor({ state: 'attached', timeout: 30_000 })
  await page.evaluate(
    ([cols, rows]) => globalThis.__orcaTerminalProbe.init(cols, rows, ''),
    [COLS, ROWS]
  )
  // Attached rather than visible: the replacement surface is hidden until its writes drain, and
  // the commit that reveals it is the last step of the same rAF chain `awaitReady` waits on.
  await page.locator('#terminal-surface .xterm').waitFor({ state: 'attached', timeout: 30_000 })
  await page.evaluate(() => globalThis.__orcaTerminalProbe.awaitReady())
}

describeRender(
  'the terminal on the page',
  () => {
    it('records what the page refuses before any terminal is on it', async () => {
      // Run first, and the two cases below subtract it, so their zero is the terminal's own
      // account rather than the bundle's. A control that mounted nothing would report nothing for
      // the wrong reason, so the route's own marker is the precondition.
      const { page } = await openPage(CONTROL_ROUTE)
      await page.waitForFunction(() => globalThis.__orcaTerminalControlMounted === true, {
        timeout: 60_000,
        polling: 100
      })
      controlCspViolations = await page.evaluate(() => globalThis.__orcaCspViolations)
      console.log('[c7.5][csp-control]', JSON.stringify(controlCspViolations.map(stripAssetPath)))
      // Nothing, which is a stronger fact than this case was built for. It first read
      // `script-src: eval` — Zod probing for a JIT with `new Function` and swallowing the throw,
      // so no page error and no console line reported it — and main's jitless banner closed that
      // before this branch merged it. The subtraction stays: it is what makes the cases below say
      // "the terminal added none" rather than "none were seen".
      expect(controlCspViolations.map(stripAssetPath)).toEqual([])
      await page.close()
    }, 300_000)

    it('opens xterm under the shipped policy and paints a dense stream into its buffer', async () => {
      const { errors, page } = await openTerminal()
      await openProbeTerminal(page)
      const applied = await page.evaluate((data) => {
        globalThis.__orcaTerminalProbe.write(data)
        return data.length
      }, stream)
      expect(applied).toBeGreaterThanOrEqual(MIN_STREAM_BYTES)

      // Read back through the document's own path: select all, then the overlay's Copy button,
      // which posts the buffer text to the component's onSelectionCopy prop.
      await page.evaluate(() => globalThis.__orcaTerminalProbe.selectAll())
      await page.waitForFunction(
        () => document.getElementById('selection-overlay')?.classList.contains('active') === true,
        { timeout: 30_000, polling: 100 }
      )
      await page.evaluate(() => document.getElementById('sel-menu-copy').click())
      await page.waitForFunction(() => typeof globalThis.__orcaTerminalCopied === 'string', {
        timeout: 30_000,
        polling: 100
      })
      const copied = await page.evaluate(() => globalThis.__orcaTerminalCopied)
      console.log(
        '[c7.5][stream]',
        JSON.stringify({ appliedBytes: applied, readBackChars: copied.length })
      )
      expect(copied).toContain(FIRST_MARKER)
      expect(copied).toContain(LAST_MARKER)
      // The escapes were consumed by the parser rather than printed as text.
      expect(copied).not.toContain('\u001b')
      expect(copied).not.toContain('[31;1m')

      expect(await terminalCspViolations(page)).toEqual([])
      expect(await page.evaluate(() => globalThis.__orcaTerminalEngineErrors)).toEqual([])
      expect(errors).toEqual([])
      await page.close()
    }, 300_000)

    it('leaves the page its own window.onerror across mount and dispose', async () => {
      // The page installs a handler before the bundle loads, so the terminal meets one that is
      // not its to take. Identity is checked in the page: the same function object at all three
      // points, not merely a non-null one and not merely the same shape.
      const { page } = await openTerminal({ errorSentinel: true })
      expect(await page.evaluate(() => window.onerror === globalThis.__orcaSentinel)).toBe(true)
      await openProbeTerminal(page)
      expect(await page.evaluate(() => window.onerror === globalThis.__orcaSentinel)).toBe(true)

      // Both reporters see the same uncaught error: the page keeps the one it installed, and the
      // terminal's own listener still works. Without the second half the readings above would
      // pass on a terminal that had simply stopped reporting.
      await page.evaluate(() => {
        setTimeout(() => {
          throw new Error('orca-terminal-render-uncaught')
        }, 0)
      })
      const sawIt = (entries) =>
        entries.some((entry) => entry.includes('orca-terminal-render-uncaught'))
      await page.waitForFunction(
        () =>
          globalThis.__orcaTerminalEngineErrors.some((entry) =>
            entry.includes('orca-terminal-render-uncaught')
          ),
        { timeout: 30_000, polling: 100 }
      )
      expect(sawIt(await page.evaluate(() => globalThis.__orcaSentinelCalls))).toBe(true)

      // Dispose takes the terminal's listener off and leaves the page's handler where it was.
      await page.evaluate(() => globalThis.__orcaTerminalProbe.setMounted(false))
      await page.locator('#terminal-container').waitFor({ state: 'detached', timeout: 30_000 })
      expect(await page.evaluate(() => window.onerror === globalThis.__orcaSentinel)).toBe(true)
      const before = await page.evaluate(() => {
        setTimeout(() => {
          throw new Error('orca-terminal-render-after-dispose')
        }, 0)
        return globalThis.__orcaTerminalEngineErrors.length
      })
      await page.waitForFunction(
        () =>
          globalThis.__orcaSentinelCalls.some((entry) =>
            entry.includes('orca-terminal-render-after-dispose')
          ),
        { timeout: 30_000, polling: 100 }
      )
      // The page's handler saw it and the terminal's did not, which is what dispose has to mean.
      expect(await page.evaluate(() => globalThis.__orcaTerminalEngineErrors.length)).toBe(before)
      await page.close()
    }, 300_000)

    it('installs no window.onerror on a page that had none', async () => {
      // The other half: with nothing installed the terminal must not leave one behind either, so
      // a later consumer still finds the slot free.
      const { page } = await openTerminal()
      expect(await page.evaluate(() => window.onerror)).toBe(null)
      await openProbeTerminal(page)
      expect(await page.evaluate(() => window.onerror)).toBe(null)
      await page.evaluate(() => globalThis.__orcaTerminalProbe.setMounted(false))
      await page.locator('#terminal-container').waitFor({ state: 'detached', timeout: 30_000 })
      expect(await page.evaluate(() => window.onerror)).toBe(null)
      await page.close()
    }, 300_000)

    /**
     * A terminal that is mounted, taken down and mounted again has to be a terminal again.
     *
     * The document's modules are ES modules: their bodies run once per page, so anything they did
     * as they were parsed — reading their elements by id, installing the error reporter, adding
     * listeners — a second mount would inherit from the first, pointing at elements that are no
     * longer in the document. Nothing above the contract would notice: `onWebReady` still fires,
     * because readiness is the component's own handshake and not a claim about the engine.
     *
     * So the assertions are about the live DOM and the live paths, not about readiness.
     */
    async function assertLiveTerminal(page, label) {
      await page.locator('#terminal-surface .xterm').waitFor({ state: 'attached', timeout: 30_000 })
      expect(
        await page.evaluate(() => document.querySelectorAll('#terminal-surface .xterm').length),
        `${label}: xterm elements in the live DOM`
      ).toBeGreaterThan(0)

      // The selection overlay is the document's own element, reached through the handle: it only
      // activates if `handleMsg` is talking to the elements that are actually on the page.
      await page.evaluate(() => globalThis.__orcaTerminalProbe.selectAll())
      await page.waitForFunction(
        () => document.getElementById('selection-overlay')?.classList.contains('active') === true,
        { timeout: 30_000, polling: 100 }
      )

      // And the reporter, which is the seam that is installed once per mount.
      const marker = `orca-remount-${label}`
      await page.evaluate((thrown) => {
        globalThis.__orcaTerminalEngineErrors = []
        setTimeout(() => {
          throw new Error(thrown)
        }, 0)
      }, marker)
      await page.waitForFunction(
        (thrown) => globalThis.__orcaTerminalEngineErrors.some((entry) => entry.includes(thrown)),
        marker,
        { timeout: 30_000, polling: 100 }
      )
    }

    it('is a live terminal again after an unmount and a remount', async () => {
      const { page } = await openTerminal()
      await openProbeTerminal(page)
      await assertLiveTerminal(page, 'first-mount')

      await page.evaluate(() => globalThis.__orcaTerminalProbe.setMounted(false))
      await page.locator('#terminal-container').waitFor({ state: 'detached', timeout: 30_000 })
      await page.evaluate(() => {
        globalThis.__orcaTerminalReady = false
        globalThis.__orcaTerminalProbe.setMounted(true)
      })
      await page.waitForFunction(() => globalThis.__orcaTerminalReady === true, {
        timeout: 60_000,
        polling: 100
      })
      await openProbeTerminal(page)
      await assertLiveTerminal(page, 'remount')
      await page.close()
    }, 300_000)

    it('is a live terminal again after the user reloads a failed one', async () => {
      // The other way a second mount happens, and the one a user reaches: the terminal fails
      // before it is ready, the engine-error overlay appears, and Reload disposes the document
      // and builds another inside the same component. Driven end to end rather than by calling
      // the handler — an uncaught error before the first `init` is fatal by the document's own
      // rule, which is what puts the overlay on screen.
      const { page } = await openTerminal()
      await page.locator('#terminal-container').waitFor({ state: 'attached', timeout: 30_000 })
      await page.evaluate(() => {
        setTimeout(() => {
          throw new Error('orca-terminal-render-fatal')
        }, 0)
      })
      const reload = page.getByText('Reload')
      await reload.waitFor({ timeout: 30_000 })

      await page.evaluate(() => {
        globalThis.__orcaTerminalReady = false
      })
      await reload.click()
      await page.waitForFunction(() => globalThis.__orcaTerminalReady === true, {
        timeout: 60_000,
        polling: 100
      })
      await openProbeTerminal(page)
      await assertLiveTerminal(page, 'after-reload')
      await page.close()
    }, 300_000)

    it('names the cause when the document chunk will not load', async () => {
      // The component reaches the document through a dynamic import, so the document is its own
      // chunk and the chunk can fail: offline, a hashed filename that no longer exists after a
      // deploy, a module that throws as it evaluates. That is a rejected promise and nothing
      // else — no engine ran, so no `error` notify is ever posted. Without the rejection being
      // routed it is an unhandled rejection and a blank frame until the 15 s readiness watchdog.
      //
      // The fault is the real one: the chunk is identified by what it carries and refused at the
      // wire, rather than a stub swapped in for the mount.
      // A string literal only `host-notify` carries, so the chunk is recognised by its contents
      // rather than by a filename that is a content hash or by a declaration name a minifier
      // renames. It has to be unique to the document: the route's own chunk carries the
      // component, the controller and the notification dispatcher, and refusing that one would
      // take the whole route down instead of the document.
      const documentChunkMarker = 'terminal runtime error'
      let aborted = null
      const served = []
      const { page } = await openPage(PROBE_ROUTE, {
        beforeNavigate: async (opened) => {
          await opened.route('**/*.js', async (route) => {
            const response = await route.fetch()
            const body = await response.text()
            served.push(route.request().url())
            if (aborted === null && body.includes(documentChunkMarker)) {
              aborted = route.request().url()
              await route.abort('failed')
              return
            }
            await route.fulfill({ response, body })
          })
        }
      })
      // The chunk is fetched when the component mounts, which is after the page entry is up, so
      // the refusal is waited for rather than asserted on the way past. A run where nothing
      // matched would otherwise fail below for the wrong reason.
      await expect
        .poll(() => aborted, {
          timeout: 60_000,
          message: `no served script carried the document; saw ${served.join(', ')}`
        })
        .not.toBe(null)
      await page.waitForFunction(
        () =>
          (globalThis.__orcaTerminalEngineErrors ?? []).some((entry) =>
            entry.includes('terminal document failed to load')
          ),
        undefined,
        { timeout: 60_000, polling: 100 }
      )
      // And the user-visible half: the overlay, with its Reload, rather than a blank frame.
      await page.getByText('Reload').waitFor({ timeout: 30_000 })
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await page.close()
    }, 300_000)

    it('still reports runtime errors after a first mount spent the non-fatal budget', async () => {
      // Ruling 21's finding, end to end. `reportEngineError` caps non-fatal notifies at five so a
      // per-frame thrower cannot flood the host. That counter is the document's, not the mount's:
      // a first terminal that spends it leaves the second one mute, reporting nothing however it
      // fails, while every other signal — readiness, paint, selection — says the terminal is fine.
      const { page } = await openTerminal()
      await openProbeTerminal(page)
      await page.evaluate(() => {
        for (let index = 0; index < 6; index++) {
          setTimeout(() => {
            throw new Error(`orca-budget-burn-${String(index)}`)
          }, 0)
        }
      })
      await page.waitForFunction(
        () =>
          globalThis.__orcaTerminalEngineErrors.filter((entry) =>
            entry.includes('orca-budget-burn')
          ).length >= 5,
        { timeout: 30_000, polling: 100 }
      )

      await page.evaluate(() => globalThis.__orcaTerminalProbe.setMounted(false))
      await page.locator('#terminal-container').waitFor({ state: 'detached', timeout: 30_000 })
      await page.evaluate(() => {
        globalThis.__orcaTerminalReady = false
        globalThis.__orcaTerminalProbe.setMounted(true)
      })
      await page.waitForFunction(() => globalThis.__orcaTerminalReady === true, {
        timeout: 60_000,
        polling: 100
      })
      await openProbeTerminal(page)

      await page.evaluate(() => {
        globalThis.__orcaTerminalEngineErrors = []
        setTimeout(() => {
          throw new Error('orca-second-mount-error')
        }, 0)
      })
      await page.waitForFunction(
        () =>
          globalThis.__orcaTerminalEngineErrors.some((entry) =>
            entry.includes('orca-second-mount-error')
          ),
        { timeout: 30_000, polling: 100 }
      )
      await page.close()
    }, 300_000)

    it('cancels its frames and timers, so none of the first mount runs into the second', async () => {
      // The other half of the same rule. A frame or timer the first terminal scheduled has no
      // owner after dispose, and on the second mount it acts on the terminal that replaced it —
      // refitting a grid nobody resized, scrolling a buffer nobody touched.
      // The document is its own chunk, and the point is what *it* scheduled: xterm's renderer
      // schedules frames of its own that a disposed terminal simply ignores, and the browser
      // cannot unschedule those. So the chunk is identified on the wire, by a literal only
      // `host-notify` carries, and a leak is a callback that chunk scheduled.
      let documentChunk = null
      const { page } = await openPage(PROBE_ROUTE, {
        scheduler: true,
        beforeNavigate: async (opened) => {
          await opened.route('**/*.js', async (route) => {
            const response = await route.fetch()
            const body = await response.text()
            if (body.includes('terminal runtime error')) {
              documentChunk = new URL(route.request().url()).pathname
            }
            await route.fulfill({ response, body })
          })
        }
      })
      await page.waitForFunction(() => globalThis.__orcaTerminalReady === true, {
        timeout: 60_000,
        polling: 100
      })
      await openProbeTerminal(page)
      expect(documentChunk, 'the document was served as its own chunk').not.toBe(null)
      // Enough rows for a scrollback, so the wheel below reveals the scroll indicator: that is
      // the document's longest-lived piece of scheduled work, a 550 ms timer to hide it again,
      // which outlives an unmount even on a loaded machine. The same wheel leaves the
      // smooth-scroll frame owed. Both are asked for in the task that tells the component to go.
      await page.evaluate((rows) => globalThis.__orcaTerminalProbe.write(rows), scrollbackRows())
      await page.evaluate(() => {
        globalThis.__orcaScheduler.watching = true
        const surface = document.getElementById('terminal-surface')
        surface.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -400, bubbles: true, cancelable: true })
        )
        globalThis.__orcaTerminalProbe.setMounted(false)
      })
      await page.locator('#terminal-container').waitFor({ state: 'detached', timeout: 30_000 })
      // The boundary is drawn here rather than at `setMounted(false)`: React unmounts on its own
      // schedule, and a callback that runs while the first terminal is still up is not a leak.
      await page.evaluate(() => {
        globalThis.__orcaScheduler.mount += 1
        globalThis.__orcaTerminalReady = false
        globalThis.__orcaTerminalProbe.setMounted(true)
      })
      await page.waitForFunction(() => globalThis.__orcaTerminalReady === true, {
        timeout: 60_000,
        polling: 100
      })
      await openProbeTerminal(page)
      // Long enough for any frame or timer of the first mount to have fired if it survived.
      await page.evaluate(() => new Promise((resolve) => globalThis.setTimeout(resolve, 3000)))
      const scheduler = await page.evaluate(() => globalThis.__orcaScheduler)
      // The precondition: there was something to leak. A wheel that reached nothing would agree
      // with the empty list below for the wrong reason.
      expect(
        scheduler.scheduled.filter(
          (entry) => entry.mount === 0 && entry.caller.includes(documentChunk)
        ).length
      ).toBeGreaterThan(0)
      expect(scheduler.leaked.filter((entry) => entry.includes(documentChunk))).toEqual([])
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await page.close()
    }, 300_000)

    it('styles only what it owns, and leaves the application alone', async () => {
      // The document's sheet says `*`, `html` and `body` because inside a WebView it owns the
      // page. Appended to the head of a React Native Web application it owns nothing: those three
      // selectors set the application's background, its overflow and every element's box model,
      // on every screen the shell can show, and go on doing it after the terminal is gone.
      //
      // Ruling 19's shape: the page mount may style only what it owns. So the document-level
      // rules are never injected and every remaining selector is held under the host's class.
      // The oracle is a page of the same application with no terminal on it.
      const readRoots = (target) =>
        target.evaluate(() => {
          const read = (element) => {
            const computed = getComputedStyle(element)
            const entries = []
            for (const property of computed) {
              entries.push(`${property}: ${computed.getPropertyValue(property)}`)
            }
            return entries.join('\n')
          }
          return { body: read(document.body), html: read(document.documentElement) }
        })

      const control = await openPage(CONTROL_ROUTE)
      const expected = await readRoots(control.page)
      await control.page.close()

      const { page } = await openTerminal()
      await openProbeTerminal(page)
      expect(await readRoots(page), 'roots while the terminal is mounted').toEqual(expected)

      // And nothing in the sheet reaches past the host, which is the rule the comparison above
      // cannot see: a selector that matched something outside would not have to change `body`.
      const reach = () =>
        page.evaluate(() => {
          const sheet = [...document.styleSheets].find(
            (one) => one.ownerNode?.id === 'orca-terminal-document-style'
          )
          if (!sheet) {
            return { rules: 0, outside: ['the terminal stylesheet is not in the head'] }
          }
          const host = document.querySelector('.orca-terminal-document-host')
          const outside = []
          for (const rule of sheet.cssRules) {
            for (const element of document.querySelectorAll(rule.selectorText)) {
              if (!host || !host.contains(element)) {
                outside.push(`${rule.selectorText} matched ${element.tagName}`)
              }
            }
          }
          return { rules: sheet.cssRules.length, outside }
        })
      const mounted = await reach()
      // The precondition: there are rules to escape with.
      expect(mounted.rules).toBeGreaterThan(0)
      expect(mounted.outside).toEqual([])

      await page.evaluate(() => globalThis.__orcaTerminalProbe.setMounted(false))
      await page.locator('#terminal-container').waitFor({ state: 'detached', timeout: 30_000 })
      expect(await readRoots(page), 'roots after dispose').toEqual(expected)
      // The sheet stays in the head for the next mount, and matches nothing until there is one.
      const disposed = await reach()
      expect(disposed.rules).toBe(mounted.rules)
      expect(disposed.outside).toEqual([])
      await page.close()
    }, 300_000)

    it('measures a fit through the handle and records what beforeinput reports', async () => {
      const { page } = await openTerminal()
      await openProbeTerminal(page)

      // The handle's own round trip: a measure is a command in and a notify back, and on the page
      // both halves are direct calls rather than a bridge. Null would mean the document answered
      // nothing, or answered a grid too small to fit.
      const fit = await page.evaluate(() => globalThis.__orcaTerminalProbe.measure())
      expect(fit).not.toBeNull()
      expect(fit.cols).toBeGreaterThanOrEqual(20)
      expect(fit.rows).toBeGreaterThanOrEqual(8)

      // xterm's own textarea is inert by the document's design — `query-reply.ts` makes it
      // read-only, untabbable and `inputmode=none` so touch and hardware keys go to the screen's
      // input instead. Asserted rather than assumed, because it is why the probe below types
      // somewhere else.
      const textarea = await page.evaluate(() => {
        const element = document.querySelector('#terminal-surface .xterm-helper-textarea')
        return element === null
          ? null
          : {
              readOnly: element.readOnly,
              tabIndex: element.tabIndex,
              inputMode: element.getAttribute('inputmode')
            }
      })
      expect(textarea).toEqual({ readOnly: true, tabIndex: -1, inputMode: 'none' })

      // Design §8's cheap half of the IME question: what a browser reports for text entering a
      // terminal on the page, which arrives at the screen's own input. A composing IME on a real
      // soft keyboard is the device step, which this does not claim to answer.
      await page.getByTestId('terminal-live-input').focus()
      await page.keyboard.type('ab')
      await page.waitForFunction(() => globalThis.__orcaTerminalBeforeInput.length >= 2, {
        timeout: 30_000,
        polling: 100
      })
      const beforeInput = await page.evaluate(() => globalThis.__orcaTerminalBeforeInput)
      console.log('[c7.5][beforeinput]', JSON.stringify(beforeInput.slice(0, 4)))
      expect(beforeInput.map((entry) => entry.inputType)).toContain('insertText')
      expect(beforeInput.map((entry) => entry.data)).toContain('a')
      expect(beforeInput.every((entry) => entry.isComposing === false)).toBe(true)
      expect(await terminalCspViolations(page)).toEqual([])
      await page.close()
    }, 300_000)
  },
  900_000
)
