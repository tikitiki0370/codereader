import { LineRange, TimestampedLineRange } from './types';

/**
 * Utility class for line range operations
 */
export class LineRangeUtils {
    /**
     * Check if a line number is within any of the ranges
     */
    static isLineInRanges(ranges: LineRange[], line: number): boolean {
        return ranges.some(r => line >= r.startLine && line <= r.endLine);
    }

    /**
     * Count unique lines (for statistics)
     * Handles overlapping ranges by using a Set
     */
    static countUniqueLines(ranges: LineRange[]): number {
        const lineSet = new Set<number>();
        for (const range of ranges) {
            for (let i = range.startLine; i <= range.endLine; i++) {
                lineSet.add(i);
            }
        }
        return lineSet.size;
    }

    /**
     * Remove a specific line from ranges (may split a range)
     * @param ranges - The ranges to modify
     * @param lineToRemove - The line number to remove
     * @param cloneRange - Function to clone a range with new start/end lines
     * @returns New array of ranges with the line removed
     */
    static removeLineFromRanges<T extends LineRange>(
        ranges: T[],
        lineToRemove: number,
        cloneRange: (original: T, startLine: number, endLine: number) => T
    ): T[] {
        const result: T[] = [];
        for (const range of ranges) {
            if (lineToRemove < range.startLine || lineToRemove > range.endLine) {
                // Line is outside this range, keep as is
                result.push(range);
            } else if (range.startLine === range.endLine) {
                // Single line range that matches, remove entirely
            } else if (lineToRemove === range.startLine) {
                // Remove first line
                result.push(cloneRange(range, range.startLine + 1, range.endLine));
            } else if (lineToRemove === range.endLine) {
                // Remove last line
                result.push(cloneRange(range, range.startLine, range.endLine - 1));
            } else {
                // Remove middle line, split into two ranges
                result.push(cloneRange(range, range.startLine, lineToRemove - 1));
                result.push(cloneRange(range, lineToRemove + 1, range.endLine));
            }
        }
        return result;
    }

    /**
     * Remove a range of lines from ranges
     * @param ranges - The ranges to modify
     * @param startLine - Start of range to remove (inclusive)
     * @param endLine - End of range to remove (inclusive)
     * @param cloneRange - Function to clone a range with new start/end lines
     * @returns New array of ranges with the lines removed
     */
    static removeRangeFromRanges<T extends LineRange>(
        ranges: T[],
        startLine: number,
        endLine: number,
        cloneRange: (original: T, startLine: number, endLine: number) => T
    ): T[] {
        const result: T[] = [];
        for (const range of ranges) {
            // No overlap
            if (endLine < range.startLine || startLine > range.endLine) {
                result.push(range);
                continue;
            }

            // Complete overlap - range is fully contained in removal range
            if (startLine <= range.startLine && endLine >= range.endLine) {
                // Remove entire range
                continue;
            }

            // Partial overlap - keep parts outside removal range
            if (startLine > range.startLine && endLine < range.endLine) {
                // Removal is in the middle, split into two
                result.push(cloneRange(range, range.startLine, startLine - 1));
                result.push(cloneRange(range, endLine + 1, range.endLine));
            } else if (startLine <= range.startLine) {
                // Removal overlaps start
                result.push(cloneRange(range, endLine + 1, range.endLine));
            } else {
                // Removal overlaps end
                result.push(cloneRange(range, range.startLine, startLine - 1));
            }
        }
        return result;
    }

    /**
     * Count unique lines filtered by date
     */
    static countLinesByDate(
        ranges: TimestampedLineRange[],
        since: Date
    ): number {
        const filtered = ranges.filter(r => new Date(r.markedAt) >= since);
        return this.countUniqueLines(filtered);
    }

    /**
     * Get all unique line numbers from ranges
     */
    static getUniqueLines(ranges: LineRange[]): number[] {
        const lineSet = new Set<number>();
        for (const range of ranges) {
            for (let i = range.startLine; i <= range.endLine; i++) {
                lineSet.add(i);
            }
        }
        return Array.from(lineSet).sort((a, b) => a - b);
    }
}
