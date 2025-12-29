/**
 * Base types for line range operations
 * Shared by LineHighlight, SyntaxHighlight, and ReadTracker
 */

/**
 * Base: Line range (1-indexed)
 * Note: Identical structure to CodeMarkerLine
 */
export interface LineRange {
    startLine: number;      // Start line (1-indexed)
    endLine: number;        // End line (1-indexed)
}

/**
 * Base: Line range with timestamp
 * Used for features that need to track when lines were marked
 */
export interface TimestampedLineRange extends LineRange {
    markedAt: string;       // Marked datetime (ISO 8601 string)
}
