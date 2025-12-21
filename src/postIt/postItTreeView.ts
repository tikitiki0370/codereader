import * as vscode from 'vscode';
import { BaseTreeProvider } from '../modules';
import { PostItStorage, PostItNote } from './postItStorage';
import { PostItTreeItem } from './postItTreeItem';

/**
 * PostIt用TreeProvider（統合実装版）
 */
export class PostItTreeView extends BaseTreeProvider<PostItNote, PostItTreeItem, PostItStorage> {
    // ドラッグ&ドロップ設定
    readonly dropMimeTypes = ['application/vnd.code.tree.postit'];
    readonly dragMimeTypes = ['application/vnd.code.tree.postit'];

    constructor(storage: PostItStorage) {
        super(storage);
    }

    // ===========================================
    // データ取得メソッド
    // ===========================================

    protected async getRootFolders(): Promise<string[]> {
        console.log('PostItTreeView.getRootFolders called');
        try {
            const folders = await this.storage.getFolders();
            console.log('PostIt folders:', folders);
            return folders;
        } catch (error) {
            console.error('PostItTreeView.getRootFolders error:', error);
            throw error;
        }
    }

    protected async getSubfolders(parentFolder: string): Promise<string[]> {
        return await this.storage.getSubfolders(parentFolder);
    }

    protected async getItemsByFolder(folderPath: string): Promise<PostItNote[]> {
        return await this.storage.getNotesByFolder(folderPath);
    }

    protected createFolderItem(folderPath: string): PostItTreeItem {
        return new PostItTreeItem(
            folderPath,
            vscode.TreeItemCollapsibleState.Collapsed,
            'folder',
            folderPath
        );
    }

    protected createDataItem(data: PostItNote, folderPath?: string): PostItTreeItem {
        return new PostItTreeItem(
            data.title,
            vscode.TreeItemCollapsibleState.None,
            'note',
            undefined,
            data
        );
    }

    protected getErrorMessage(error: any): string {
        return `Failed to load PostIt data: ${error}`;
    }

    // ===========================================
    // ドラッグ&ドロップメソッド
    // ===========================================

    protected canDrag(item: PostItTreeItem): boolean {
        return item.itemType === 'data' && !!item.note;
    }

    protected canDrop(target: PostItTreeItem | undefined): boolean {
        return target?.itemType === 'folder' || !target;
    }

    protected createDragData(items: PostItTreeItem[]): any {
        return items
            .filter(item => item.note)
            .map(item => ({ id: item.note!.id, title: item.note!.title }));
    }

    protected async performDrop(target: PostItTreeItem | undefined, dragData: any[]): Promise<void> {
        const targetFolder = target?.folderPath || 'Default';
        for (const item of dragData) {
            await this.storage.moveNoteToFolder(item.id, targetFolder);
        }
    }

    protected getDropSuccessMessage(dragData: any[], targetFolder: string): string {
        return dragData.length === 1 
            ? `Moved "${dragData[0].title}" to "${targetFolder}"`
            : `Moved ${dragData.length} PostIts to "${targetFolder}"`;
    }

    protected getDropErrorMessage(error: any): string {
        return `Failed to move PostIt: ${error}`;
    }

    protected isFolderItem(element: PostItTreeItem): boolean {
        return element.itemType === 'folder';
    }

    protected getFolderPath(element: PostItTreeItem): string | undefined {
        return element.folderPath;
    }
}