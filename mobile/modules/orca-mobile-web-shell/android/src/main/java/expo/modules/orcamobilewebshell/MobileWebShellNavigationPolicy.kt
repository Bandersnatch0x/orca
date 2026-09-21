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
 * **The document URL loads only when the shell asked for it.** `isShellLoad` is a flag the view
 * raises around its own `loadUrl` and drops at commit; nothing a document does can raise it. Every
 * other navigation naming the document is refused and never offered -- offering the shell's own URL
 * to the opener would send the user out of the app instead of reloading it.
 *
 * Nothing here rests on the host reporting a gesture. Chromium's own documentation allows
 * `hasGesture()` to be false for a request a human started, and a sandboxed subframe navigating the
 * top frame reports no gesture at all -- measured on WebKit, where the same navigation arrives as
 * `.other`. Under a gesture-shaped rule that is an allow and a shell reload: the reply proxy
 * dropped, the load state restarted, the page's state gone.
 *
 * `isFromSubframe` is the iOS twin's second discriminator, where the initiating frame is readable.
 * Chromium does not report it here, so this platform passes false and rests on the flag alone.
 *
 * What is left for the gesture is the only thing an artifact may ask for: a foreign URL, refused
 * and handed to the opener. `isDownload` is always false here and is carried so this reads as its
 * iOS twin does; Chromium never offers a download through `shouldOverrideUrlLoading`, it goes to
 * the `DownloadListener` the view installs as a no-op.
 *
 * Which URLs may actually open is not decided here -- `readBridgeExternalLinkUrl` owns the scheme
 * list, in the half that ships over the air.
 */
internal fun mobileWebShellNavigationVerdict(
  url: String?,
  isForMainFrame: Boolean,
  isFromSubframe: Boolean,
  isDocumentUrl: Boolean,
  isShellLoad: Boolean,
  hasGesture: Boolean,
  isDownload: Boolean
): MobileWebShellNavigationVerdict {
  if (!isForMainFrame) return MobileWebShellNavigationVerdict.Cancel
  if (isDocumentUrl && !isDownload) {
    return if (isShellLoad && !isFromSubframe) {
      MobileWebShellNavigationVerdict.Allow
    } else {
      MobileWebShellNavigationVerdict.Cancel
    }
  }
  if (!hasGesture) return MobileWebShellNavigationVerdict.Cancel
  val offered = mobileWebShellOfferableUrl(url) ?: return MobileWebShellNavigationVerdict.Cancel
  return MobileWebShellNavigationVerdict.CancelAndOffer(offered)
}
