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

/** `terminal-fit-scale`: applies a theme the host sent to the live terminal. */
export declare function applyTerminalTheme(input: unknown): void

/** `surface-touch-gestures`: whether a dispatcher above the surface is swallowing input. */
export declare function dispatcherShouldBlockSurface(): boolean

/** `mouse-report-and-scroll-routing`: whether scrolling should reach the TUI as input. */
export declare function shouldRouteScrollToTerminalInput(): boolean

/** `mouse-report-and-scroll-routing`: sends a line scroll to the terminal at a point. */
export declare function routeScrollLines(lines: number, clientX: number, clientY: number): void

/** `smooth-scroll-and-cell-geometry`: queues a pixel scroll of the normal buffer. */
export declare function enqueueNormalBufferScrollDelta(deltaY: number): void

/** `smooth-scroll-and-cell-geometry`: drops any sub-line smooth-scroll travel. */
export declare function resetSmoothScrollOffset(): void
