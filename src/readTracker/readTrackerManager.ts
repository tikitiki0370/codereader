import * as vscode from 'vscode';
import { ReadTrackerStorage } from './readTrackerStorage';
import { ReadTrackerStatusBar } from './readTrackerStatusBar';
import { ReadStats } from './types';
import { LineHighlightManager, PRESET_COLORS } from '../codeMarker/lineHighlightManager';
import { CodeMarkerStorage } from '../codeMarker/codeMarkerStorage';

// ReadTracker highlight type constant
const READ_TRACKER_HIGHLIGHT_TYPE = 'readTracker';
// Default color for ReadTracker highlights (Green)
const READ_TRACKER_HIGHLIGHT_COLOR = PRESET_COLORS[1].color;

/**
 * Manager for ReadTracker log recording
 * Simple log recording only - no visualization
 */
export class ReadTrackerManager {
    private lineHighlightManager?: LineHighlightManager;
    private codeMarkerStorage?: CodeMarkerStorage;

    constructor(
        private storage: ReadTrackerStorage,
        private statusBar: ReadTrackerStatusBar
    ) {}

    /**
     * Set LineHighlight integration (optional)
     */
    setLineHighlightIntegration(
        lineHighlightManager: LineHighlightManager,
        codeMarkerStorage: CodeMarkerStorage
    ): void {
        this.lineHighlightManager = lineHighlightManager;
        this.codeMarkerStorage = codeMarkerStorage;
    }

    /**
     * Check if sync mode is enabled
     */
    private isSyncModeEnabled(): boolean {
        return vscode.workspace.getConfiguration('codereader.readTracker').get('syncToLineHighlight', false);
    }

    /**
     * Mark a line range as read
     */
    async markAsRead(
        filePath: string,
        startLine: number,
        endLine: number
    ): Promise<void> {
        await this.storage.addLineRange(filePath, {
            startLine,
            endLine,
            markedAt: new Date().toISOString()
        });

        // Sync to LineHighlight if enabled
        if (this.isSyncModeEnabled() && this.lineHighlightManager && this.codeMarkerStorage) {
            const defaultFolder = await this.codeMarkerStorage.getValidLastedFolder();
            await this.lineHighlightManager.addHighlightWithType(
                defaultFolder,
                filePath,
                READ_TRACKER_HIGHLIGHT_COLOR,
                [{ startLine, endLine }],
                READ_TRACKER_HIGHLIGHT_TYPE
            );
        }

        await this.statusBar.update();
    }

    /**
     * Toggle read state for a single line
     * @returns true if line is now marked as read, false if unmarked
     */
    async toggleReadMark(
        filePath: string,
        line: number
    ): Promise<boolean> {
        const isRead = await this.storage.isLineRead(filePath, line);

        if (isRead) {
            await this.storage.removeLineFromRecord(filePath, line);
            await this.statusBar.update();

            // Sync to LineHighlight if enabled (re-sync to fix consistency)
            if (this.isSyncModeEnabled()) {
                await this.syncAllToLineHighlight();
            }

            return false;
        } else {
            await this.markAsRead(filePath, line, line);
            return true;
        }
    }

    /**
     * Unmark a selection range
     */
    async unmarkRange(
        filePath: string,
        startLine: number,
        endLine: number
    ): Promise<void> {
        // Efficient bulk removal
        await this.storage.removeRangeFromRecord(filePath, startLine, endLine);
        await this.statusBar.update();

        // Sync to LineHighlight if enabled (re-sync to fix consistency)
        if (this.isSyncModeEnabled()) {
            await this.syncAllToLineHighlight();
        }
    }

    /**
     * Clear all logs for a file
     */
    async clearFile(filePath: string): Promise<void> {
        await this.storage.clearFile(filePath);
        await this.statusBar.update();
    }

    /**
     * Get statistics
     */
    async getStats(): Promise<ReadStats> {
        return await this.storage.getStats();
    }

    /**
     * Check if a line is read
     */
    async isLineRead(filePath: string, line: number): Promise<boolean> {
        return await this.storage.isLineRead(filePath, line);
    }

    /**
     * Clear all reading records
     */
    async clearAll(): Promise<void> {
        await this.storage.clearAll();
        await this.statusBar.update();
    }

    /**
     * Sync all ReadTracker data to LineHighlight (fix consistency)
     * Deletes existing readTracker highlights and recreates from current data
     */
    async syncAllToLineHighlight(): Promise<void> {
        if (!this.lineHighlightManager || !this.codeMarkerStorage) {
            return;
        }

        // First, clear existing ReadTracker highlights
        await this.lineHighlightManager.deleteHighlightsByType(READ_TRACKER_HIGHLIGHT_TYPE);

        const records = await this.storage.getAllRecords();
        if (records.length === 0) {
            return;
        }

        // Get default folder for LineHighlight
        const defaultFolder = await this.codeMarkerStorage.getValidLastedFolder();

        for (const record of records) {
            if (record.lines.length === 0) continue;

            // Merge all lines into ranges for this file
            const lines = record.lines.map(l => ({
                startLine: l.startLine,
                endLine: l.endLine
            }));

            await this.lineHighlightManager.addHighlightWithType(
                defaultFolder,
                record.filePath,
                READ_TRACKER_HIGHLIGHT_COLOR,
                lines,
                READ_TRACKER_HIGHLIGHT_TYPE
            );
        }
    }
}
