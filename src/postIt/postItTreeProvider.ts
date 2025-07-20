import * as vscode from 'vscode';
import { PostItStorage } from './postItStorage';
import { PostItTreeItem } from './postItTreeItem';

export class PostItTreeProvider implements vscode.TreeDataProvider<PostItTreeItem>, vscode.TreeDragAndDropController<PostItTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PostItTreeItem | undefined | null | void> = new vscode.EventEmitter<PostItTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PostItTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // ドラッグ&ドロップ設定
    readonly dropMimeTypes = ['application/vnd.code.tree.postItProvider'];
    readonly dragMimeTypes = ['application/vnd.code.tree.postItProvider'];

    constructor(private postItStorage: PostItStorage) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PostItTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PostItTreeItem): Promise<PostItTreeItem[]> {
        try {
            if (!element) {
                // ルートレベル - フォルダを表示
                const folders = await this.postItStorage.getFolders();
                const folderItems = folders.map(folder => new PostItTreeItem(
                    folder,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'folder',
                    folder
                ));

                return folderItems;
            } else if (element.itemType === 'folder') {
                // フォルダ内のPostItNotesを表示
                const notes = await this.postItStorage.getNotesByFolder(element.folderPath!);
                const noteItems = notes.map(note => new PostItTreeItem(
                    note.title,
                    vscode.TreeItemCollapsibleState.None,
                    'note',
                    undefined,
                    note
                ));

                return noteItems;
            }
        } catch (error) {
            console.error('Error getting PostIt children:', error);
            vscode.window.showErrorMessage(`Failed to load PostIt data: ${error}`);
        }
        
        return [];
    }

    // ドラッグ開始時の処理
    async handleDrag(source: PostItTreeItem[], treeDataTransfer: vscode.DataTransfer): Promise<void> {
        // PostItアイテムのみドラッグ可能
        const postItItems = source.filter(item => item.itemType === 'note' && item.note);
        if (postItItems.length === 0) return;

        // ドラッグデータを設定
        const dragData = postItItems.map(item => ({
            id: item.note!.id,
            title: item.note!.title
        }));

        treeDataTransfer.set('application/vnd.code.tree.postItProvider', new vscode.DataTransferItem(JSON.stringify(dragData)));
    }

    // ドロップ時の処理
    async handleDrop(target: PostItTreeItem | undefined, sources: vscode.DataTransfer): Promise<void> {
        const transferItem = sources.get('application/vnd.code.tree.postItProvider');
        if (!transferItem) return;

        try {
            const dragData = JSON.parse(transferItem.value);
            
            // ドロップ先がフォルダの場合
            if (target && target.itemType === 'folder') {
                const targetFolder = target.folderPath!;
                
                for (const item of dragData) {
                    const success = await this.postItStorage.moveNoteToFolder(item.id, targetFolder);
                    if (success) {
                        console.log(`Moved PostIt "${item.title}" to folder "${targetFolder}"`);
                    }
                }
                
                // 成功メッセージ
                if (dragData.length === 1) {
                    vscode.window.showInformationMessage(`Moved "${dragData[0].title}" to "${targetFolder}"`);
                } else {
                    vscode.window.showInformationMessage(`Moved ${dragData.length} PostIts to "${targetFolder}"`);
                }
                
                // ツリーを更新
                this.refresh();
            }
        } catch (error) {
            console.error('Failed to handle drop:', error);
            vscode.window.showErrorMessage(`Failed to move PostIt: ${error}`);
        }
    }
}