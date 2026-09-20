/**
 * The document's functions that have not become modules yet.
 *
 * C7.1 extracts the script one coherent group at a time, so a group that has moved still calls into
 * groups that have not. Those are declared here with the shape the moved code uses, and the
 * generator emits nothing for this file: inside the document they are the functions the remaining
 * string slices still define, and in the page's build they will be what the next group exports.
 *
 * This file only shrinks. When the last group moves it is deleted.
 */

/** `smooth-scroll-and-cell-geometry`: one character cell's width in surface pixels. */
export declare function getCellWidth(): number

/** `smooth-scroll-and-cell-geometry`: one character cell's height in surface pixels. */
export declare function getCellHeight(): number

/** `terminal-fit-scale`: the fit scale times the user's pinch scale. */
export declare function getTotalScale(): number

/** `runtime-state-and-text-scaling`: posts one message to the native host. */
export declare function notify(message: Record<string, unknown>): void

/** `write-queue`: runs a callback when the replay queue reaches the point it was enqueued at. */
export declare function enqueueWriteBoundary(callback: () => void): void

/** `terminal-init-and-write`: whether xterm is showing the alternate screen buffer. */
export declare function isAlternateBufferActive(): boolean

/** `terminal-fit-scale`: recomputes the fit scale and applies it, naming why. */
export declare function applyFitScale(reason: string): void

/** `smooth-scroll-and-cell-geometry`: shows or hides the scroll indicator. */
export declare function updateScrollIndicator(visible: boolean): void

/** `runtime-state-and-text-scaling`: one diagnostic line, forwarded to the host. */
export declare function flog(name: string, detail: Record<string, unknown>): void

/** `mouse-report-and-scroll-routing`: whether scrolling should reach the TUI as input. */
export declare function shouldRouteScrollToTerminalInput(): boolean

/** `mouse-report-and-scroll-routing`: sends a line scroll to the terminal at a point. */
export declare function routeScrollLines(lines: number, clientX: number, clientY: number): void

/** `smooth-scroll-and-cell-geometry`: queues a pixel scroll of the normal buffer. */
export declare function enqueueNormalBufferScrollDelta(deltaY: number): void

/** `smooth-scroll-and-cell-geometry`: drops any sub-line smooth-scroll travel. */
export declare function resetSmoothScrollOffset(): void

/** `term-observers-and-mode-mirroring`: disposes every xterm listener the last terminal held. */
export declare function disposeTermObservers(): void

/** `surface-touch-gestures`: binds touch, wheel and tap handlers to a surface element. */
export declare function attachSurfaceEventHandlers(target: HTMLElement): void

/** `mouse-report-and-scroll-routing`: the terminal cell under a viewport point, or null. */
export declare function viewportToCell(
  originX: number,
  originY: number
): { row: number; col: number } | null

/** `selection-overlay`: the text of one viewport row. */
export declare function getLineText(row: number): string

/** `selection-overlay`: the string index a cell column lands on, wide characters included. */
export declare function cellColToStringIndex(row: number, col: number): number

/** `selection-overlay`: starts a selection at a cell. */
export declare function enterSelect(col: number, row: number): void

/** `selection-overlay`: clears the selection and leaves select mode. */
export declare function cancelSelect(): void

/** `selection-overlay`: moves one selection handle to a viewport point. */
export declare function handleDragMove(handle: string, clientX: number, clientY: number): void

/** `selection-overlay`: stops the edge-scroll a handle drag may have started. */
export declare function stopEdgeScroll(): void

/** `mouse-report-and-scroll-routing`: the tracking mode the TUI last asked for. */
export declare function getMouseTrackingMode(): string

/** `mouse-report-and-scroll-routing`: whether a coordinate fits an SGR report. */
export declare function isSafeSgrMouseCoordinate(value: number): boolean

/** `selection-overlay`: mirrors the document selection into xterm's own selection. */
export declare function applyXtermSelection(): void

/** `selection-overlay`: moves the handles and the menu pill to the current selection. */
export declare function repositionOverlay(): void

/** `mouse-report-and-scroll-routing`: the bytes a plain click sends, or '' when it sends none. */
export declare function buildMouseClickInput(originX: number, originY: number): string

/** `mouse-report-and-scroll-routing`: whether a tracking mode consumes plain clicks. */
export declare function isClickMouseTrackingMode(mode: string): boolean

/** `write-queue`: the trailing bytes a DECSET scan must carry into the next chunk. */
export declare function extractMouseModeScanTail(input: string): string

/** `host-message-router`: routes one decoded host message. */
export declare function handleMsg(msg: unknown): void

/** `terminal-init-and-write`: reports an engine failure to the host. */
export declare function reportEngineError(summary: string, cause: unknown, fatal: unknown): void

/** `terminal-init-and-write`: re-fits the row count to the current viewport. */
export declare function adjustRowsForViewport(): void

/** `smooth-scroll-and-cell-geometry`: clamps the pan offsets to the scaled surface. */
export declare function clampPan(): void

/** `smooth-scroll-and-cell-geometry`: writes the pan and scale onto the surface transform. */
export declare function updateTransform(): void

/** `write-queue`: runs a callback once the write queue has drained. */
export declare function afterWritesDrained(callback: () => void): void
