import * as vscode from 'vscode';
import { QuickMemoStorage, QuickMemoFile } from './quickMemoStorage';
import { QuickMemoTreeProvider } from './quickMemoTreeProvider';

/**
 * QuickMemo機能のコマンド処理を管理するクラス
 */
export class QuickMemoCommandProvider {
    constructor(
        private storage: QuickMemoStorage,
        private treeProvider: QuickMemoTreeProvider,
        private context: vscode.ExtensionContext
    ) {}

    /**
     * QuickMemo関連のコマンドを登録
     */
    registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('codereader.quickMemoCreate', this.quickMemoCreate.bind(this)),
            vscode.commands.registerCommand('codereader.quickMemoCreateAndLink', this.quickMemoCreateAndLink.bind(this)),
            vscode.commands.registerCommand('codereader.quickMemoOpenLatest', this.quickMemoOpenLatest.bind(this)),
            vscode.commands.registerCommand('codereader.openQuickMemo', this.openQuickMemo.bind(this)),
            vscode.commands.registerCommand('codereader.deleteQuickMemo', this.deleteQuickMemo.bind(this))
        ];
    }

    /**
     * QuickMemoを作成するコマンド
     */
    private async quickMemoCreate(): Promise<void> {
        try {
            const title = await vscode.window.showInputBox({
                prompt: 'Enter memo title',
                placeHolder: 'Quick memo title'
            });

            if (!title) {
                return;
            }

            const targetFolder = await this.storage.getValidLastedFolder();
            const newMemo = await this.storage.addMemoToFolder(targetFolder, title);
            await this.storage.updateConfig({ lastedFolder: targetFolder });
            
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`QuickMemo created: ${newMemo.title}`);
            await this.storage.openMemo(newMemo);
        } catch (error) {
            console.error('Error creating QuickMemo:', error);
            vscode.window.showErrorMessage('Failed to create QuickMemo: ' + error);
        }
    }

    /**
     * QuickMemoを作成してファイルリンクを追加するコマンド
     */
    private async quickMemoCreateAndLink(): Promise<void> {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const title = await vscode.window.showInputBox({
                prompt: 'Enter memo title',
                placeHolder: 'Quick memo with file link'
            });

            if (!title) {
                return;
            }

            const filePath = activeEditor.document.uri.fsPath;
            const targetFolder = await this.storage.getValidLastedFolder();
            const newMemo = await this.storage.addMemoToFolder(targetFolder, title, [filePath]);
            await this.storage.updateConfig({ lastedFolder: targetFolder });
            
            this.treeProvider.refresh();
            vscode.window.showInformationMessage(`QuickMemo created with link: ${newMemo.title}`);
            await this.storage.openMemo(newMemo);
        } catch (error) {
            console.error('Error creating QuickMemo with link:', error);
            vscode.window.showErrorMessage('Failed to create QuickMemo with link: ' + error);
        }
    }

    /**
     * 最新のQuickMemoを開くコマンド
     */
    private async quickMemoOpenLatest(): Promise<void> {
        try {
            const latest = await this.storage.getLatestMemo();
            if (!latest) {
                vscode.window.showInformationMessage('No memos found');
                return;
            }

            await this.storage.openMemo(latest.memo);
        } catch (error) {
            console.error('Error opening latest QuickMemo:', error);
            vscode.window.showErrorMessage('Failed to open latest QuickMemo: ' + error);
        }
    }

    /**
     * QuickMemoを開くコマンド
     */
    private async openQuickMemo(memo: QuickMemoFile): Promise<void> {
        try {
            await this.storage.openMemo(memo);
        } catch (error) {
            console.error('Error opening QuickMemo:', error);
            vscode.window.showErrorMessage('Failed to open QuickMemo: ' + error);
        }
    }

    /**
     * QuickMemoを削除するコマンド
     */
    private async deleteQuickMemo(treeItem: any): Promise<void> {
        try {
            if (!treeItem || !treeItem.memo) {
                vscode.window.showErrorMessage('Invalid memo selection');
                return;
            }

            const memo = treeItem.memo as QuickMemoFile;
            const result = await vscode.window.showWarningMessage(
                `Delete memo "${memo.title}"?`,
                { modal: true },
                'Delete'
            );

            if (result !== 'Delete') {
                return;
            }

            const success = await this.storage.deleteMemo(memo);
            if (success) {
                this.treeProvider.refresh();
                vscode.window.showInformationMessage(`Memo "${memo.title}" deleted`);
            } else {
                vscode.window.showErrorMessage('Failed to delete memo');
            }
        } catch (error) {
            console.error('Error deleting QuickMemo:', error);
            vscode.window.showErrorMessage('Failed to delete QuickMemo: ' + error);
        }
    }
}