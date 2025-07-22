import * as vscode from 'vscode';
import { QuickMemoStorage } from './quickMemoStorage';
import { QuickMemoTreeItem } from './quickMemoTreeItem';

export class QuickMemoTreeProvider implements vscode.TreeDataProvider<QuickMemoTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<QuickMemoTreeItem | undefined | null | void> = new vscode.EventEmitter<QuickMemoTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<QuickMemoTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private quickMemoStorage: QuickMemoStorage) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: QuickMemoTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: QuickMemoTreeItem): Promise<QuickMemoTreeItem[]> {
        try {
            if (!element) {
                // ルートレベル - フォルダを表示
                const folders = await this.quickMemoStorage.getFolders();
                const folderItems = folders.map(folder => new QuickMemoTreeItem(
                    folder,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'folder',
                    folder
                ));

                return folderItems;
            } else if (element.itemType === 'folder') {
                // フォルダ内のメモを表示
                const data = await this.quickMemoStorage.getQuickMemoData();
                const memos = data.QuickMemos[element.folderPath!] || [];
                const memoItems = memos.map(memo => new QuickMemoTreeItem(
                    memo.title,
                    vscode.TreeItemCollapsibleState.None,
                    'memo',
                    undefined,
                    memo
                ));

                return memoItems;
            }
        } catch (error) {
            console.error('Error getting QuickMemo children:', error);
            vscode.window.showErrorMessage('Failed to load QuickMemo items');
        }

        return [];
    }
}