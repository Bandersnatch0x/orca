/**
 * The HTML preview's sealed frame, in a real browser under the shipped policy, on both engines.
 *
 * The frame holds an agent-produced artifact inside the page's own document, so every claim about
 * what it cannot do has to be measured rather than reasoned about — and every one of those claims is
 * an absence, which is also what a frame that never rendered reports. So each case runs against a
 * no-header control where the same artifact does the thing: the script runs, the remote subresources
 * are fetched, the navigation happens. Without those controls a preview that failed to load would
 * pass every assertion here.
 *
 * WebKit as well as Chromium, because the iOS shell is WKWebView and the two disagree: a `blob:`
 * frame that Chromium admits under `frame-src blob:` is refused in WebKit by the
 * `frame-ancestors 'none'` it inherits. `srcdoc` is what both admit under the policy that already
 * ships, which is why this costs no CSP change and why a case below pins `frame-src 'none'` as still
 * shipped.
 *
 * The paint oracle is a pixel rather than a read inside the frame: the frame is an opaque origin, and
 * WebKit refuses to evaluate in one, so reading its DOM would make the instrument engine-dependent.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as esbuild from 'esbuild'
import { PNG } from 'pngjs'
import { chromium, webkit } from 'playwright-core'
import { lucideBarrelPlugin } from './build-mobile-web-app-bundle.mjs'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'
import { createBundleServer, readShellCsp } from './mobile-web-app-render-harness.mjs'

const mobileDir = fileURLToPath(new URL('../../mobile', import.meta.url))

/** Where the preview sits once mounted, which is what the pixel oracle samples. */
const FRAME_PROBE = { x: 60, y: 200, width: 4, height: 4 }
/** The artifact fills itself with this, so one pixel says the frame parsed and painted. */
const ARTIFACT_RGB = '0,128,255'
/** The page behind the frame, so a frame that painted nothing reads as this instead. */
const PAGE_RGB = '17,17,17'

/**
 * The page under test: the real web sibling, mounted by react-native-web, with nothing else on it.
 *
 * The component is imported rather than reimplemented, and `resolveExtensions` puts `.web.tsx` first
 * so this is the file the bundle ships. `renderSource` is a marker the Source case looks for.
 */
const ENTRY_SOURCE = `
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Text } from 'react-native'
import { MobileHtmlPreview, MOBILE_HTML_PREVIEW_SANDBOX } from './MobileHtmlPreview'

window.__sandbox = MOBILE_HTML_PREVIEW_SANDBOX
window.__mount = (html, sandboxOverride) => {
  const host = document.getElementById('root')
  createRoot(host).render(
    createElement(MobileHtmlPreview, {
      html,
      renderSource: () => createElement(Text, null, 'SOURCE_TAB_RENDERED')
    })
  )
  // A control arm needs a frame the product would never build -- one with allow-scripts -- so that
  // "the script did not run" can be told apart from "the fixture has no script". Applied after the
  // render rather than through a prop, because the product takes no such prop and must not grow one
  // for a test. React does not own this attribute, so it stays put.
  //
  // Awaited rather than read straight away: createRoot().render() commits on React's own schedule,
  // and reading the element synchronously finds nothing.
  if (sandboxOverride === null) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 4000
    const apply = () => {
      const frame = host.querySelector('iframe')
      if (frame) {
        frame.setAttribute('sandbox', sandboxOverride)
        frame.srcdoc = html
        resolve()
        return
      }
      if (Date.now() > deadline) {
        reject(new Error('the preview never mounted a frame to override'))
        return
      }
      requestAnimationFrame(apply)
    }
    apply()
  })
}
`

/** Where the artifact's links and subresources point, and the origin that counts what it asked for. */
let foreignOrigin = null
const foreignHits = []
let foreign = null

/**
 * One artifact, with every escape route a hostile one would try.
 *
 * `extra.head` and `extra.body` let a case add a `<meta refresh>` or a script without a second
 * fixture, so the thing under test is the only difference between the arms.
 */
