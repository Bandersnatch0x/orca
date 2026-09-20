import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mobileWebAppRouteClosure } from './build-mobile-web-app-bundle.mjs'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'
import {
  textInputFontSizeOffenders,
  unresolvedTextInputStyles
} from './mobile-web-app-text-input-font-size-seam.mjs'

/**
 * What putting the terminal on the page costs the session route's closure.
 *
 * The route is not served on the page until C7.7 — its module is still the native switch and
 * there is no `.web.tsx` beside it — but the closure the bundler would walk is the same one, and
 * the terminal is by far the largest thing in it. Measured here so the trade is a number rather
 * than a claim, and so that a later change cannot quietly put the engine string back.
 *
 * Measured against `ota-c7-1-terminal-document` at 0ce0fc99a2, which is this branch's base:
 *
 *   modules        4316 -> 4363   (+47)
 *   local modules   927 ->  971   (+44)
 *   minified bytes  3,930,787 -> 3,875,226   (-55,561)
 *
 * The route gets smaller. It sheds the 612 KiB engine string and the 105 KiB generated document
 * script, both string literals it could not run, and gains xterm and the two addons as real code
 * — 607,945 bytes minified ESM on their own — plus the document's own modules.
 *
 * 8,306 of those bytes are C7.1's, not this lane's, and the base cannot show them: C7.1's round-1
 * fold deleted `URL_TAP_WEBVIEW_JS` from `terminal-webview-url-tap.ts`, and that module is in this
 * closure only once the page's component reaches it. Against 51ae7b1b03 the same measurement read
 * -47,255.
 */

const projectDir = fileURLToPath(new URL('../..', import.meta.url))
const mobileDir = join(projectDir, 'mobile')

const SESSION_ROUTE = 'app/h/[hostId]/session/[worktreeId].tsx'

/** Gone with the WebView: string literals of a program the page has no way to run. */
const SHED = [
  'src/terminal/TerminalWebView.tsx',
  'src/terminal/terminal-webview-engine.generated.ts',
  'src/terminal/terminal-webview-document-script.generated.ts',
  'src/terminal/terminal-webview-html.ts',
  'src/terminal/terminal-webview-html/document-shell.ts',
  'src/terminal/terminal-webview-html/document-close.ts'
]

/** The component, its mount, the stylesheet and the markup, and the two modules the split made. */
const GAINED_OUTSIDE_THE_DOCUMENT = [
  'src/terminal/TerminalWebView.web.tsx',
  'src/terminal/terminal-web-document-mount.ts',
  'src/terminal/terminal-webview-engine-css.generated.ts',
  'src/terminal/terminal-webview-html.web.ts',
  'src/terminal/terminal-webview-html/document-markup.ts',
  'src/terminal/terminal-webview-html/document-style.ts',
  'src/terminal/terminal-webview-ready-promises.ts',
  'src/terminal/use-terminal-webview-controller.ts'
]

const XTERM_PACKAGES = ['@xterm/xterm', '@xterm/addon-unicode11', '@xterm/addon-webgl']

/**
 * The 16 px seam's verdict for this route, which C7.5 must leave exactly where C7.2 found it.
 *
 * Nine inputs under the floor is design §3's own count, and moving them is C7.2's work, not this
 * lane's. It is asserted rather than left unmeasured because the terminal's own modules joining
 * the closure is precisely the kind of change that could add a tenth without anyone looking.
 */
const EXPECTED_OFFENDERS = 9

const bundles = mobileWebAppDependenciesPresent()
const describeClosure = bundles ? describe : describe.skip

describeClosure(
  "the session route's page closure with the terminal on it",
  () => {
    it('gains the document, xterm and the addons, and sheds the engine string', async () => {
      const { local, modules } = await mobileWebAppRouteClosure(SESSION_ROUTE)
      for (const gone of SHED) {
        expect(local, `${gone} is still in the closure`).not.toContain(gone)
      }
      for (const gained of GAINED_OUTSIDE_THE_DOCUMENT) {
        expect(local, `${gained} is not in the closure`).toContain(gained)
      }
      for (const name of XTERM_PACKAGES) {
        expect(
          modules.some((module) => module.includes(`node_modules/${name}/`)),
          `${name} is not in the closure`
        ).toBe(true)
      }
      // The document, whole: every module the generator emits except the bridge, which ruling 19
      // keeps off the page because those `message` frames belong to the shell.
      const documentModules = local.filter((module) => module.startsWith('src/terminal/document/'))
      expect(documentModules.length).toBeGreaterThanOrEqual(36)
      expect(documentModules).not.toContain('src/terminal/document/message-bridge.ts')
      expect(documentModules).toContain('src/terminal/document/page-document-modules.ts')
    }, 300_000)

    it('leaves the 16px seam census exactly where C7.2 found it', async () => {
      const closure = await mobileWebAppRouteClosure(SESSION_ROUTE)
      // Unresolved first: an offender count means nothing if the walk read no styles.
      expect(unresolvedTextInputStyles(mobileDir, closure)).toEqual([])
      expect(textInputFontSizeOffenders(mobileDir, closure)).toHaveLength(EXPECTED_OFFENDERS)
    }, 300_000)
  },
  900_000
)
