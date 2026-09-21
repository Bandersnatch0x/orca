import type { MermaidConfig } from 'mermaid'

/**
 * The two calls the page makes of mermaid, named rather than cast.
 *
 * The artifact below is minified vendor output, so its own file is unchecked — but its default
 * export still has an inferred type, and returning it as this keeps that inference as the check
 * that the bundle is the engine. A cast here would have asserted the same thing and verified none
 * of it.
 */
export type PageMermaid = {
  initialize: (config: MermaidConfig) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

/**
 * The page's mermaid, loaded on demand from one pre-bundled artifact.
 *
 * `import('mermaid')` from inside the app bundle would emit 103 scripts, because mermaid lazily
 * imports each of its own diagram types and esbuild splits along those boundaries. Every one of
 * them ships inside the OTA generation the phone has already downloaded, so the split moves no
 * bytes over the wire and spends 103 of the 256 manifest assets the shell will load. The artifact
 * is the same engine in one file, and this import is still the deferred one: a session with no
 * diagram on it evaluates none of it.
 */
export async function loadPageMermaid(): Promise<PageMermaid> {
  const engine = await import('./mermaid-page-engine.generated')
  return engine.default
}
