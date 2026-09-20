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
  createBundleServer,
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

const COLS = 80
const ROWS = 24
/** Design §2 measured the host's own chunker at 48 KiB, so the sample is at least one full one. */
const MIN_STREAM_BYTES = 48 * 1024
/** Printed at the top of the stream and again at the end, so the read-back covers both edges. */
const FIRST_MARKER = 'ORCA-TERMINAL-RENDER-FIRST'
const LAST_MARKER = 'ORCA-TERMINAL-RENDER-LAST'

/**
 * An escape-dense sample of at least 48 KiB: an SGR colour change every cell, an erase-to-end and
 * an absolute cursor position per row. Built here rather than committed because it is a function
 * of the grid, and a fixture sized from the constant it is meant to exercise proves nothing.
 */
function escapeDenseStream() {
  const esc = '\u001b'
  const rows = []
  rows.push(`${esc}[2J${esc}[H${FIRST_MARKER}\r\n`)
  let row = 2
  let bytes = rows[0].length
  while (bytes < MIN_STREAM_BYTES) {
    const cells = []
    for (let column = 0; column < COLS - 1; column++) {
      const colour = 31 + ((row + column) % 7)
      cells.push(`${esc}[${String(colour)};1m${String.fromCharCode(97 + ((row + column) % 26))}`)
    }
    const line = `${esc}[${String(row)};1H${esc}[K${cells.join('')}${esc}[0m\r\n`
    rows.push(line)
    bytes += line.length
    row += 1
  }
  rows.push(`${LAST_MARKER}\r\n`)
  return rows.join('')
}

/**
 * The scratch route: the component under test, its handle and its notifies on `globalThis`.
 *
 * Written rather than committed because it is the bundler's entry and nothing else — a file under
 * `mobile/app` would register a route the shell could open. `beforeinput` is recorded off the
 * xterm helper textarea, which is design §8's cheap half of the IME question: it says what the
 * browser reports for text entering a terminal on the page, and leaves a composing IME on a real
 * keyboard to the device step it cannot answer.
 */
function probeRouteSource(componentPath) {
  return `import { useCallback, useEffect, useRef } from 'react'
import { TextInput, View } from 'react-native'
import { TerminalWebView } from ${JSON.stringify(componentPath)}

export default function TerminalProbeRoute() {
  const handleRef = useRef(null)
  const onSelectionCopy = useCallback((text) => {
    globalThis.__orcaTerminalCopied = text
  }, [])
  const onWebReady = useCallback(() => {
    globalThis.__orcaTerminalReady = true
  }, [])
  const onEngineError = useCallback((message) => {
    globalThis.__orcaTerminalEngineErrors.push(message)
  }, [])
  useEffect(() => {
    globalThis.__orcaTerminalEngineErrors = globalThis.__orcaTerminalEngineErrors ?? []
    globalThis.__orcaTerminalBeforeInput = []
    globalThis.__orcaTerminalProbe = {
      init: (cols, rows, data) => handleRef.current?.init(cols, rows, data, false, []),
      write: (data) => handleRef.current?.write(data),
      selectAll: () => handleRef.current?.doSelectAll(),
      measure: () => handleRef.current?.measureFitDimensions(),
      awaitReady: () => handleRef.current?.awaitReady()
    }
    const onBeforeInput = (event) => {
      globalThis.__orcaTerminalBeforeInput.push({
        inputType: event.inputType,
        data: event.data === null ? null : String(event.data),
        isComposing: !!event.isComposing
      })
    }
    document.addEventListener('beforeinput', onBeforeInput, true)
    return () => document.removeEventListener('beforeinput', onBeforeInput, true)
  }, [])
  return (
    <View testID="terminal-probe" style={{ flex: 1 }}>
      <TerminalWebView
        ref={handleRef}
        onWebReady={onWebReady}
        onEngineError={onEngineError}
        onSelectionCopy={onSelectionCopy}
      />
      {/* The shape the terminal's live input takes on the page: xterm's own textarea is inert by
          the document's design, so this is where typed text arrives. */}
      <TextInput testID="terminal-live-input" style={{ fontSize: 16 }} />
    </View>
  )
}
`
}

/**
 * The same page with no terminal on it.
 *
 * The page entry already carries Zod, which probes for `new Function` and swallows the
 * `EvalError`, so the shell's `script-src 'self'` records one refusal on any route before a line
 * of terminal code runs. Comparing against this control is what makes "zero violations" a
 * statement about the terminal rather than about the bundle it lives in.
 */
const CONTROL_SOURCE = `import { View } from 'react-native'

export default function ControlRoute() {
  globalThis.__orcaTerminalControlMounted = true
  return <View testID="terminal-control" />
}
`

const LAYOUT_SOURCE = `import { Slot } from 'expo-router'
export default function ProbeLayout() {
  return <Slot />
}
`

/** Recorded before anything else runs, so a refusal during the page's own boot is counted. */
function installCspViolationRecorder() {
  globalThis.__orcaCspViolations = []
  document.addEventListener('securitypolicyviolation', (event) => {
    globalThis.__orcaCspViolations.push(
      `${event.violatedDirective}: ${event.blockedURI || 'inline'} @ ${event.sourceFile ?? '?'}:${String(event.lineNumber ?? 0)}`
    )
  })
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

async function openPage(pathname) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.addInitScript(installCspViolationRecorder)
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

async function openTerminal() {
  const opened = await openPage(PROBE_ROUTE)
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
      // Run first, and the two cases below subtract it. A control that mounted nothing would
      // report nothing for the wrong reason, so the route's own marker is the precondition.
      const { page } = await openPage(CONTROL_ROUTE)
      await page.waitForFunction(() => globalThis.__orcaTerminalControlMounted === true, {
        timeout: 60_000,
        polling: 100
      })
      controlCspViolations = await page.evaluate(() => globalThis.__orcaCspViolations)
      // eslint-disable-next-line no-console
      console.log('[c7.5][csp-control]', JSON.stringify(controlCspViolations.map(stripAssetPath)))
      // Zod's `new Function` probe, swallowed by its own catch, so it is not a page error and no
      // console line reports it. Pre-existing on every page route; named here so the cases below
      // subtract a known thing rather than a list.
      expect(controlCspViolations.map(stripAssetPath)).toEqual(['script-src: eval'])
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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
