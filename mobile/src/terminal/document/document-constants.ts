import { colors } from '../../theme/mobile-theme'

/**
 * The build-time values the document's script text carries as literals.
 *
 * The document is a string, so it cannot import: today each of these is interpolated into a
 * template literal at the site that needs it. A module cannot do that and still be the same
 * program, so the generator substitutes these exports into the text it emits, and the web page
 * imports the very same bindings. One source either way.
 *
 * Every export must be JSON-serialisable, because a substitution is a JSON literal.
 */

/** The page background before a theme arrives, and the fallback when a theme omits one. */
export const terminalBackgroundFallback = colors.terminalBg
