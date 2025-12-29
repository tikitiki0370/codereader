import * as vscode from 'vscode';
import { ReadTrackerManager } from './readTrackerManager';
import { ReadTrackerStorage } from './readTrackerStorage';
import { LineHighlightManager, PRESET_COLORS } from '../codeMarker/lineHighlightManager';
import { CodeMarkerStorage } from '../codeMarker/codeMarkerStorage';

// ReadTracker highlight type constant
const READ_TRACKER_HIGHLIGHT_TYPE = 'readTracker';
// Default color for ReadTracker highlights (Green)
const READ_TRACKER_HIGHLIGHT_COLOR = PRESET_COLORS[1].color;

/**
 * Command provider for ReadTracker
 * Follows the CommandProvider pattern used by other features
 */
export class ReadTrackerCommandProvider {
    constructor(
        private manager: ReadTrackerManager,
        private storage: ReadTrackerStorage,
        private context: vscode.ExtensionContext,
        private lineHighlightManager?: LineHighlightManager,
        private codeMarkerStorage?: CodeMarkerStorage
    ) {}

    /**
     * Register all ReadTracker commands
     */
    registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand(
                'codereader.readTracker.toggleReadMark',
                this.toggleReadMark.bind(this)
            ),
            vscode.commands.registerCommand(
                'codereader.readTracker.markSelection',
                this.markSelection.bind(this)
            ),
            vscode.commands.registerCommand(
                'codereader.readTracker.unmarkSelection',
                this.unmarkSelection.bind(this)
            ),
            vscode.commands.registerCommand(
                'codereader.readTracker.clearFile',
                this.clearFile.bind(this)
            ),
            vscode.commands.registerCommand(
                'codereader.readTracker.showStats',
                this.showStats.bind(this)
            ),
            vscode.commands.registerCommand(
                'codereader.readTracker.clearAll',
                this.clearAll.bind(this)
            ),
            vscode.commands.registerCommand(
                'codereader.readTracker.toggleReadMarkUp',
                this.toggleReadMarkUp.bind(this)
            ),
            vscode.commands.registerCommand(
                'codereader.readTracker.toggleReadMarkDown',
                this.toggleReadMarkDown.bind(this)
            ),
        ];
    }

    /**
     * Toggle read mark for current line or selection
     * If selection exists, toggles entire range based on first line's state
     */
    private async toggleReadMark(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        // Skip binary files and untitled files
        if (editor.document.uri.scheme !== 'file') {
            vscode.window.showWarningMessage('Cannot mark untitled or special files');
            return;
        }

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const selection = editor.selection;

        if (selection.isEmpty) {
            // Single line toggle (cursor position)
            const line = selection.active.line + 1;  // 1-indexed
            const isNowRead = await this.manager.toggleReadMark(filePath, line);

            const message = isNowRead
                ? `Line ${line} marked as read`
                : `Line ${line} unmarked`;
            vscode.window.setStatusBarMessage(message, 2000);
        } else {
            // Range toggle - decide based on first line's state
            const startLine = selection.start.line + 1;
            const endLine = selection.end.line + 1;
            const lineCount = endLine - startLine + 1;

            const isFirstLineRead = await this.manager.isLineRead(filePath, startLine);

            if (isFirstLineRead) {
                // Unmark the range
                await this.manager.unmarkRange(filePath, startLine, endLine);
                const message = lineCount === 1
                    ? `Line ${startLine} unmarked`
                    : `Lines ${startLine}-${endLine} unmarked (${lineCount} lines)`;
                vscode.window.setStatusBarMessage(message, 2000);
            } else {
                // Mark the range
                await this.manager.markAsRead(filePath, startLine, endLine);
                const message = lineCount === 1
                    ? `Line ${startLine} marked as read`
                    : `Lines ${startLine}-${endLine} marked as read (${lineCount} lines)`;
                vscode.window.setStatusBarMessage(message, 2000);
            }
        }
    }

    /**
     * Mark selection as read
     */
    private async markSelection(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        if (editor.document.uri.scheme !== 'file') {
            vscode.window.showWarningMessage('Cannot mark untitled or special files');
            return;
        }

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const startLine = editor.selection.start.line + 1;
        const endLine = editor.selection.end.line + 1;

        await this.manager.markAsRead(filePath, startLine, endLine);

        const lineCount = endLine - startLine + 1;
        const message = lineCount === 1
            ? `Line ${startLine} marked as read`
            : `Lines ${startLine}-${endLine} marked as read (${lineCount} lines)`;
        vscode.window.setStatusBarMessage(message, 2000);
    }

    /**
     * Unmark selection
     */
    private async unmarkSelection(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        if (editor.document.uri.scheme !== 'file') {
            vscode.window.showWarningMessage('Cannot unmark untitled or special files');
            return;
        }

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const startLine = editor.selection.start.line + 1;
        const endLine = editor.selection.end.line + 1;

        await this.manager.unmarkRange(filePath, startLine, endLine);

        const lineCount = endLine - startLine + 1;
        const message = lineCount === 1
            ? `Line ${startLine} unmarked`
            : `Lines ${startLine}-${endLine} unmarked`;
        vscode.window.setStatusBarMessage(message, 2000);
    }

    /**
     * Clear all read marks in current file
     */
    private async clearFile(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        if (editor.document.uri.scheme !== 'file') {
            vscode.window.showWarningMessage('Cannot clear untitled or special files');
            return;
        }

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);

        const confirm = await vscode.window.showWarningMessage(
            `Clear all read marks in "${filePath}"?`,
            { modal: true },
            'Clear'
        );

        if (confirm === 'Clear') {
            await this.manager.clearFile(filePath);
            vscode.window.showInformationMessage(`Read marks cleared for "${filePath}"`);
        }
    }

    /**
     * Check if sync mode is enabled
     */
    private isSyncModeEnabled(): boolean {
        return vscode.workspace.getConfiguration('codereader.readTracker').get('syncToLineHighlight', false);
    }

    /**
     * Toggle sync mode setting
     */
    private async toggleSyncMode(): Promise<void> {
        const currentValue = this.isSyncModeEnabled();
        await vscode.workspace.getConfiguration('codereader.readTracker').update(
            'syncToLineHighlight',
            !currentValue,
            vscode.ConfigurationTarget.Global
        );
        const newValue = !currentValue;
        vscode.window.showInformationMessage(
            `ReadTracker sync mode: ${newValue ? 'ON' : 'OFF'}`
        );
    }

    /**
     * Show statistics in QuickPick
     */
    private async showStats(): Promise<void> {
        const stats = await this.storage.getStats();

        const formatNumber = (n: number): string => n.toLocaleString();
        const syncEnabled = this.isSyncModeEnabled();

        const items: vscode.QuickPickItem[] = [
            {
                label: `$(calendar) Today: ${formatNumber(stats.todayLines)} lines`,
                kind: vscode.QuickPickItemKind.Default
            },
            {
                label: `$(graph) This week: ${formatNumber(stats.weeklyLines)} lines`,
                kind: vscode.QuickPickItemKind.Default
            },
            {
                label: `$(book) Total: ${formatNumber(stats.totalLines)} lines (${formatNumber(stats.totalFiles)} files)`,
                kind: vscode.QuickPickItemKind.Default
            },
            {
                label: '',
                kind: vscode.QuickPickItemKind.Separator
            },
        ];

        // LineHighlight連携ボタン（LineHighlightManagerが設定されている場合のみ）
        if (this.lineHighlightManager) {
            items.push({
                label: `$(sync) Sync Mode [${syncEnabled ? 'ON' : 'OFF'}]`,
                description: 'Toggle auto-sync to LineHighlight when marking'
            });
            items.push({
                label: '$(refresh) Sync Now',
                description: 'Sync all records to LineHighlight (fix consistency)'
            });
            items.push({
                label: '$(clear-all) Clear ReadTracker Highlights',
                description: 'Remove highlights added by ReadTracker'
            });
            items.push({
                label: '',
                kind: vscode.QuickPickItemKind.Separator
            });
        }

        items.push({
            label: '$(trash) Clear all records',
            description: 'Delete all reading history'
        });

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Read Tracker Stats',
            placeHolder: 'Reading statistics',
        });

        if (!selected) return;

        if (selected.label.includes('Sync Mode')) {
            await this.toggleSyncMode();
        } else if (selected.label.includes('Sync Now')) {
            await this.syncToLineHighlight();
        } else if (selected.label.includes('Clear ReadTracker Highlights')) {
            await this.clearReadTrackerHighlights();
        } else if (selected.label.includes('Clear all records')) {
            await this.clearAll();
        }
    }

    /**
     * Clear all reading records
     */
    private async clearAll(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all reading records?',
            { modal: true },
            'Clear All'
        );

        if (confirm === 'Clear All') {
            await this.manager.clearAll();
            vscode.window.showInformationMessage('All reading records have been cleared.');
        }
    }

    /**
     * Toggle read mark for current line and move cursor up
     */
    private async toggleReadMarkUp(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        if (editor.document.uri.scheme !== 'file') return;

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const line = editor.selection.active.line + 1;  // 1-indexed

        await this.manager.toggleReadMark(filePath, line);

        // Move cursor up
        if (editor.selection.active.line > 0) {
            const newPosition = new vscode.Position(editor.selection.active.line - 1, editor.selection.active.character);
            editor.selection = new vscode.Selection(newPosition, newPosition);
            editor.revealRange(new vscode.Range(newPosition, newPosition));
        }
    }

    /**
     * Toggle read mark for current line and move cursor down
     */
    private async toggleReadMarkDown(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        if (editor.document.uri.scheme !== 'file') return;

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const line = editor.selection.active.line + 1;  // 1-indexed

        await this.manager.toggleReadMark(filePath, line);

        // Move cursor down
        const lastLine = editor.document.lineCount - 1;
        if (editor.selection.active.line < lastLine) {
            const newPosition = new vscode.Position(editor.selection.active.line + 1, editor.selection.active.character);
            editor.selection = new vscode.Selection(newPosition, newPosition);
            editor.revealRange(new vscode.Range(newPosition, newPosition));
        }
    }

    /**
     * Sync ReadTracker data to LineHighlight (fix consistency)
     * Deletes existing readTracker highlights and recreates from current data
     */
    private async syncToLineHighlight(): Promise<void> {
        if (!this.lineHighlightManager || !this.codeMarkerStorage) {
            vscode.window.showWarningMessage('LineHighlight integration not available');
            return;
        }

        // First, clear existing ReadTracker highlights
        await this.lineHighlightManager.deleteHighlightsByType(READ_TRACKER_HIGHLIGHT_TYPE);

        const records = await this.storage.getAllRecords();
        if (records.length === 0) {
            vscode.window.showInformationMessage('Sync complete (no records)');
            return;
        }

        // Get default folder for LineHighlight
        const defaultFolder = await this.codeMarkerStorage.getValidLastedFolder();

        let syncedFiles = 0;
        let syncedLines = 0;

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

            syncedFiles++;
            syncedLines += record.lines.reduce((sum, l) => sum + (l.endLine - l.startLine + 1), 0);
        }

        vscode.window.showInformationMessage(
            `Synced ${syncedFiles} files (${syncedLines} line ranges) to LineHighlight`
        );
    }

    /**
     * Clear all LineHighlight entries created by ReadTracker
     */
    private async clearReadTrackerHighlights(): Promise<void> {
        if (!this.lineHighlightManager) {
            vscode.window.showWarningMessage('LineHighlight integration not available');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            'Clear all highlights created by ReadTracker?',
            { modal: true },
            'Clear'
        );

        if (confirm === 'Clear') {
            const deletedCount = await this.lineHighlightManager.deleteHighlightsByType(READ_TRACKER_HIGHLIGHT_TYPE);
            vscode.window.showInformationMessage(`Cleared ${deletedCount} ReadTracker highlight(s)`);
        }
    }
}