function artifact(extra = {}, nonce = 'n0') {
  // Every foreign URL carries this arm's nonce, because a closed page's requests can still land and
  // a hit list shared across arms would report the previous one's fetches as this one's.
  const tag = `?n=${nonce}`
  return `<!doctype html><html><head><title>ARTIFACT</title>
<style>html,body{margin:0;height:100%;background:rgb(${ARTIFACT_RGB})}
#bg{background-image:url("${foreignOrigin}/css-bg.png${tag}")}
@font-face{font-family:probe;src:url("${foreignOrigin}/probe.woff2${tag}")}
#fonted{font-family:probe}</style>${extra.head ?? ''}</head><body>
<h1 id="marker">ARTIFACT_RENDERED</h1><div id="bg">b</div><div id="fonted">f</div>
<img id="remote" src="${foreignOrigin}/img.png${tag}" />
<a id="toplink" href="${foreignOrigin}/tapped.html${tag}" target="_top">tap</a>
<a id="blanklink" href="${foreignOrigin}/blank.html${tag}" target="_blank">window</a>
<form id="topform" action="${foreignOrigin}/form.html" target="_top" method="get"><button id="submit">go</button></form>
${extra.body ?? ''}</body></html>`
}

let nonceCounter = 0

/** The inline script every arm carries, so "it did not run" is about the fence and not the fixture. */
const ARTIFACT_SCRIPT = `<script>
  window.__ran = 1;
  document.title = 'SCRIPT_RAN';
  document.getElementById('marker').textContent = 'SCRIPT_RAN';
  fetch('${'${foreignOrigin}'}/fetched.json').catch(() => {});
  try { window.top.location.href = '${'${foreignOrigin}'}/by-script.html' } catch (error) { window.__threw = error.name }
</script>`

const bundles = mobileWebAppDependenciesPresent()
const describeRender = bundles ? describe : describe.skip

let scratch = null
let outDir = null
let shippedCsp = null

const browsers = {}
/**
 * Two servers over one bundle rather than one server with a switch: the policy is a response header
 * the harness reads once per server, and a control arm that shared a server with the sealed arm
 * would be one race away from measuring the wrong header.
 */
let sealedServer = null
let openServer = null
const origins = {}

beforeAll(async () => {
  shippedCsp = await readShellCsp()
  if (!bundles) {
    return
  }
  foreignHits.length = 0
  foreign = createServer((request, response) => {
    foreignHits.push(request.url)
    if (request.url.endsWith('.png')) {
      response.writeHead(200, { 'content-type': 'image/png' })
      response.end(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
          'base64'
        )
      )
      return
    }
    response.writeHead(200, { 'content-type': 'text/html', 'access-control-allow-origin': '*' })
    response.end('<html><body>FOREIGN</body></html>')
  })
  await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve))
  foreignOrigin = `http://127.0.0.1:${String(foreign.address().port)}`

  await mkdir(join(mobileDir, '.tmp'), { recursive: true })
  scratch = await mkdtemp(join(mobileDir, '.tmp', 'html-preview-render-'))
  outDir = join(scratch, 'bundle')
  await mkdir(outDir, { recursive: true })
  await esbuild.build({
    absWorkingDir: mobileDir,
    stdin: {
      contents: ENTRY_SOURCE,
      resolveDir: join(mobileDir, 'src/components'),
      loader: 'tsx',
      sourcefile: 'html-preview-check.tsx'
    },
    bundle: true,
    format: 'iife',
    outfile: join(outDir, 'html-preview-check.js'),
    target: ['es2022'],
    jsx: 'automatic',
    logLevel: 'silent',
    // The page's own icon shim, imported rather than copied: `lucide-react-native` imports a
    // `LucideProvider` its context module does not export, so the toolbar's icons do not link
    // without it.
    plugins: [lucideBarrelPlugin],
    nodePaths: [join(mobileDir, 'node_modules')],
    alias: { 'react-native': 'react-native-web' },
    // The web sibling is what the page runs; naming the native file would measure the module that
    // needs `react-native-webview` to exist. `.web.jsx`/`.web.js` are in the list for the same reason
    // the real bundle has them: without them `react-native-svg`, which the toolbar's icons pull in,
    // resolves its Fabric components and fails on `codegenNativeComponent`.
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
    define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"' }
  })
  await writeFile(
    join(outDir, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"></head>' +
      `<body style="margin:0;background:rgb(${PAGE_RGB})">` +
      // A flex column at the viewport's height: the component's outermost `View` is `flex: 1`, and
      // in a plain block container that resolves to no height at all and the frame never paints.
      '<div id="root" style="display:flex;flex-direction:column;height:100vh"></div>' +
      '<script src="/html-preview-check.js"></script></body></html>'
  )
  const sealed = await createBundleServer({ outDir, cspHeader: shippedCsp })
  sealedServer = sealed.server
  origins.shipped = sealed.origin
  const bare = await createBundleServer({ outDir, cspHeader: null })
  openServer = bare.server
  origins.none = bare.origin
  const executablePath = process.env.ORCA_MOBILE_WEB_RENDER_BROWSER
  browsers.chromium = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {})
  })
  // No override for WebKit: there is no system WebKit for Playwright to borrow, so a runner without
  // the download skips rather than testing Chromium twice under another name.
  browsers.webkit = await webkit.launch({ headless: true }).catch(() => null)
}, 300_000)

