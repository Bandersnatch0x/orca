import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { buildMobileWebAppBundle } from './build-mobile-web-app-bundle.mjs'
import { MOBILE_WEB_APP_ROUTE_ROOT } from './mobile-web-app-route-manifest.mjs'
import {
  COLS,
  CONTROL_SOURCE,
  LAYOUT_SOURCE,
  probeRouteSource,
  ROWS
} from './mobile-web-app-terminal-probe-route.mjs'
import {
  createBundleServer,
  installCspViolationRecorder,
  installListenerRecorder,
  installPageErrorSentinel,
  installSchedulerRecorder,
  installShellDouble,
  readBridgeFaultGrant,
  readBridgeProtocolVersion,
  readShellCsp
} from './mobile-web-app-render-harness.mjs'

/**
 * The scratch bundle the terminal render check runs against, and the two ways to open a page on it.
 *
 * Its own module because the check's cases are the thing under review and the server, the browser
 * and the scratch route tree are not. Nothing here is module-scoped: the fixture holds what it
 * built in the closures it hands back, so two of them could not read each other's browser.
 */

const projectDir = fileURLToPath(new URL('../..', import.meta.url))
const mobileDir = join(projectDir, 'mobile')

export const PROBE_ROUTE = '/h/terminal-probe'
export const CONTROL_ROUTE = '/h/terminal-control'
const PAGE_ROUTE_PATTERNS = [PROBE_ROUTE, CONTROL_ROUTE]
const SHELL_SESSION_ID = 'terminal-render-session'
const SHELL_BUILD_ID = 'terminal-render-build'
const SHELL_HOST = {
  id: 'terminal-render-host',
  name: 'Terminal Render Host',
  endpoint: 'ws://terminal-render',
  lastConnected: 1
}

/** Builds the bundle, serves it under the shell's own policy, and launches the browser. */
export async function startTerminalRenderFixture() {
  const cspHeader = await readShellCsp()
  const bridgeVersion = await readBridgeProtocolVersion()
  const faultGrant = await readBridgeFaultGrant()
  const scratch = await mkdtemp(join(tmpdir(), 'orca-c75-terminal-render-'))
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
  const { origin, server } = await createBundleServer({ outDir: built.outDir, cspHeader })
  const executablePath = process.env.ORCA_MOBILE_WEB_RENDER_BROWSER
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {})
  })

  async function openPage(
    pathname,
    { errorSentinel = false, listeners = false, scheduler = false, beforeNavigate } = {}
  ) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await beforeNavigate?.(page)
    if (scheduler) {
      await page.addInitScript(installSchedulerRecorder)
    }
    if (listeners) {
      await page.addInitScript(installListenerRecorder)
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

  return {
    openPage,
    openTerminal,
    close: async () => {
      await browser.close()
      server.close()
      await rm(scratch, { recursive: true, force: true })
    }
  }
}

/**
 * The markup, then `init`, then the engine.
 *
 * xterm is opened by the document's `init`, not by the mount: the component plants the elements
 * and the modules read them, and the terminal appears on the first host command. So the order
 * here is the order a session screen uses, and each step is waited for rather than assumed —
 * `.xterm` before `init` would time out on a page that was working perfectly.
 */
export async function openProbeTerminal(page) {
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
