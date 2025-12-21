import * as vscode from 'vscode';
import { QuickMemoStorage, QuickMemoFile } from './quickMemoStorage';
import { BaseTreeProvider } from '../modules';
import { QuickMemoTreeItem } from './quickMemoTreeItem';

/**
 * QuickMemo機能のコマンド処理を管理するクラス
 */
export class QuickMemoCommandProvider {
    private treeView?: vscode.TreeView<QuickMemoTreeItem>;

    constructor(
        private storage: QuickMemoStorage,
        private treeProvider: BaseTreeProvider<QuickMemoFile, QuickMemoTreeItem>,
        private context: vscode.ExtensionContext
    ) {}

    setTreeView(treeView: vscode.TreeView<QuickMemoTreeItem>) {
        this.treeView = treeView;
    }

    /**
     * QuickMemo関連のコマンドを登録
     */
    registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('codereader.quickMemoCreate', this.quickMemoCreate.bind(this)),
            vscode.commands.registerCommand('codereader.quickMemoCreateAndLink', this.quickMemoCreateAndLink.bind(this)),
            vscode.commands.registerCommand('codereader.quickMemoOpenLatest', this.quickMemoOpenLatest.bind(this)),
            vscode.commands.registerCommand('codereader.openQuickMemo', this.openQuickMemo.bind(this)),
            vscode.commands.registerCommand('codereader.revealQuickMemo', this.revealQuickMemo.bind(this)),
            vscode.commands.registerCommand('codereader.deleteQuickMemo', this.deleteQuickMemo.bind(this)),
            
            // フォルダ操作コマンド
            vscode.commands.registerCommand('codereader.createQuickMemoFolder', this.createQuickMemoFolder.bind(this)),
            vscode.commands.registerCommand('codereader.createQuickMemoSubFolder', this.createQuickMemoSubFolder.bind(this)),
            vscode.commands.registerCommand('codereader.renameQuickMemoFolder', this.renameQuickMemoFolder.bind(this)),
            vscode.commands.registerCommand('codereader.deleteQuickMemoFolder', this.deleteQuickMemoFolder.bind(this))
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
            const selection = activeEditor.selection;
            const startLine = selection.start.line;
            const endLine = selection.end.line;
            
            // 選択テキストを取得 (最大100文字程度などの制限は今の所なし、必要ならslice等)
            const text = activeEditor.document.getText(selection) || activeEditor.document.lineAt(startLine).text;
            // 複数行の場合は1行目だけとか、全文とか。とりあえず全文入れつつ、表示側でトリミングなどを検討
            // Design doc implies using "Linked Line", so storing precise line is key.
            
            const linkedLine = {
                file: filePath,
                line: startLine,
                endLine: endLine,
                text: text
            };

