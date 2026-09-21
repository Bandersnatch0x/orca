/**
 * What a page's taps reach for a haptic, and the grant every page route needs to get one.
 *
 * Inside the shell's WebView `expo-haptics` fakes an iOS haptic by clicking a hidden checkbox it
 * appends to `document.head`, which is what killed a long press on the worktree list (C1.9). So the
 * page's seam posts `native.haptics.trigger` instead and the app plays the device's own — and a
 * route that imports the seam without declaring `haptics` is a page whose taps go quiet, because
 * grants are resolved once from the route the shell opened.
 *
 * The scan has a control rather than an empty list: the same walk over the native sibling finds the
 * same five functions and no posting site, which is what says it can tell the two apart.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mobileWebAppRouteClosure } from './build-mobile-web-app-bundle.mjs'
import { MOBILE_WEB_PAGE_ROUTES } from './mobile-web-page-routes.mjs'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'
import {
  HAPTICS_KINDS_MODULE,
  HAPTICS_NATIVE,
  HAPTICS_SEAM,
  bridgeHapticsKinds,
  hapticsPostedKinds,
  hapticsSeamImporters,
  hapticsTriggerSites
} from './mobile-web-app-haptics-seam.mjs'

const mobileDir = fileURLToPath(new URL('../../mobile/', import.meta.url))
const describeClosure = mobileWebAppDependenciesPresent() ? describe : describe.skip

const read = (file) => readFileSync(join(mobileDir, file), 'utf8')

/** The route module behind each declared page route, which is what a closure is read from. */
const ROUTE_MODULES = new Map([
  ['/h/[hostId]', 'app/h/[hostId]/index.tsx'],
  ['/h/[hostId]/agent-history/[worktreeId]', 'app/h/[hostId]/agent-history/[worktreeId].tsx'],
  ['/h/[hostId]/tasks', 'app/h/[hostId]/tasks.tsx'],
  ['/h/[hostId]/files/[worktreeId]', 'app/h/[hostId]/files/[worktreeId].tsx'],
  ['/h/[hostId]/files/preview/[worktreeId]', 'app/h/[hostId]/files/preview/[worktreeId].tsx']
])

const HAPTICS_GRANT = 'haptics'

describe('the seam reader', () => {
  it('names the kind each exported trigger posts', () => {
    expect(
      hapticsTriggerSites(
        [
          'let post = () => false',
          'export function publishHapticsNotifier(notify) {',
          '  post = notify',
          '}',
          "export function triggerSelection() { post('selection') }"
        ].join('\n'),
        'haptics.web.ts'
      )
    ).toEqual([{ name: 'triggerSelection', line: 5, kind: 'selection' }])
  })

  it('reads the binding the publisher assigns rather than a name called post', () => {
    // Keyed on `post`, renaming the local would turn every posting site into a non-posting one and
    // leave this census green on a page whose taps buzz for nothing.
    expect(
      hapticsPostedKinds(
        [
          'let ask = () => false',
          'export function publishHapticsNotifier(notify) { ask = notify }',
          "export function triggerError() { ask('error') }"
        ].join('\n'),
        'haptics.web.ts'
      )
    ).toEqual(['error'])
  })

  it('reports a function that posts nothing as a site with no kind', () => {
    expect(
      hapticsTriggerSites('export function triggerSelection() {}\n', 'haptics.web.ts')
    ).toEqual([{ name: 'triggerSelection', line: 1, kind: null }])
  })

  it('reports no kind for a function that posts one it computed, which nothing can pin', () => {
    expect(
      hapticsPostedKinds(
        [
          'let post = () => false',
          'export function publishHapticsNotifier(notify) { post = notify }',
          'export function triggerSelection(kind) { post(kind) }'
        ].join('\n'),
        'haptics.web.ts'
      )
    ).toEqual([])
  })

  it('reports no kind for a function that posts twice, which is two taps for one gesture', () => {
    expect(
      hapticsPostedKinds(
        [
          'let post = () => false',
          'export function publishHapticsNotifier(notify) { post = notify }',
          "export function triggerSelection() { post('selection'); post('success') }"
        ].join('\n'),
        'haptics.web.ts'
      )
    ).toEqual([])
  })

  it('leaves alone a trigger the module does not export', () => {
    expect(
      hapticsTriggerSites(
        [
          'let post = () => false',
          'export function publishHapticsNotifier(notify) { post = notify }',
          "function triggerLocal() { post('selection') }"
        ].join('\n'),
        'haptics.web.ts'
      )
    ).toEqual([])
  })

  it('ignores the seam named inside a comment or a string, which text matching cannot', () => {
    expect(
      hapticsPostedKinds(
        [
          'let post = () => false',
          'export function publishHapticsNotifier(notify) { post = notify }',
          "// export function triggerSelection() { post('selection') }",
          'const hint = "post(\'success\')"'
        ].join('\n'),
        'haptics.web.ts'
      )
    ).toEqual([])
  })

  it('reads the kinds off the tuple that declares them', () => {
    expect(bridgeHapticsKinds("export const BRIDGE_HAPTICS_KINDS = ['a', 'b'] as const\n")).toEqual(
      ['a', 'b']
    )
    // A mention is not a declaration, which is why this is parsed rather than matched.
    expect(bridgeHapticsKinds("// BRIDGE_HAPTICS_KINDS = ['a']\n")).toEqual([])
  })
})