afterAll(async () => {
  await browsers.chromium?.close()
  await browsers.webkit?.close()
  sealedServer?.close()
  openServer?.close()
  foreign?.close()
  if (scratch) {
    // This run's directory only: `mobile/.tmp` is a shared ignored root and another suite may hold
    // one of its own.
    await rm(scratch, { recursive: true, force: true })
  }
})

/**
 * Mounts the preview with one artifact and reports everything a case can assert on.
 *
 * `csp: null` is the control arm. The foreign origin's hit list is reset per open, so what it holds
 * is this artifact's doing.
 */
async function open(browser, { extra = {}, csp = 'shipped', sandbox, act } = {}) {
  const origin = csp === 'shipped' ? origins.shipped : origins.none
  nonceCounter += 1
  const nonce = `n${String(nonceCounter)}`
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(4000)
  const navigations = []
  const popups = []
  page.on('popup', (popup) => {
    popups.push(popup.url())
    void popup.close().catch(() => {})
  })
  // The shell's navigation delegate, stood in for: Playwright is not the shell, so a top-frame
  // navigation is recorded with the frame that asked and aborted. That count is exactly what the
  // shell's `onExternalNavigation` would be handed.
  await page.route(`${foreignOrigin}/**`, (route) => {
    const request = route.request()
    if (request.isNavigationRequest()) {
      navigations.push({
        url: request.url(),
        top: request.frame() === page.mainFrame()
      })
      return void route.abort()
    }
    return void route.continue()
  })
  await page.addInitScript(() => {
    window.__violations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__violations.push(`${event.violatedDirective} ${event.blockedURI || 'inline'}`)
    })
  })
  await page.goto(`${origin}/preview`, { waitUntil: 'load' })
  // `sandbox` undefined is the product's own token, which is what every non-control case runs.
  await page.evaluate(
    ([html, override]) => window.__mount(html, override),
    [artifact(extra, nonce), sandbox ?? null]
  )
  // The frame's own load, which React schedules after the mount commits.
  await page.waitForTimeout(900)
  const frames = () => page.frames().filter((frame) => frame !== page.mainFrame())
  // Sampled before the action as well as after: a case that taps a link is asking what the tap
  // produced, and by then the top frame is mid-navigation and the iframe has blanked to its own
  // background. So the precondition "there was a rendered artifact to tap" is this reading, and the
  // one below is only meaningful for a case that did nothing.
  const pixelBefore = await probePixel(page)
  if (act) {
    await act({ page, frame: frames()[0] ?? null })
    await page.waitForTimeout(600)
  }
  const result = {
    page,
    pixelBefore,
    pixel: await probePixel(page),
    declaredSandbox: await page.evaluate(() => window.__sandbox),
    // The attribute on the element the component actually rendered, not the constant it exports: a
    // literal in the JSX would leave the constant correct and the frame unsealed, which is what the
    // control run for this file did before this reading existed.
    mountedSandbox: await page
      .evaluate(() => document.querySelector('iframe')?.getAttribute('sandbox') ?? null)
      .catch(() => null),
    frameCount: frames().length,
    // Reported so a pixel that read the page instead of the frame names the layout rather than
    // looking like a frame that refused to load.
    frameBox: await page
      .evaluate(() => {
        const frame = document.querySelector('iframe')
        if (!frame) {
          return null
        }
        const box = frame.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, height: box.height }
      })
      .catch(() => null),
    frameUrl: frames()[0]?.url() ?? null,
    inside: await (frames()[0]
      ?.evaluate(() => ({
        marker: document.getElementById('marker')?.textContent ?? null,
        title: document.title,
        ran: window.__ran ?? 0,
        threw: window.__threw ?? null
      }))
      .catch(() => null) ?? Promise.resolve(null)),
    topNavigations: navigations.filter((one) => one.top).length,
    frameNavigations: navigations.filter((one) => !one.top).length,
    popups: popups.length,
    // This arm's fetches only, by nonce: the paths, with the nonce stripped, so a case reads the
    // subresource rather than the bookkeeping.
    foreignHits: foreignHits
      .filter((one) => one.includes(`n=${nonce}`))
      .map((one) => one.split('?')[0]),
    violations: await page.evaluate(() => window.__violations),
    body: await page.evaluate(() => document.body.innerText)
  }
  await page.close()
  return result
}

