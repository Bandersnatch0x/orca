import { scope } from './document-scope'

/**
 * The two fields the document declares before the query-reply bridge that follows it.
 *
 * They are one module because the emitted document puts them on one line, ahead of an injected
 * group; nothing else joins them.
 */

export function startTerminalHandle() {
  scope.PRIVATE_MODE_SCAN_TAIL_LIMIT = 4096
  scope.term = null
}
