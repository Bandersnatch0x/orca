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
 * What the shell does with one navigation: the whole decision, so the "allow it" half and the
 * "offer it to the opener" half cannot drift apart. Kept in step with the iOS copy.
 */
internal sealed interface MobileWebShellNavigationVerdict {
  /** The served document loading itself, which is the only navigation this WebView performs. */
  data object Allow : MobileWebShellNavigationVerdict

  /** Refused, and the host is told nothing. Every navigation was this before the preview existed. */
  data object Cancel : MobileWebShellNavigationVerdict

  /** Refused, and the URL is handed to the host's opener, which decides what may open. */
  data class CancelAndOffer(val url: String) : MobileWebShellNavigationVerdict
}

/**
 * Longest URL the shell hands back to JS for a dropped navigation.
 *
 * The page's own bound is `BRIDGE_MAX_EXTERNAL_LINK_CHARS` (2048) and the filter that applies it is
 * `readBridgeExternalLinkUrl`, in TypeScript. This is not a second copy of that rule: it is a cap on
 * what crosses the native boundary at all, so an artifact cannot spend the bridge on a URL the
 * opener will refuse anyway.
 */
internal const val MOBILE_WEB_SHELL_MAX_DROPPED_NAVIGATION_URL_CHARS = 4096

/** The URL a dropped navigation may be offered under, or null when nothing crosses. */
internal fun mobileWebShellOfferableUrl(url: String?): String? {
  if (url == null || url.isEmpty()) return null
  return if (url.length > MOBILE_WEB_SHELL_MAX_DROPPED_NAVIGATION_URL_CHARS) null else url
}

/**
 * The whole decision.
 *
 * Three rules, in this order, and the order is the design.
 *
 * A navigation outside the main frame is the sealed preview frame loading itself. It is refused and
 * never offered: forwarding it would let an artifact ask for a browser with no tap behind it.
 *
 * **A navigation a human started is never allowed, whatever it names.** `isDocumentUrl` is true for
 * `href="/"` and for `href=""` in an artifact, because both resolve against the embedder's base, so
 * without this rule one tap inside the preview would reload the shell's own page -- clearing the
 * reply proxy, restarting the load state and losing everything the page held. It is offered
 * instead, and the opener's scheme list drops the shell's own origin in silence exactly as it drops
 * a route.
 *
 * Only a navigation with no gesture behind it can be allowed, and only to the served document: that
 * is the page rewriting its own path, and the one navigation this WebView performs. `isDownload` is
 * always false here and is carried so this reads as its iOS twin does: Chromium never offers a
 * download through `shouldOverrideUrlLoading`, it goes to the `DownloadListener` the view installs
 * as a no-op, and a gesture-started one is refused and offered by the rule above before it can get
 * there.
 *
 * Which URLs may actually open is not decided here -- `readBridgeExternalLinkUrl` owns the scheme
 * list, in the half that ships over the air.
 */
internal fun mobileWebShellNavigationVerdict(
  url: String?,
  isForMainFrame: Boolean,
  isDocumentUrl: Boolean,
  hasGesture: Boolean,
  isDownload: Boolean
): MobileWebShellNavigationVerdict {
  if (!isForMainFrame) return MobileWebShellNavigationVerdict.Cancel
  if (hasGesture) {
    val offered = mobileWebShellOfferableUrl(url) ?: return MobileWebShellNavigationVerdict.Cancel
    return MobileWebShellNavigationVerdict.CancelAndOffer(offered)
  }
  if (isDownload || !isDocumentUrl) return MobileWebShellNavigationVerdict.Cancel
  return MobileWebShellNavigationVerdict.Allow
}
