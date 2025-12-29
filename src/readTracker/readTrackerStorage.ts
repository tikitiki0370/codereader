import * as vscode from 'vscode';
import { StateController } from '../stateController';
import { LineRangeUtils } from '../modules/line/lineRangeUtils';
import {
    ReadTrackerData,
    ReadRecord,
    ReadLineRange,
    ReadStats,
    FileReadStats
} from './types';

/**
 * Storage operations for ReadTracker
 * No folder management - simple file-based organization
 */
export class ReadTrackerStorage {
    private readonly TOOL_NAME = 'readTracker';
    private readonly VERSION = '1.0.0';

    constructor(
        private stateController: StateController,
        private context: vscode.ExtensionContext
    ) {}

    /**
     * Generate a unique ID
     */
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    /**
     * Normalize file path to workspace-relative path
     */
    private normalizePath(filePath: string): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder && filePath.startsWith(workspaceFolder.uri.fsPath)) {
            return vscode.workspace.asRelativePath(filePath);
        }
        return filePath;
    }

    /**
     * Get ReadTracker data, initializing if necessary
     */
    async getReadTrackerData(): Promise<ReadTrackerData> {
        const data = await this.stateController.get(this.TOOL_NAME);
        if (data) {
            return data as ReadTrackerData;
        }

        // Initialize with default data
        const defaultData: ReadTrackerData = {
            Records: {},
            Config: {
                debug: false,
                weekStartsOnMonday: true
            },
            Version: this.VERSION
        };

        return defaultData;
    }

    /**
     * Save data to storage
     */
    private async saveData(data: ReadTrackerData): Promise<void> {
        this.stateController.set(this.TOOL_NAME, data);
    }

    /**
     * Get merge window setting from VSCode configuration
     */
    private getMergeWindowMinutes(): number {
        return vscode.workspace.getConfiguration('codereader.readTracker').get('mergeWindowMinutes', 5);
    }

    /**
     * Check if two ranges are adjacent or overlapping
     */
    private isAdjacentOrOverlapping(
        range1: { startLine: number; endLine: number },
        range2: { startLine: number; endLine: number }
    ): boolean {
        // Adjacent: range1.endLine + 1 === range2.startLine or range2.endLine + 1 === range1.startLine
        // Overlapping: ranges intersect
        return range1.startLine <= range2.endLine + 1 && range2.startLine <= range1.endLine + 1;
    }

    /**
     * Add a line range to a file's record
     * Merges with existing ranges if within mergeWindowMinutes and adjacent/overlapping
     */
    async addLineRange(
        filePath: string,
        range: { startLine: number; endLine: number; markedAt?: string }
    ): Promise<void> {
        const data = await this.getReadTrackerData();
        const normalizedPath = this.normalizePath(filePath);
        const now = new Date().toISOString();
        const nowTime = new Date(now).getTime();

        const mergeWindowMinutes = this.getMergeWindowMinutes();
        const mergeWindowMs = mergeWindowMinutes * 60 * 1000;

        let newStartLine = range.startLine;
        let newEndLine = range.endLine;
        const newMarkedAt = range.markedAt || now;

        if (!data.Records[normalizedPath]) {
            // Create new record
            data.Records[normalizedPath] = {
                id: `read_${this.generateId()}`,
                filePath: normalizedPath,
                lines: [{
                    startLine: newStartLine,
                    endLine: newEndLine,
                    markedAt: newMarkedAt
                }],
                createdAt: now,
                updatedAt: now
            };
        } else {
            const record = data.Records[normalizedPath];

            if (mergeWindowMinutes > 0) {
                // Find ranges to merge (within time window and adjacent/overlapping)
                const indicesToMerge: number[] = [];

                for (let i = 0; i < record.lines.length; i++) {
                    const existingRange = record.lines[i];
                    const existingTime = new Date(existingRange.markedAt).getTime();
                    const timeDiff = Math.abs(nowTime - existingTime);

                    if (timeDiff <= mergeWindowMs &&
                        this.isAdjacentOrOverlapping(existingRange, { startLine: newStartLine, endLine: newEndLine })) {
                        indicesToMerge.push(i);
                        // Expand the new range to include the existing range
                        newStartLine = Math.min(newStartLine, existingRange.startLine);
                        newEndLine = Math.max(newEndLine, existingRange.endLine);
                    }
                }

                // Remove merged ranges (in reverse order to maintain indices)
                for (let i = indicesToMerge.length - 1; i >= 0; i--) {
                    record.lines.splice(indicesToMerge[i], 1);
                }
            }

            // Add the (possibly merged) range
            record.lines.push({
                startLine: newStartLine,
                endLine: newEndLine,
                markedAt: newMarkedAt
            });
            record.updatedAt = now;
        }

        await this.saveData(data);
    }

    /**
     * Get record for a specific file
     */
    async getRecord(filePath: string): Promise<ReadRecord | null> {
        const data = await this.getReadTrackerData();
        const normalizedPath = this.normalizePath(filePath);
        return data.Records[normalizedPath] || null;
    }

    /**
     * Get all records
     */
    async getAllRecords(): Promise<ReadRecord[]> {
        const data = await this.getReadTrackerData();
        return Object.values(data.Records);
    }

    /**
     * Check if a specific line has been read
     */
    async isLineRead(filePath: string, line: number): Promise<boolean> {
        const record = await this.getRecord(filePath);
        if (!record) return false;
        return LineRangeUtils.isLineInRanges(record.lines, line);
    }

    /**
     * Remove a specific line from a file's record
     */
    async removeLineFromRecord(filePath: string, line: number): Promise<boolean> {
        const data = await this.getReadTrackerData();
        const normalizedPath = this.normalizePath(filePath);
        const record = data.Records[normalizedPath];

        if (!record) return false;

        const cloneRange = (original: ReadLineRange, startLine: number, endLine: number): ReadLineRange => ({
            ...original,
            startLine,
            endLine
        });

        const newLines = LineRangeUtils.removeLineFromRanges(record.lines, line, cloneRange);

        if (newLines.length === 0) {
            // Remove entire record if no lines left
            delete data.Records[normalizedPath];
        } else {
            record.lines = newLines;
            record.updatedAt = new Date().toISOString();
        }

        await this.saveData(data);
        return true;
    }

    /**
     * Remove a range of lines from a file's record (efficient bulk removal)
     */
    async removeRangeFromRecord(
        filePath: string,
        startLine: number,
        endLine: number
    ): Promise<boolean> {
        const data = await this.getReadTrackerData();
        const normalizedPath = this.normalizePath(filePath);
        const record = data.Records[normalizedPath];

        if (!record) return false;

        const cloneRange = (original: ReadLineRange, start: number, end: number): ReadLineRange => ({
            ...original,
            startLine: start,
            endLine: end
        });

        const newLines = LineRangeUtils.removeRangeFromRanges(
            record.lines,
            startLine,
            endLine,
            cloneRange
        );

        if (newLines.length === 0) {
            delete data.Records[normalizedPath];
        } else {
            record.lines = newLines;
            record.updatedAt = new Date().toISOString();
        }

        await this.saveData(data);
        return true;
    }

    /**
     * Clear all records for a specific file
     */
    async clearFile(filePath: string): Promise<void> {
        const data = await this.getReadTrackerData();
        const normalizedPath = this.normalizePath(filePath);
        delete data.Records[normalizedPath];
        await this.saveData(data);
    }

    /**
     * Clear all records
     */
    async clearAll(): Promise<void> {
        const data = await this.getReadTrackerData();
        data.Records = {};
        await this.saveData(data);
    }

    /**
     * Get overall statistics
     */
    async getStats(): Promise<ReadStats> {
        const data = await this.getReadTrackerData();
        const allRecords = Object.values(data.Records);

        // Get week start day setting
        const weekStartsOnMonday = data.Config.weekStartsOnMonday ?? true;

        // Today's start time
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // This week's start time (based on configuration)
        const weekStart = new Date(today);
        const dayOfWeek = weekStart.getDay();
        let diff: number;
        if (weekStartsOnMonday) {
            // Monday is week start
            diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        } else {
            // Sunday is week start
            diff = dayOfWeek;
        }
        weekStart.setDate(weekStart.getDate() - diff);

        let totalLines = 0;
        let todayLines = 0;
        let weeklyLines = 0;

        for (const record of allRecords) {
            totalLines += LineRangeUtils.countUniqueLines(record.lines);
            todayLines += LineRangeUtils.countLinesByDate(record.lines, today);
            weeklyLines += LineRangeUtils.countLinesByDate(record.lines, weekStart);
        }

        return {
            totalFiles: allRecords.length,
            totalLines,
            todayLines,
            weeklyLines
        };
    }

    /**
     * Get statistics for a specific file
     */
    async getFileStats(filePath: string): Promise<FileReadStats | null> {
        const record = await this.getRecord(filePath);
        if (!record) return null;

        const linesRead = LineRangeUtils.countUniqueLines(record.lines);

        // Find the most recent markedAt timestamp
        let lastReadAt = record.createdAt;
        for (const line of record.lines) {
            if (line.markedAt > lastReadAt) {
                lastReadAt = line.markedAt;
            }
        }

        return {
            filePath: record.filePath,
            linesRead,
            totalLines: null,  // Would need to read the actual file
            percentage: null,  // Cannot calculate without total lines
            lastReadAt
        };
    }

    /**
     * Get configuration
     */
    async getConfig(): Promise<ReadTrackerData['Config']> {
        const data = await this.getReadTrackerData();
        return data.Config;
    }

    /**
     * Update configuration
     */
    async updateConfig(config: Partial<ReadTrackerData['Config']>): Promise<void> {
        const data = await this.getReadTrackerData();
        data.Config = { ...data.Config, ...config };
        await this.saveData(data);
    }
}
