/**
 * Centralized modal constraints configuration
 * Modals auto-size to content within these bounds
 */

export const MODAL_CONSTRAINTS = {
	/** Minimum width for all modals */
	MIN_WIDTH: '400px',
	/** Maximum width for all modals */
	MAX_WIDTH: '800px',
	/** Maximum height for modal content */
	MAX_HEIGHT: '85vh'
} as const;
