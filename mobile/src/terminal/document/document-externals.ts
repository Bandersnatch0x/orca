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

/** `surface-touch-gestures`: binds touch, wheel and tap handlers to a surface element. */
export declare function attachSurfaceEventHandlers(target: HTMLElement): void

/** `selection-overlay`: starts a selection at a cell. */
export declare function enterSelect(col: number, row: number): void

/** `selection-overlay`: clears the selection and leaves select mode. */
export declare function cancelSelect(): void

/** `selection-overlay`: moves one selection handle to a viewport point. */
export declare function handleDragMove(handle: string, clientX: number, clientY: number): void

/** `selection-overlay`: stops the edge-scroll a handle drag may have started. */
export declare function stopEdgeScroll(): void

/** `selection-overlay`: mirrors the document selection into xterm's own selection. */
export declare function applyXtermSelection(): void

/** `selection-overlay`: moves the handles and the menu pill to the current selection. */
export declare function repositionOverlay(): void
