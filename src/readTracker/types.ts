import { TimestampedLineRange } from '../modules/line/types';

/**
 * ReadTracker highlight type constant (for LineHighlight integration)
 */
export const READ_TRACKER_HIGHLIGHT_TYPE = 'readTracker';

/**
 * ReadTracker-specific line range (with timestamp)
 * Extends TimestampedLineRange for future expansion (memo, tags, etc.)
 */
export interface ReadLineRange extends TimestampedLineRange {
    // Reserved for future expansion
}

/**
 * File-level reading record
 */
export interface ReadRecord {
    id: string;                 // Unique identifier (for future expansion)
    filePath: string;           // File path (explicitly stored)
    lines: ReadLineRange[];     // List of read line ranges
    createdAt: string;          // Creation datetime (ISO 8601)
    updatedAt: string;          // Update datetime (ISO 8601)
}

/**
 * Statistics for status bar display
 */
export interface ReadStats {
    totalFiles: number;         // Number of files read
    totalLines: number;         // Number of lines read (no duplicates)
    todayLines: number;         // Lines read today
    weeklyLines: number;        // Lines read this week
}

/**
 * File detailed statistics (for future expansion)
 */
export interface FileReadStats {
    filePath: string;
    linesRead: number;          // Number of lines read
    totalLines: number | null;  // Total lines in file (null if unavailable)
    percentage: number | null;  // Read percentage (null if unavailable)
    lastReadAt: string;         // Last read datetime (ISO 8601)
}

/**
 * ReadTracker data structure (stored in readTracker.json)
 */
export interface ReadTrackerData {
    Records: {
        [filePath: string]: ReadRecord;
    };
    Config: {
        debug: boolean;
        weekStartsOnMonday: boolean;  // Week start day (true: Monday, false: Sunday)
    };
    Version: string;
}
