package expo.modules.orcamobilewebshell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private const val FOREIGN = "https://example.com/artifact-link"
private const val DOCUMENT = "orca-mobile-web://sess-01JN_aZ9/"

private fun verdict(
  url: String? = FOREIGN,
  isForMainFrame: Boolean = true,
  isDocumentUrl: Boolean = false,
  hasGesture: Boolean = true,
  isDownload: Boolean = false
) = mobileWebShellNavigationVerdict(url, isForMainFrame, isDocumentUrl, hasGesture, isDownload)

class MobileWebShellDroppedNavigationTest {
  @Test
  fun `cancels a foreign navigation a human started and offers it to the opener`() {
    assertEquals(MobileWebShellNavigationVerdict.CancelAndOffer(FOREIGN), verdict())
  }

  @Test
  fun `refuses a link-activated navigation even when it names the document itself`() {
    // `href="/"` and `href=""` in an artifact resolve against the embedder's base, so without this
    // one tap inside the sealed preview would reload the shell's own page. Offered rather than
    // allowed; the opener's scheme list drops the shell's own origin in silence.
    assertEquals(
      MobileWebShellNavigationVerdict.CancelAndOffer(DOCUMENT),
      verdict(url = DOCUMENT, isDocumentUrl = true)
    )
  }

  @Test
  fun `allows the document's own programmatic load, which has no gesture behind it`() {
    assertEquals(
      MobileWebShellNavigationVerdict.Allow,
      verdict(url = DOCUMENT, isDocumentUrl = true, hasGesture = false)
    )
  }

  @Test
  fun `cancels a foreign navigation with no gesture and offers nothing`() {
    // A top-page meta refresh or a redirect: refused, and never opened in a browser, because
    // nothing a human did asked for it.
    assertEquals(MobileWebShellNavigationVerdict.Cancel, verdict(hasGesture = false))
  }

  @Test
  fun `cancels a download rather than allowing it, and offers a gesture-started one`() {
    assertEquals(
      MobileWebShellNavigationVerdict.Cancel,
      verdict(url = DOCUMENT, isDocumentUrl = true, hasGesture = false, isDownload = true)
    )
    assertEquals(
      MobileWebShellNavigationVerdict.CancelAndOffer(FOREIGN),
      verdict(isDownload = true)
    )
  }

  @Test
  fun `offers nothing for a subframe, which is the sealed preview loading itself`() {
    assertEquals(MobileWebShellNavigationVerdict.Cancel, verdict(isForMainFrame = false))
    assertEquals(
      MobileWebShellNavigationVerdict.Cancel,
      verdict(isForMainFrame = false, hasGesture = false)
    )
  }

  @Test
  fun `offers nothing for an absent or empty url, and nothing past the crossing cap`() {
    assertEquals(MobileWebShellNavigationVerdict.Cancel, verdict(url = null))
    assertEquals(MobileWebShellNavigationVerdict.Cancel, verdict(url = ""))
    val cap = MOBILE_WEB_SHELL_MAX_DROPPED_NAVIGATION_URL_CHARS
    val atCap = "https://example.com/" + "a".repeat(cap - "https://example.com/".length)
    assertEquals(cap, atCap.length)
    assertEquals(atCap, mobileWebShellOfferableUrl(atCap))
    assertNull(mobileWebShellOfferableUrl(atCap + "a"))
    assertEquals(MobileWebShellNavigationVerdict.Cancel, verdict(url = atCap + "a"))
  }

  @Test
  fun `says nothing about which schemes open, because TypeScript owns that list`() {
    // A scheme the opener will refuse still crosses: one filter, in the half that updates.
    assertEquals(
      MobileWebShellNavigationVerdict.CancelAndOffer("javascript:alert(1)"),
      verdict(url = "javascript:alert(1)")
    )
  }
}
