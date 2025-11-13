import * as vscode from 'vscode';
import { BaseTreeProvider } from '../modules';
import { QuickMemoStorage, QuickMemoFile } from './quickMemoStorage';
import { QuickMemoTreeItem } from './quickMemoTreeItem';

/**
 * QuickMemo用TreeProvider（統合実装版）
 */
export class QuickMemoTreeView extends BaseTreeProvider<QuickMemoFile, QuickMemoTreeItem, QuickMemoStorage> {
    // ドラッグ&ドロップ設定
    readonly dropMimeTypes = ['application/vnd.code.tree.quickmemo'];
    readonly dragMimeTypes = ['application/vnd.code.tree.quickmemo'];

    constructor(storage: QuickMemoStorage) {
        super(storage);
    }

    // ===========================================
    // データ取得メソッド
    // ===========================================

    protected async getRootFolders(): Promise<string[]> {
        return await this.storage.getFolders();
    }

    protected async getSubfolders(parentFolder: string): Promise<string[]> {
        return await this.storage.getSubfolders(parentFolder);
    }

    protected async getItemsByFolder(folderPath: string): Promise<QuickMemoFile[]> {
        return await this.storage.getMemosByFolder(folderPath);
    }

    protected createFolderItem(folderPath: string): QuickMemoTreeItem {
        return new QuickMemoTreeItem(
            folderPath,
            vscode.TreeItemCollapsibleState.Collapsed,
            'folder',
            folderPath
        );
    }

    protected createDataItem(data: QuickMemoFile): QuickMemoTreeItem {
        return new QuickMemoTreeItem(
            data.title,
            vscode.TreeItemCollapsibleState.None,
            'memo',
            undefined,
            data
        );
    }

    protected getErrorMessage(error: any): string {
        return `Failed to load QuickMemo data: ${error}`;
    }

    // ===========================================
    // ドラッグ&ドロップメソッド
    // ===========================================

    protected canDrag(item: QuickMemoTreeItem): boolean {
        return item.itemType === 'memo' && !!item.memo;
    }

    protected canDrop(target: QuickMemoTreeItem | undefined): boolean {
        return target?.itemType === 'folder' || !target;
    }

    protected createDragData(items: QuickMemoTreeItem[]): any {
        return items
            .filter(item => item.memo)
            .map(item => ({ id: item.memo!.id, title: item.memo!.title }));
    }

    protected async performDrop(target: QuickMemoTreeItem | undefined, dragData: any[]): Promise<void> {
        const targetFolder = target?.folderPath || 'General';

        for (const item of dragData) {
            if (item.id) {
                await this.storage.moveMemoToFolder(item.id, targetFolder);
            }
        }
    }

    protected getDropSuccessMessage(dragData: any[], targetFolder: string): string {
        return dragData.length === 1 
            ? `Moved "${dragData[0].title}" to "${targetFolder}"`
            : `Moved ${dragData.length} memos to "${targetFolder}"`;
    }

    protected getDropErrorMessage(error: any): string {
        return `Failed to move memo: ${error}`;
    }

    protected isFolderItem(element: QuickMemoTreeItem): boolean {
        return element.itemType === 'folder';
    }

    protected getFolderPath(element: QuickMemoTreeItem): string | undefined {
        return element.folderPath;
    }
}