            const targetFolder = await this.storage.getValidLastedFolder();
            const newMemo = await this.storage.addMemoToFolder(targetFolder, title, [], linkedLine);
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
     * サイドパネルでメモを選択・表示するコマンド
     */
    private async revealQuickMemo(memoId: string): Promise<void> {
        try {
            if (!this.treeView) {
                console.warn('TreeView not set for QuickMemoCommandProvider');
                return;
            }

            // QuickMemoTreeViewのメソッドを使ってTreeItemを取得
            // treeProviderはBaseTreeProvider型だが、実体はQuickMemoTreeViewなのでキャストして使用
            const treeViewProvider = this.treeProvider as unknown as import('./quickMemoTreeView').QuickMemoTreeView;
            
            if (typeof treeViewProvider.getTreeItemById === 'function') {
                const item = await treeViewProvider.getTreeItemById(memoId);
                if (item) {
                    await this.treeView.reveal(item, { select: true, focus: true, expand: true });
                } else {
                     vscode.window.showErrorMessage('Memo not found in tree');
                }
            } else {
                console.error('treeProvider does not support getTreeItemById');
            }
        } catch (error) {
            console.error('Error revealing QuickMemo:', error);
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

    /**
     * ルートフォルダ作成
     */
    private async createQuickMemoFolder(): Promise<void> {
        try {
            const folderName = await vscode.window.showInputBox({
                prompt: 'Enter folder name',
                placeHolder: 'Folder name'
            });

            if (!folderName) return;

            // バリデーション: スラッシュを含まないこと
            if (folderName.includes('/')) {
                vscode.window.showErrorMessage('Folder name cannot contain "/"');
                return;
            }

            const success = await this.storage.createFolder(folderName);
            if (success) {
                this.treeProvider.refresh();
            } else {
                vscode.window.showErrorMessage(`Folder "${folderName}" already exists`);
            }
        } catch (error) {
            console.error('Error creating folder:', error);
            vscode.window.showErrorMessage('Failed to create folder: ' + error);
        }
    }

    /**
     * サブフォルダ作成
     */
    private async createQuickMemoSubFolder(treeItem: QuickMemoTreeItem): Promise<void> {
        try {
            if (!treeItem.folderPath) return;

            const subFolderName = await vscode.window.showInputBox({
                prompt: `Create subfolder in "${treeItem.folderPath}"`,
                placeHolder: 'Subfolder name'
            });

            if (!subFolderName) return;

            if (subFolderName.includes('/')) {
                vscode.window.showErrorMessage('Folder name cannot contain "/"');
                return;
            }

            const newPath = `${treeItem.folderPath}/${subFolderName}`;
            const success = await this.storage.createFolder(newPath);
            
            if (success) {
                // 親フォルダを展開状態にする
                this.treeProvider.refresh();
            } else {
                vscode.window.showErrorMessage(`Folder "${subFolderName}" already exists`);
            }
        } catch (error) {
            console.error('Error creating subfolder:', error);
            vscode.window.showErrorMessage('Failed to create subfolder: ' + error);
        }
    }

    /**
     * フォルダリネーム
     */
    private async renameQuickMemoFolder(treeItem: QuickMemoTreeItem): Promise<void> {
        try {
            if (!treeItem.folderPath) return;

            const oldPath = treeItem.folderPath;
            const currentName = oldPath.split('/').pop() || '';
            const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));

            const newName = await vscode.window.showInputBox({
                prompt: `Rename folder "${currentName}"`,
                value: currentName
            });

            if (!newName || newName === currentName) return;

            if (newName.includes('/')) {
                vscode.window.showErrorMessage('Folder name cannot contain "/"');
                return;
            }

            const newPath = parentPath ? `${parentPath}/${newName}` : newName;
            const success = await this.storage.renameFolder(oldPath, newPath);

            if (success) {
                this.treeProvider.refresh();
            } else {
                vscode.window.showErrorMessage('Failed to rename folder (name might already exist)');
            }
        } catch (error) {
            console.error('Error renaming folder:', error);
            vscode.window.showErrorMessage('Failed to rename folder: ' + error);
        }
    }

    /**
     * フォルダ削除
     */
    private async deleteQuickMemoFolder(treeItem: QuickMemoTreeItem): Promise<void> {
        try {
            if (!treeItem.folderPath) return;

            // フォルダが空でないかチェック
            const isEmpty = await this.storage.isFolderEmpty(treeItem.folderPath);
            const message = isEmpty
                ? `Delete folder "${treeItem.folderPath}"?`
                : `Folder "${treeItem.folderPath}" is not empty. Delete folder and ALL contents?`;

            const result = await vscode.window.showWarningMessage(
                message,
                { modal: true },
                'Delete'
            );

            if (result !== 'Delete') return;

            const success = await this.storage.deleteFolder(treeItem.folderPath);
            if (success) {
                this.treeProvider.refresh();
                vscode.window.showInformationMessage(`Folder "${treeItem.folderPath}" deleted`);
            } else {
                vscode.window.showErrorMessage('Failed to delete folder');
            }
        } catch (error) {
            console.error('Error deleting folder:', error);
            vscode.window.showErrorMessage('Failed to delete folder: ' + error);
        }
    }
}