/**
 * The two siblings measured against each other, which is what makes "all five post" a number.
 *
 * The native file is the control: same five names, same walk, no posting site. Without it an empty
 * result and a file the scan could not read would report the same thing.
 */
describe('the two haptics siblings', () => {
  it('posts every kind the notify admits from the web sibling, and nothing more', () => {
    const kinds = bridgeHapticsKinds(read(HAPTICS_KINDS_MODULE), HAPTICS_KINDS_MODULE)
    expect(kinds).toHaveLength(5)
    const posted = hapticsPostedKinds(read(HAPTICS_SEAM), HAPTICS_SEAM)
    expect([...posted].sort()).toEqual([...kinds].sort())
  })

  it('finds five functions in the native sibling and no posting site at all', () => {
    const sites = hapticsTriggerSites(read(HAPTICS_NATIVE), HAPTICS_NATIVE)
    expect(sites).toHaveLength(5)
    expect(sites.filter((site) => site.kind !== null)).toEqual([])
  })

  it('exports the same five names from both, which is what makes one a substitution', () => {
    const names = (file) => hapticsTriggerSites(read(file), file).map((site) => site.name)
    expect(names(HAPTICS_SEAM)).toEqual(names(HAPTICS_NATIVE))
  })
})

describeClosure(
  'every page route closure and the haptics seam',
  () => {
    it.each([...ROUTE_MODULES])('resolves the seam to the web sibling: %s', async (_route, mod) => {
      const closure = await mobileWebAppRouteClosure(mod)
      expect(closure.local).toContain(HAPTICS_SEAM)
      expect(closure.local).not.toContain(HAPTICS_NATIVE)
      // The precondition an assertion about a closure needs: the walk read a page, not nothing.
      expect(closure.local.length).toBeGreaterThan(250)
    })

    it.each([...ROUTE_MODULES])(
      'imports the seam from at least one module, so the grant is not idle: %s',
      async (_route, mod) => {
        const closure = await mobileWebAppRouteClosure(mod)
        expect(hapticsSeamImporters(mobileDir, closure).length).toBeGreaterThan(0)
      }
    )

    /**
     * The grant list derived from the closures rather than written by hand.
     *
     * Grants are resolved once, from the route the shell opened, and carried for the life of the
     * session. A route that imports the seam and declares nothing is a page whose taps are silent
     * with nothing on screen to say why.
     */
    it('declares haptics on exactly the routes whose closure reaches the seam', async () => {
      const reaching = []
      for (const [route, mod] of ROUTE_MODULES) {
        const closure = await mobileWebAppRouteClosure(mod)
        if (hapticsSeamImporters(mobileDir, closure).length > 0) {
          reaching.push(route)
        }
      }
      expect(reaching.length).toBeGreaterThan(0)
      const declared = MOBILE_WEB_PAGE_ROUTES.filter((route) =>
        route.grants.includes(HAPTICS_GRANT)
      ).map((route) => route.pathname)
      expect([...declared].sort()).toEqual([...reaching].sort())
    })

    it('covers every declared page route, so a new one cannot be missed by this file', () => {
      // The map above is a hand list of route modules; this is what holds it to the declarations.
      expect([...ROUTE_MODULES.keys()].sort()).toEqual(
        MOBILE_WEB_PAGE_ROUTES.map((route) => route.pathname).sort()
      )
    })
  },
  240_000
)
