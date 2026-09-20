/**
 * The state the in-WebView terminal document shares across its parts.
 *
 * The document is one function scope: 2,758 lines around 100 `var` declarations, 57 of which are
 * written from more than one place. Moving its parts into modules is what lets the web page import
 * them instead of re-implementing them, and a variable assigned from another module cannot be an
 * import — assigning an imported binding is a syntax error. So the written ones become fields here,
 * and the group that owns each is named beside it.
 *
 * Only the written ones move. A `var` the script never assigns again is an ordinary local and stays
 * one, which is what keeps the qualifier off most of the program.
 *
 * The table grows one group at a time as C7.1 extracts them; a field arrives with its group.
 */

/** As much of xterm's terminal as the document's own code touches. */
export type TerminalDocumentTerminal = {
  readonly cols: number
  readonly rows: number
}

export type TerminalDocumentScope = {
  /** `terminal-init-and-write`: the live xterm terminal, or null before the first init. */
  term: TerminalDocumentTerminal | null
  /** `smooth-scroll-and-cell-geometry`: the surface's pan offset, in viewport pixels. */
  panX: number
  panY: number
}

/**
 * The initial values, which are the ones the document's own declarations carried.
 *
 * A factory rather than a shared literal so a second document — a test, or a page that remounts —
 * starts from its own state instead of inheriting what the last one left.
 */
export function createTerminalDocumentScope(): TerminalDocumentScope {
  return { term: null, panX: 0, panY: 0 }
}

/** The document's own scope. The generator emits this declaration at the top of the script. */
export const scope: TerminalDocumentScope = createTerminalDocumentScope()
