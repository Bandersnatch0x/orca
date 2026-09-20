import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'
import type { TerminalWebViewHandle, TerminalWebViewProps } from './terminal-webview-contract'
import { TerminalWebViewEngineErrorOverlay } from './terminal-webview-engine-error-state'
import { TERMINAL_WEBVIEW_FRAME_STYLES } from './terminal-webview-frame-styles'
import type { TerminalWebViewCommand } from './terminal-webview-messages'
import { mountTerminalWebDocument, type TerminalWebDocument } from './terminal-web-document-mount'
import { useTerminalWebViewController } from './use-terminal-webview-controller'

type Props = TerminalWebViewProps

export type { TerminalWebViewHandle } from './terminal-webview-contract'

/**
 * The same terminal, with the WebView taken out.
 *
 * `react-native-webview` has no web build that renders anything: on the page it paints the line
 * "React Native WebView does not support this platform" where the terminal was. So the page mounts
 * the document itself — xterm as an import, the document's own modules as modules — and keeps the
 * contract above it exactly as it was. `TerminalPaneView` and the subscription foundation hold
 * `TerminalWebViewProps` and `TerminalWebViewHandle` and cannot tell which of the two they have.
 *
 * Both halves of the transport are the same objects the native component uses: the commands are
 * `TerminalWebViewCommand`, handed to the document's own `handleMsg` instead of across a bridge,
 * and every notify goes back through the controller's `receive`, which is the same dispatch.
 */
export const TerminalWebView = forwardRef<TerminalWebViewHandle, Props>(
  function TerminalWebView(props, ref) {
    const hostRef = useRef<View>(null)
    const documentRef = useRef<TerminalWebDocument | null>(null)
    // The document is mounted in an effect and commands can be handled before it answers, so the
    // controller's queue is not enough on its own: a `set-theme` posted on the first render would
    // otherwise be dropped rather than queued. Held here and replayed when the mount resolves.
    const beforeMountRef = useRef<(TerminalWebViewCommand & { id: number })[]>([])
    const receiveRef = useRef<((message: Record<string, unknown>) => void) | null>(null)

    const post = useCallback((command: TerminalWebViewCommand & { id: number }) => {
      const mounted = documentRef.current
      if (mounted) {
        mounted.send(command)
        return
      }
      beforeMountRef.current.push(command)
    }, [])

    const controller = useTerminalWebViewController(props, {
      post,
      // No second content process to lose: the document is this page's own modules, and if they
      // were gone so was the component holding this handle.
      pingsOnForegroundRecovery: () => false
    })
    const { clearEngineError, confirmWebReady, engineError, handle, receive, resetReadiness } =
      controller
    // The page's answer to the WebView's reload: drop the document and build another one. The host
    // element is keyed on it so React replaces the div rather than handing back one xterm left in.
    const [generation, setGeneration] = useState(0)

    useImperativeHandle(ref, () => handle, [handle])
    // In an effect, not during render: React may replay or discard render work, and the document
    // reads this ref from a callback that outlives the render that mounted it. The mount effect
    // below is declared after this one, so the first read already sees a sink.
    useEffect(() => {
      receiveRef.current = receive
    }, [receive])

    useEffect(() => {
      let cancelled = false
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: react-native-web renders View as a div and forwards the ref to it; this module only ever runs in that build.
      const host = hostRef.current as unknown as HTMLElement | null
      if (!host) {
        return
      }
      void mountTerminalWebDocument(host, (message) => receiveRef.current?.(message)).then(
        (mounted) => {
          if (cancelled) {
            mounted.dispose()
            return
          }
          documentRef.current = mounted
          for (const command of beforeMountRef.current) {
            mounted.send(command)
          }
          beforeMountRef.current = []
          // The WebView's document posts this as its last parsed statement, once it has seen the
          // engine. Here the engine is an import that already resolved, so the mount is the moment.
          confirmWebReady(true)
        }
      )
      return () => {
        cancelled = true
        documentRef.current?.dispose()
        documentRef.current = null
      }
      // Mounted once per generation: re-running this would throw away a live terminal and its
      // scrollback, and the controller's identity changes with every callback prop.
      // `confirmWebReady` is read on the mount path only, which is why it is not a dependency.
    }, [generation])

    const handleReload = useCallback(() => {
      clearEngineError()
      resetReadiness()
      beforeMountRef.current = []
      setGeneration((previous) => previous + 1)
    }, [clearEngineError, resetReadiness])

    return (
      <View style={[TERMINAL_WEBVIEW_FRAME_STYLES.container, props.style]}>
        <View key={generation} ref={hostRef} style={TERMINAL_WEBVIEW_FRAME_STYLES.webview} />
        {engineError ? (
          <TerminalWebViewEngineErrorOverlay message={engineError} onReload={handleReload} />
        ) : null}
      </View>
    )
  }
)
