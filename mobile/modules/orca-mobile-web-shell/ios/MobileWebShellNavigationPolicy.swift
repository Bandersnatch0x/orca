import Foundation

/// What the shell does with one navigation: the whole decision, so the "allow it" half and the
/// "offer it to the opener" half cannot drift apart.
enum MobileWebShellNavigationVerdict: Equatable {
  /// The served document loading itself, which is the only navigation this WebView performs.
  case allow
  /// Refused, and the host is told nothing. Every navigation was this before the preview existed.
  case cancel
  /// Refused, and the URL is handed to the host's opener, which decides what may open.
  case cancelAndOffer(String)
}

/// The rule for a navigation the shell is deciding about.
///
/// Framework-free on purpose, like `MobileWebShellOrigin`: `tests/MobileWebShellChecks.swift`
/// compiles this file with `swiftc` and checks it without a device or a simulator. Kept in step with
/// the Kotlin copy.
enum MobileWebShellNavigationPolicy {
  /// Longest URL the shell hands back to JS for a cancelled navigation.
  ///
  /// The page's own bound is `BRIDGE_MAX_EXTERNAL_LINK_CHARS` (2048) and the filter that applies it
  /// is `readBridgeExternalLinkUrl`, in TypeScript. This is not a second copy of that rule: it is a
  /// cap on what crosses the native boundary at all, so an artifact cannot spend the bridge on a URL
  /// the opener will refuse anyway.
  static let maxCancelledNavigationUrlCharacters = 4096

  /// The whole decision.
  ///
  /// Three rules, in this order, and the order is the design.
  ///
  /// A navigation outside the main frame is the sealed preview frame loading itself. It is refused
  /// and never offered: forwarding it would let an artifact ask for a browser with no tap behind it.
  ///
  /// **A navigation a human started is never allowed, whatever it names.** `isDocumentUrl` is true
  /// for `href="/"` and for `href=""` in an artifact, because both resolve against the embedder's
  /// base, so without this rule one tap inside the preview would reload the shell's own page --
  /// clearing the bridge target, restarting the load state and losing everything the page held. It
  /// is offered instead, and the opener's scheme list drops the shell's own origin in silence
  /// exactly as it drops a route.
  ///
  /// Only a navigation with no gesture behind it can be allowed, and only to the served document:
  /// that is the page rewriting its own path, and the one navigation this WebView performs. A
  /// download is refused there rather than allowed, because a download is not a document load; with
  /// a gesture it takes the rule above and reaches the opener, which is what makes `<a download>`
  /// behave the way it does on the native screens.
  ///
  /// Which URLs may actually open is not decided here -- `readBridgeExternalLinkUrl` owns the scheme
  /// list, in the half that ships over the air.
  static func verdict(
    url: String?,
    isMainFrame: Bool,
    isDocumentUrl: Bool,
    hasGesture: Bool,
    isDownload: Bool
  ) -> MobileWebShellNavigationVerdict {
    guard isMainFrame else {
      return .cancel
    }
    if hasGesture {
      guard let offered = offerableUrl(url) else {
        return .cancel
      }
      return .cancelAndOffer(offered)
    }
    guard !isDownload, isDocumentUrl else {
      return .cancel
    }
    return .allow
  }

  /// The URL a cancelled navigation may be offered under, or nil when nothing crosses.
  static func offerableUrl(_ url: String?) -> String? {
    guard let url, !url.isEmpty, url.count <= maxCancelledNavigationUrlCharacters else {
      return nil
    }
    return url
  }
}
