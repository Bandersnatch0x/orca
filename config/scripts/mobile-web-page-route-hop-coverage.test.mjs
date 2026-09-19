import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MOBILE_WEB_PAGE_ROUTES } from './mobile-web-page-routes.mjs'

/**
 * Every in-page hop between page routes, and whether the opener's grants cover the target.
 *
 * Grants are resolved once, from the route the shell opened, so a push kept inside the document
 * runs the target under the opener's list. C2.9 made the handoff refuse to keep a hop it cannot
 * cover, which is the fix; this is the census that says which hops those are, so adding a grant to
 * a route — or a new push between two — shows up as a change here rather than as a verb that
 * silently refuses on a device.
 *
 * Openers are every page route, not the one that pushes: on a wide layout `app/h/_layout.tsx`
 * renders the worktree-list sidebar beside every `/h` route, and its header pushes tasks. That is
 * what makes a pairwise pin the wrong shape — the sidebar reaches everything.
 */

const MOBILE_ROOT = join(fileURLToPath(new URL('../..', import.meta.url)), 'mobile')

/** Every `/h/${…}/…` target the app builds, as written. */
const HOST_HREF = /`\/h\/\$\{[^}]*\}([^`]*)`/g

function sourceFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path))
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
      found.push(path)
    }
  }
  return found
}

/** The route patterns the app can push to, derived from the hrefs it builds. */
function pushedPatterns() {
  const patterns = new Set()
  for (const dir of ['src', 'app']) {
    for (const file of sourceFiles(join(MOBILE_ROOT, dir))) {
      const source = readFileSync(file, 'utf8')
      for (const [, rest] of source.matchAll(HOST_HREF)) {
        // The tail after the host segment, with its own interpolations reduced to one segment and
        // its query dropped: `/session/${encodeURIComponent(id)}?name=…` becomes `/session/[p]`.
        const tail = rest
          .split('?')[0]
          .replaceAll(/\$\{[^}]*\}/g, '[p]')
          .replace(/\/$/, '')
        patterns.add(`/h/[hostId]${tail}`)
      }
    }
  }
  return patterns
}

/** Whether a concrete pattern from the source names the same route as a manifest pattern. */
function sameRoute(pushed, declared) {
  const a = pushed.split('/')
  const b = declared.split('/')
  if (a.length !== b.length) {
    return false
  }
  return a.every((segment, index) => {
    const other = b[index]
    const dynamic = (value) => value?.startsWith('[') === true
    return dynamic(segment) || dynamic(other) ? true : segment === other
  })
}

/**
 * Which hops the rule hands to the shell, pinned by name.
 *
 * Empty would mean every page route covers every other, which is not a property this codebase has
 * and not one to assume: the point of the pin is that a new entry appears when a route's grants
 * grow, and that the entry is read before it ships rather than found on a device.
 *
 * What is NOT here is the point of the census. `files/[worktreeId] -> files/preview/[worktreeId]`
 * is absent because the preview declares no more than the explorer, so that hop stays in the
 * document — which is C3.1's pairwise pin, now a consequence of the rule rather than a rule of its
 * own. The two `-> tasks` entries and the four `-> files/*` entries are the hops the sidebar and
 * the rows make into a route that asks for more than their opener holds.
 */
const HANDED_OFF = [
  '/h/[hostId] -> /h/[hostId]/files/[worktreeId]',
  '/h/[hostId] -> /h/[hostId]/files/preview/[worktreeId]',
  '/h/[hostId] -> /h/[hostId]/tasks',
  '/h/[hostId]/agent-history/[worktreeId] -> /h/[hostId]/files/[worktreeId]',
  '/h/[hostId]/agent-history/[worktreeId] -> /h/[hostId]/files/preview/[worktreeId]',
  '/h/[hostId]/agent-history/[worktreeId] -> /h/[hostId]/tasks',
  '/h/[hostId]/files/[worktreeId] -> /h/[hostId]/tasks',
  '/h/[hostId]/files/preview/[worktreeId] -> /h/[hostId]/tasks'
]

describe('in-page hops between page routes', () => {
  it('finds the hops the app actually builds, so the census is not empty', () => {
    const pushed = pushedPatterns()
    // The sidebar's tasks push is the hop this lane exists for; if the census stops seeing it the
    // pin below would go quietly green.
    expect([...pushed].some((pattern) => sameRoute(pattern, '/h/[hostId]/tasks'))).toBe(true)
  })

  it('pins every hop the handoff must take away from the page', () => {
    const pushed = [...pushedPatterns()]
    const handedOff = []
    for (const opener of MOBILE_WEB_PAGE_ROUTES) {
      for (const target of MOBILE_WEB_PAGE_ROUTES) {
        if (target.pathname === opener.pathname) {
          continue
        }
        const reachable = pushed.some((pattern) => sameRoute(pattern, target.pathname))
        if (!reachable) {
          continue
        }
        const covered = target.grants.every((grant) => opener.grants.includes(grant))
        if (!covered) {
          handedOff.push(`${opener.pathname} -> ${target.pathname}`)
        }
      }
    }
    expect(handedOff.sort()).toEqual([...HANDED_OFF].sort())
  })

  it('covers a hop whose target asks for no more than its opener, rather than handing it off', () => {
    // The other half of the rule, asserted on the manifest rather than assumed: a target declaring
    // a subset stays in the document, which is what keeps an ordinary hop cheap.
    // The explorer to its own preview, which is the hop C3.1 pinned pairwise: the preview asks for
    // no more than the explorer, so the rule keeps it local and the pairwise pin is redundant.
    const explorer = MOBILE_WEB_PAGE_ROUTES.find(
      (route) => route.pathname === '/h/[hostId]/files/[worktreeId]'
    )
    const preview = MOBILE_WEB_PAGE_ROUTES.find(
      (route) => route.pathname === '/h/[hostId]/files/preview/[worktreeId]'
    )
    if (!explorer || !preview) {
      throw new Error('the manifest lost a route this census is written against')
    }
    expect(preview.grants.filter((grant) => !explorer.grants.includes(grant))).toEqual([])
  })
})
