import * as vscode from 'vscode';
import { ReadTrackerStorage } from './readTrackerStorage';

/**
 * Status bar display for ReadTracker statistics
 */
export class ReadTrackerStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];

    constructor(private storage: ReadTrackerStorage) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'codereader.readTracker.showStats';

        // Watch for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('codereader.readTracker.showStatusBar')) {
                    this.handleVisibilityChange();
                }
            })
        );
    }

    /**
     * Initialize (called on extension activation)
     */
    async initialize(): Promise<void> {
        await this.handleVisibilityChange();
    }

    /**
     * Handle show/hide toggle
     */
    private async handleVisibilityChange(): Promise<void> {
        const showStatusBar = vscode.workspace.getConfiguration('codereader.readTracker').get('showStatusBar', true);
        if (showStatusBar) {
            await this.update();
        } else {
            this.statusBarItem.hide();
        }
    }

    /**
     * Update status bar display
     */
    async update(): Promise<void> {
        const showStatusBar = vscode.workspace.getConfiguration('codereader.readTracker').get('showStatusBar', true);
        if (!showStatusBar) {
            return;
        }

        const stats = await this.storage.getStats();

        // Format numbers with commas for readability
        const formatNumber = (n: number): string => n.toLocaleString();

        this.statusBarItem.text = `$(book) Today: ${formatNumber(stats.todayLines)} | Total: ${formatNumber(stats.totalLines)}`;
        this.statusBarItem.tooltip = [
            'Read Tracker',
            `Today: ${formatNumber(stats.todayLines)} lines`,
            `This week: ${formatNumber(stats.weeklyLines)} lines`,
            `Total: ${formatNumber(stats.totalLines)} lines (${formatNumber(stats.totalFiles)} files)`
        ].join('\n');
        this.statusBarItem.show();
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
