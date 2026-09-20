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
