import { adjustRowsForViewport, applyFitScale, clampPan } from './fit-scale'
import { handleMsg, notify, reportEngineError, repositionOverlay } from './document-externals'
import { updateTransform } from './viewport-transform'
import { scope } from './document-scope'

declare global {
  interface Window {
    Terminal?: unknown
  }
}

/** The decoded host message; only its type is read here, by the error reporter. */
type TerminalHostMessage = { type?: unknown } | undefined

export function handleIncomingMessage(e: Event & { data?: TerminalHostMessage | string }) {
  let msg: TerminalHostMessage
  try {
    msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
  } catch {
    return
  }
  try {
    handleMsg(msg)
  } catch (ex) {
    reportEngineError(
      msg && msg.type === 'init' ? 'terminal init failed' : 'terminal message failed',
      ex,
      msg && msg.type === 'init' && !scope.everReady
    )
  }
}

window.addEventListener('message', handleIncomingMessage)

document.addEventListener('message', handleIncomingMessage)

window.addEventListener('resize', function () {
  // Why: viewport changed (keyboard open/close, orientation, RN container
  // size update). Re-fit so the scale matches the new vpWidth — without
  // this, opening the keyboard leaves the terminal at the old scale even
  // though there's now less vertical room and the fit ratio may differ.
  applyFitScale('window-resize')
  adjustRowsForViewport()
  repositionOverlay()
  clampPan()
  updateTransform()
})

if (window.Terminal) {
  notify({ type: 'web-ready' })
} else {
  reportEngineError('terminal engine missing', 'xterm failed to load', true)
}
