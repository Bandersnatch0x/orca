package expo.modules.orcamobilewebshell

/**
 * Whether a navigation is dropped. Only the document URL of the generation currently served is
 * allowed to load: nothing in the bundle navigates, so anything that tries is either a link the
 * page opened or a URL the page built, and neither is ours to follow.
 *
 * `true` means Chromium never starts the navigation. A serving host of null means no generation is
 * applied, so there is no document to allow yet.
 */
internal fun mobileWebShellDropsNavigation(
  parts: MobileWebShellRequestParts,
  originHost: String?,
  isForMainFrame: Boolean
): Boolean {
  if (!isForMainFrame || originHost == null) return true
  return resolveMobileWebShellRequestPath(parts, originHost) != "/"
}

/**
 * Longest URL the shell hands back to JS for a dropped navigation.
 *
 * The page's own bound is `BRIDGE_MAX_EXTERNAL_LINK_CHARS` (2048) and the filter that applies it is
 * `readBridgeExternalLinkUrl`, in TypeScript. This is not a second copy of that rule: it is a cap on
 * what crosses the native boundary at all, so an artifact cannot spend the bridge on a URL the
 * opener will refuse anyway. Generous against the real bound for the same reason the origin's own
 * `MAX_URL_BYTE_COUNT` is.
 */
internal const val MOBILE_WEB_SHELL_MAX_DROPPED_NAVIGATION_URL_CHARS = 4096

/**
 * The URL a dropped navigation should be offered to the host for, or null when it should stay
 * dropped and silent.
 *
 * Only a main-frame navigation: the sealed preview frame's own loads are not the user leaving the
 * app, and forwarding one would let an artifact ask for a browser with no tap behind it. Which
 * URLs are openable is not decided here — `readBridgeExternalLinkUrl` owns the scheme list, in the
 * half that ships over the air — so this says "a human aimed the top frame somewhere else" and
 * nothing more.
 */
internal fun mobileWebShellDroppedNavigationUrl(
  url: String?,
  isForMainFrame: Boolean,
  dropped: Boolean
): String? {
  if (!dropped || !isForMainFrame || url == null) return null
  if (url.isEmpty() || url.length > MOBILE_WEB_SHELL_MAX_DROPPED_NAVIGATION_URL_CHARS) return null
  return url
}
