import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium } from 'playwright-core'
import { buildMobileWebAppBundle } from './build-mobile-web-app-bundle.mjs'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'
import {
  createBundleServer,
  installShellDouble,
  readBridgeFaultGrant,
  readBridgeProtocolVersion,
  readShellCsp
} from './mobile-web-app-render-harness.mjs'

/**
 * The in-page hop the sidebar makes, in a browser, under the grants the session actually has.
 *
 * On a wide layout `app/h/_layout.tsx` renders the worktree list beside every `/h` route, and its
 * header pushes `/h/<id>/tasks` through `useRouteHandoff`. Keeping that local runs the tasks page
 * under the opener's grants, so its copy actions refuse with nothing on screen. The unit tests pin
 * the decision; only a browser proves the control exists, is reachable at that viewport, and that
 * the document does not move when the hop is handed over.
 */

const HOST_ROUTE = '/h/render-check-host'
const HOST_PATTERN = '/h/[hostId]'
const TASKS_PATTERN = '/h/[hostId]/tasks'
const SHELL_SESSION_ID = 'render-check-session'
const SHELL_BUILD_ID = 'render-check-build'
const SHELL_HOST = {
  id: 'render-check-host',
  name: 'Render Check Host',
  endpoint: 'ws://render-check',
  lastConnected: 1
}
/** The manifest's own pairs, as the shell would send them. */
const PAGE_ROUTE_GRANTS = [
  { pathname: HOST_PATTERN, grants: ['navigate', 'storage'] },
  { pathname: TASKS_PATTERN, grants: ['navigate', 'storage', 'native.clipboard.write'] }
]
/** Wide enough for `app/h/_layout.tsx` to render the sidebar beside the route. */
const WIDE = { width: 1180, height: 820 }
const NARROW = { width: 390, height: 844 }

const bundles = mobileWebAppDependenciesPresent()
const describeRender = bundles ? describe : describe.skip

let scratch
let server
let browser
let origin
let cspHeader = null
let bridgeVersion = null
let faultGrant = null

beforeAll(async () => {
  if (!bundles) {
    return
  }
  cspHeader = await readShellCsp()
  bridgeVersion = await readBridgeProtocolVersion()
  faultGrant = await readBridgeFaultGrant()
  scratch = await mkdtemp(join(tmpdir(), 'orca-mobile-web-app-handoff-'))
  const built = await buildMobileWebAppBundle({ outDir: join(scratch, 'bundle') })
  const served = await createBundleServer({ outDir: built.outDir, cspHeader })
  server = served.server
  origin = served.origin
  const executablePath = process.env.ORCA_MOBILE_WEB_RENDER_BROWSER
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
}, 180_000)

afterAll(async () => {
  await browser?.close()
  server?.close()
  if (scratch) {
    await rm(scratch, { recursive: true, force: true })
  }
})

/** Opens the worktree list at a viewport, under a named set of session grants. */
async function openHostRoute({ viewport, grants, pageRouteGrants = PAGE_ROUTE_GRANTS }) {
  const page = await browser.newPage({ viewport })
  await page.addInitScript(installShellDouble, {
    version: bridgeVersion,
    sessionId: SHELL_SESSION_ID,
    buildId: SHELL_BUILD_ID,
    route: { pathname: HOST_ROUTE },
    host: SHELL_HOST,
    storage: {},
    faultGrant,
    grants,
    pageRoutes: [HOST_PATTERN, TASKS_PATTERN],
    pageRouteGrants
  })
  const errors = []
  const scripts = []
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`)
    }
  })
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (response.status() === 200 && path.endsWith('.js')) {
      scripts.push(path)
    }
  })
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.documentElement.dataset.orcaWebEntry === 'mounted', {
    timeout: 30_000,
    polling: 250
  })
  await page.waitForFunction(
    (needle) => document.body.innerText.includes(needle),
    SHELL_HOST.name,
    {
      timeout: 30_000,
      polling: 250
    }
  )
  return { page, errors, scripts }
}

/** Every `navigate` notify the page posted, in order. */
function navigates(page) {
  return page.evaluate(() =>
    (globalThis.__orcaRenderCheckNotifies ?? []).filter((frame) => frame.name === 'navigate')
  )
}

describeRender('the sidebar hop to tasks, under the session it was opened with', () => {
  it('hands the hop to the shell when the session cannot cover tasks', async () => {
    const opened = await openHostRoute({
      viewport: WIDE,
      grants: [faultGrant, 'navigate', 'storage']
    })
    const { page, errors, scripts } = opened
    const loadedBefore = [...scripts]
    // The header's own control, by the name a user reads; it is the sidebar's on a wide layout.
    await page.getByLabel('Tasks').first().click()
    await page.waitForTimeout(1_500)
    expect(await navigates(page)).toEqual([
      { v: bridgeVersion, type: 'notify', name: 'navigate', href: `${HOST_ROUTE}/tasks` }
    ])
    // Handed over, not taken: the document stayed on the worktree list, and the tasks chunk was
    // never fetched — which is what says the page did not quietly render it under these grants.
    expect(await page.evaluate(() => location.pathname)).toBe(HOST_ROUTE)
    expect(scripts.filter((path) => !loadedBefore.includes(path))).toEqual([])
    expect(errors).toEqual([])
    await page.close()
  }, 60_000)

  it('keeps the hop in the document when the session covers tasks', async () => {
    // The same tap, the same viewport, one more grant. Without this the case above would pass on a
    // page that simply never navigates.
    const opened = await openHostRoute({
      viewport: WIDE,
      grants: [faultGrant, 'navigate', 'storage', 'native.clipboard.write']
    })
    const { page, errors } = opened
    await page.getByLabel('Tasks').first().click()
    await page.waitForFunction(() => location.pathname.endsWith('/tasks'), {
      timeout: 30_000,
      polling: 250
    })
    expect(await navigates(page)).toEqual([])
    expect(errors).toEqual([])
    await page.close()
  }, 60_000)

  it('renders no labelled tasks control at a narrow viewport, which is why there is no hop', async () => {
    // `app/h/_layout.tsx` renders the sidebar only on a wide layout, and only that header branch
    // gives its Accounts and Tasks controls an accessibility label; the narrow header's are
    // unlabelled pressables. So the hop this file is about does not exist at this viewport, and
    // the honest assertion is its absence rather than a tap that cannot be aimed.
    const opened = await openHostRoute({
      viewport: NARROW,
      grants: [faultGrant, 'navigate', 'storage']
    })
    const { page, errors } = opened
    expect(await page.getByLabel('Tasks').count()).toBe(0)
    expect(await navigates(page)).toEqual([])
    expect(await page.evaluate(() => location.pathname)).toBe(HOST_ROUTE)
    expect(errors).toEqual([])
    await page.close()
  }, 60_000)

  it('keeps the old behaviour when the shell sent no pairs at all', async () => {
    // An older shell: the page cannot tell covered from uncovered, and must not start handing
    // every hop over on the strength of a field nobody sent.
    const opened = await openHostRoute({
      viewport: WIDE,
      grants: [faultGrant, 'navigate', 'storage'],
      pageRouteGrants: null
    })
    const { page, errors } = opened
    await page.getByLabel('Tasks').first().click()
    await page.waitForFunction(() => location.pathname.endsWith('/tasks'), {
      timeout: 30_000,
      polling: 250
    })
    expect(await navigates(page)).toEqual([])
    expect(errors).toEqual([])
    await page.close()
  }, 60_000)
})