for (const engine of ['chromium', 'webkit']) {
  describeRender(
    `the HTML preview's sealed frame on ${engine}`,
    () => {
      const browser = () => {
        const one = browsers[engine]
        if (!one) {
          throw new Error(`${engine} is not installed for playwright-core`)
        }
        return one
      }

      it('paints the artifact under the policy the shell already ships', async () => {
        const read = await open(browser())
        expect(read.frameCount).toBe(1)
        expect(read.frameUrl).toBe('about:srcdoc')
        // The rendered frame carries the constant, so the token case below is about the frame the
        // page mounts rather than about a string nothing reads.
        expect(read.mountedSandbox).toBe(read.declaredSandbox)
        expect(read.mountedSandbox).toBe('allow-top-navigation-by-user-activation')
        // The pixel, not a read inside the frame: the frame is an opaque origin.
        expect(read.pixel).toBe(ARTIFACT_RGB)
        // The frame's own `<style>` applied, so `style-src`'s `'unsafe-inline'` carries the artifact.
        expect(read.violations).toEqual([])
      }, 120_000)

      it('does not run the artifact, behind two fences either of which would hold', async () => {
        const sealed = await open(browser(), { extra: { body: script() } })
        expect(sealed.pixel).toBe(ARTIFACT_RGB)
        expect(sealed.inside?.ran).toBe(0)
        expect(sealed.inside?.title).toBe('ARTIFACT')
        expect(sealed.inside?.marker).toBe('ARTIFACT_RENDERED')

        // The oracle's presence precondition: grant the frame `allow-scripts` and drop the policy,
        // and this very fixture runs. Without this arm, "did not run" is also what an artifact with
        // no script in it reports.
        const loose = await open(browser(), {
          extra: { body: script() },
          csp: null,
          sandbox: 'allow-scripts allow-top-navigation-by-user-activation'
        })
        expect(loose.pixel).toBe(ARTIFACT_RGB)
        expect(loose.inside?.ran).toBe(1)
        expect(loose.inside?.title).toBe('SCRIPT_RAN')

        // The second fence, measured on its own: grant `allow-scripts` and keep the shipped policy,
        // and the script still does not run, because a `srcdoc` frame inherits its embedder's
        // `script-src 'self'` and the artifact's script is inline. So the seal does not rest on the
        // sandbox attribute alone -- which is what makes the token list below a defence in depth
        // rather than the only thing standing between the page and an agent's script.
        const inherited = await open(browser(), {
          extra: { body: script() },
          sandbox: 'allow-scripts allow-top-navigation-by-user-activation'
        })
        expect(inherited.pixel).toBe(ARTIFACT_RGB)
        expect(inherited.inside?.ran).toBe(0)
        expect(inherited.inside?.title).toBe('ARTIFACT')
      }, 180_000)

      it('fetches nothing of the artifact that leaves the origin, and would if allowed', async () => {
        const sealed = await open(browser())
        expect(sealed.pixel).toBe(ARTIFACT_RGB)
        expect(sealed.foreignHits).toEqual([])
        // The control: with no policy the same three subresources are fetched, so the empty list
        // above is the inherited `img-src` and `font-src` and not an artifact that never parsed.
        const control = await open(browser(), { csp: null })
        expect(control.pixel).toBe(ARTIFACT_RGB)
        expect(control.foreignHits).toEqual(
          expect.arrayContaining(['/img.png', '/css-bg.png', '/probe.woff2'])
        )
      }, 120_000)

      it("hands a user's tap on a link to the top frame, exactly once", async () => {
        const read = await open(browser(), {
          act: async ({ frame }) => {
            await frame?.click('#toplink', { timeout: 2000 }).catch(() => {})
          }
        })
        expect(read.pixelBefore).toBe(ARTIFACT_RGB)
        expect(read.topNavigations).toBe(1)
        expect(read.popups).toBe(0)
      }, 120_000)

      it('hands up nothing without a tap, and nothing for a form or a new window', async () => {
        const meta = await open(browser(), {
          extra: { head: `<meta http-equiv="refresh" content="0;url=${foreignOrigin}/meta.html">` }
        })
        expect(meta.topNavigations).toBe(0)
        const form = await open(browser(), {
          act: async ({ frame }) => {
            await frame?.click('#submit', { timeout: 2000 }).catch(() => {})
          }
        })
        expect(form.pixelBefore).toBe(ARTIFACT_RGB)
        expect(form.topNavigations).toBe(0)
        const blank = await open(browser(), {
          act: async ({ frame }) => {
            await frame?.click('#blanklink', { timeout: 2000 }).catch(() => {})
          }
        })
        expect(blank.pixelBefore).toBe(ARTIFACT_RGB)
        expect(blank.topNavigations).toBe(0)
        expect(blank.popups).toBe(0)
      }, 180_000)

      it('keeps the Preview/Source toggle, and Source shows the source', async () => {
        const read = await open(browser(), {
          act: async ({ page }) => {
            await page.getByLabel('View HTML source').click({ timeout: 2000 })
          }
        })
        expect(read.body).toContain('SOURCE_TAB_RENDERED')
        // The frame went with the preview, which is why the toggle is not a control that lies.
        expect(read.frameCount).toBe(0)
        expect(read.pixel).toBe(PAGE_RGB)
      }, 120_000)
    },
    600_000
  )
}

