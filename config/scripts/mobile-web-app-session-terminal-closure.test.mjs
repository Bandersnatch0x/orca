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
 * Measured against `origin/main` at ec82173130, which is C7.5 as it landed. The reading is
 * re-anchored rather than adjusted: the base this note used to name is far enough back that main
 * has moved 44,296 bytes below its number through changes that are not this lane's.
 *
 *   modules        4320 -> 4280   (-40)
 *   local modules   970 ->  930   (-40)
 *   minified bytes  3,768,122 -> 3,766,312   (-1,810)
 *
 * What moved is which files carry the document, not whether the page carries it. C7.5 put the
 * document's own source modules in this closure and started them per mount; ruling 23 gives the
 * page the factory the WebView's script is generated from, so the same program arrives as one
 * emitted file and its 41 inputs leave. The bytes barely move because it is the same program: what
 * goes is the import and export plumbing between the modules, and what the generator substitutes.
 *
 * xterm was already a static import of the mount before this, so nothing here is xterm arriving: it
 * and its two addons are 607,945 bytes minified ESM on their own, and they are on both sides of the
 * reading above.
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

/** The component, its mount, the stylesheet and the markup, and the modules the splits made. */
const GAINED_OUTSIDE_THE_DOCUMENT = [
  'src/terminal/TerminalWebView.web.tsx',
  'src/terminal/terminal-webview-document-factory.generated.ts',
  'src/terminal/terminal-web-document-mount.ts',
  'src/terminal/terminal-webview-engine-css.generated.ts',
  'src/terminal/terminal-webview-html.web.ts',
  'src/terminal/terminal-webview-html/document-markup.ts',
  'src/terminal/terminal-webview-html/document-style.ts',
  // The page's half of the stylesheet: the document-level rules are dropped and the rest is held
  // under the host, so what the page injects can only reach what the terminal owns.
  'src/terminal/terminal-webview-html/document-style-scoping.ts',
  'src/terminal/terminal-webview-ready-promises.ts',
  'src/terminal/use-terminal-webview-controller.ts'
]

const XTERM_PACKAGES = ['@xterm/xterm', '@xterm/addon-unicode11', '@xterm/addon-webgl']

/**
 * The 16 px seam's verdict for this route, which C7.5 must leave exactly where C7.2 left it.
 *
 * Design §3 counted nine inputs under the floor here and C7.2 moved all nine onto the seam, so the
 * answer is now none. Asserted rather than left unmeasured because the terminal's own modules
 * joining this closure is precisely the kind of change that could add a tenth unread.
 */
const EXPECTED_OFFENDERS = 0

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
      // The document, whole, and as one file: ruling 23 gives the page the factory the WebView's
      // own script is generated from, so what the closure carries is that emitted text. The source
      // modules are not in it at all — they are the factory's inputs, not the page's — and the one
      // import the generated file makes is a type, which erases.
      expect(local).toContain('src/terminal/terminal-webview-document-factory.generated.ts')
      expect(local.filter((module) => module.startsWith('src/terminal/document/'))).toEqual([])
    }, 300_000)

    it('leaves the 16px seam census exactly where C7.2 left it', async () => {
      const closure = await mobileWebAppRouteClosure(SESSION_ROUTE)
      // Two preconditions, because zero offenders is what a walk that read nothing also reports:
      // the seam's own web module has to be in the closure, and no style may be unresolved.
      expect(closure.local).toContain('src/platform/text-input-font-size.web.ts')
      expect(unresolvedTextInputStyles(mobileDir, closure)).toEqual([])
      expect(textInputFontSizeOffenders(mobileDir, closure)).toHaveLength(EXPECTED_OFFENDERS)
    }, 300_000)
  },
  900_000
)
