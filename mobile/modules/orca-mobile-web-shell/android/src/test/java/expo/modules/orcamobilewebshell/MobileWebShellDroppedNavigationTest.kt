package expo.modules.orcamobilewebshell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private const val LINK = "https://example.com/artifact-link"

class MobileWebShellDroppedNavigationTest {
  @Test
  fun `offers the host a dropped main-frame navigation`() {
    assertEquals(LINK, mobileWebShellDroppedNavigationUrl(LINK, isForMainFrame = true, dropped = true))
  }

  @Test
  fun `offers nothing for a navigation the shell allowed`() {
    // The served document itself: allowed, and never something to open in a browser.
    assertNull(mobileWebShellDroppedNavigationUrl(LINK, isForMainFrame = true, dropped = false))
  }

  @Test
  fun `offers nothing for a subframe, which is the sealed preview loading itself`() {
    assertNull(mobileWebShellDroppedNavigationUrl(LINK, isForMainFrame = false, dropped = true))
  }

  @Test
  fun `offers nothing for an absent or empty url, and nothing past the crossing cap`() {
    assertNull(mobileWebShellDroppedNavigationUrl(null, isForMainFrame = true, dropped = true))
    assertNull(mobileWebShellDroppedNavigationUrl("", isForMainFrame = true, dropped = true))
    val cap = MOBILE_WEB_SHELL_MAX_DROPPED_NAVIGATION_URL_CHARS
    val atCap = "https://example.com/" + "a".repeat(cap - "https://example.com/".length)
    assertEquals(cap, atCap.length)
    assertEquals(atCap, mobileWebShellDroppedNavigationUrl(atCap, isForMainFrame = true, dropped = true))
    assertNull(mobileWebShellDroppedNavigationUrl(atCap + "a", isForMainFrame = true, dropped = true))
  }

  @Test
  fun `says nothing about which schemes open, because TypeScript owns that list`() {
    // A scheme the opener will refuse still crosses: one filter, in the half that updates.
    assertEquals(
      "javascript:alert(1)",
      mobileWebShellDroppedNavigationUrl("javascript:alert(1)", isForMainFrame = true, dropped = true)
    )
  }
}