/** The artifact's inline script, with the foreign origin the fixture is built against. */
function script() {
  return ARTIFACT_SCRIPT.replaceAll('${foreignOrigin}', foreignOrigin)
}

describe('the HTML preview needs no policy change', () => {
  it('runs under a policy that still forbids every nested frame by URL', async () => {
    const directives = (await readShellCsp()).split('; ')
    // A `srcdoc` frame has no URL for `frame-src` to match, so the sealed box costs nothing here.
    // Pinned so a future relaxation is a decision rather than a side effect of this component.
    expect(directives).toContain("frame-src 'none'")
    expect(directives).toContain("child-src 'none'")
    expect(directives).toContain("script-src 'self'")
    expect(directives).toContain("frame-ancestors 'none'")
  })

  it('grants exactly one sandbox token, and neither of the two that would unseal the frame', async () => {
    const source = await readFileText('mobile/src/components/MobileHtmlPreview.web.tsx')
    const match = /MOBILE_HTML_PREVIEW_SANDBOX = '([^']*)'/.exec(source)
    expect(match).not.toBeNull()
    const tokens = (match?.[1] ?? '').split(' ').filter((one) => one.length > 0)
    expect(tokens).toEqual(['allow-top-navigation-by-user-activation'])
    // Named rather than left to the list comparison: these two are the sealing invariant, and a
    // reader of a failure should see which one was granted.
    expect(tokens).not.toContain('allow-scripts')
    expect(tokens).not.toContain('allow-same-origin')
  })
})

/** One pixel of the frame's own fill, which is what says the artifact parsed and painted. */
async function probePixel(page) {
  const png = PNG.sync.read(await page.screenshot({ clip: FRAME_PROBE }))
  return `${png.data[0]},${png.data[1]},${png.data[2]}`
}

async function readFileText(relativePath) {
  const { readFile } = await import('node:fs/promises')
  return await readFile(join(mobileDir, '..', relativePath), 'utf8')
}
