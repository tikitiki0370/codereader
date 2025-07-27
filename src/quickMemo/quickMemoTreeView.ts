import * as vscode from 'vscode';
import { BaseTreeProvider } from '../modules';
import { QuickMemoStorage, QuickMemoFile } from './quickMemoStorage';
import { QuickMemoTreeItem } from './quickMemoTreeItem';

/**
 * QuickMemo用TreeProvider（統合実装版）
 */
export class QuickMemoTreeView extends BaseTreeProvider<QuickMemoFile, QuickMemoTreeItem> {
    // ドラッグ&ドロップ設定
    readonly dropMimeTypes = ['application/vnd.code.tree.quickmemo'];
    readonly dragMimeTypes = ['application/vnd.code.tree.quickmemo'];

    constructor(private storage: QuickMemoStorage) {
        super();
    }

    // ===========================================
    // データ取得メソッド
    // ===========================================

    protected async getRootFolders(): Promise<string[]> {
        return await this.storage.getFolders();
    }

    protected async getSubfolders(parentFolder: string): Promise<string[]> {
        // QuickMemoはフラット構造なのでサブフォルダなし
        return [];
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
        // QuickMemoStorageにmoveMemoToFolderメソッドがないため、
        // ドラッグ&ドロップは実装しない
        console.warn('QuickMemo drag and drop not implemented');
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

    // ===========================================
    // フォルダ管理メソッド
    // ===========================================
    
    async createFolder(folderPath: string): Promise<boolean> {
        try {
            const success = await this.storage.createFolder(folderPath);
            if (success) {
                this.refresh();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to create folder:', error);
            return false;
        }
    }

    async deleteFolder(folderPath: string): Promise<boolean> {
        try {
            // QuickMemoStorageにdeleteFolderメソッドがないため、実装しない
            console.warn('QuickMemo deleteFolder not implemented');
            return false;
        } catch (error) {
            console.error('Failed to delete folder:', error);
            return false;
        }
    }

    async renameFolder(oldPath: string, newPath: string): Promise<boolean> {
        try {
            // QuickMemoStorageにrenameFolderメソッドがないため、実装しない
            console.warn('QuickMemo renameFolder not implemented');
            return false;
        } catch (error) {
            console.error('Failed to rename folder:', error);
            return false;
        }
    }
}