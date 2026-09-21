import Foundation

/// The rule for a navigation the shell has decided to cancel: whether the host should be offered
/// the URL, or whether it stays cancelled and silent.
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

  /// The URL a cancelled navigation should be offered to the host for, or nil to stay silent.
  ///
  /// Only a main-frame navigation: the sealed preview frame's own loads are not the user leaving the
  /// app, and forwarding one would let an artifact ask for a browser with no tap behind it. Which
  /// URLs are openable is not decided here — `readBridgeExternalLinkUrl` owns the scheme list, in
  /// the half that ships over the air — so this says "a human aimed the top frame somewhere else"
  /// and nothing more.
  static func cancelledNavigationUrl(
    url: String?,
    isMainFrame: Bool,
    cancelled: Bool
  ) -> String? {
    guard cancelled, isMainFrame, let url, !url.isEmpty,
          url.count <= maxCancelledNavigationUrlCharacters
    else {
      return nil
    }
    return url
  }
}
