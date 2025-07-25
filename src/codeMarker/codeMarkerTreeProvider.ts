import * as vscode from 'vscode';
import { CodeMarkerStorage } from './codeMarkerStorage';
import { CodeMarkerTreeItem } from './codeMarkerTreeItem';
import * as path from 'path';

export class CodeMarkerTreeProvider implements vscode.TreeDataProvider<CodeMarkerTreeItem>, vscode.TreeDragAndDropController<CodeMarkerTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CodeMarkerTreeItem | undefined | null | void> = new vscode.EventEmitter<CodeMarkerTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CodeMarkerTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // ドラッグ&ドロップ設定
    readonly dropMimeTypes = ['application/vnd.code.tree.codeMarkerProvider'];
    readonly dragMimeTypes = ['application/vnd.code.tree.codeMarkerProvider'];

    constructor(private storage: CodeMarkerStorage) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CodeMarkerTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CodeMarkerTreeItem): Promise<CodeMarkerTreeItem[]> {
        try {
            if (!element) {
                // ルートレベル - フォルダを表示（PostItと同じく空フォルダも表示）
                const folders = await this.storage.getFolders();
                const folderItems = folders.map(folder => new CodeMarkerTreeItem(
                    folder,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'folder',
                    folder
                ));

                return folderItems;
            } else if (element.itemType === 'folder') {
                // フォルダ内のDiagnosticsを直接表示（ファイル階層をスキップ）
                const diagnosticsData = await this.storage.getDiagnosticsByFolder(element.folderPath!);
                
                const diagnosticsItems: CodeMarkerTreeItem[] = [];
                
                for (const { filePath, diagnostics } of diagnosticsData) {
                    const fileName = path.basename(filePath);
                    
                    for (const diag of diagnostics) {
                        const label = `${diag.type}: ${diag.text}`;
                        const description = `${fileName}:${diag.Lines.startLine}`;
                        
                        const diagnosticsItem = new CodeMarkerTreeItem(
                            label,
                            vscode.TreeItemCollapsibleState.None,
                            'diagnostics',
                            element.folderPath,
                            filePath,
                            diag,
                            element.folderPath
                        );
                        
                        
                        // ファイル名と行番号を説明として設定
                        diagnosticsItem.description = description;
                        
                        diagnosticsItems.push(diagnosticsItem);
                    }
                }

                return diagnosticsItems;
            }
        } catch (error) {
            console.error('Error getting CodeMarker children:', error);
            vscode.window.showErrorMessage(`Failed to load CodeMarker data: ${error}`);
        }
        
        return [];
    }

    // ドラッグ開始時の処理
    async handleDrag(source: CodeMarkerTreeItem[], treeDataTransfer: vscode.DataTransfer): Promise<void> {
        // Diagnosticsアイテムのみドラッグ可能
        const diagnosticsItems = source.filter(item => item.itemType === 'diagnostics' && item.diagnostics);
        if (diagnosticsItems.length === 0) return;

        // ドラッグデータを設定
        const dragData = diagnosticsItems.map(item => ({
            id: item.diagnostics!.id,
            text: item.diagnostics!.text,
            type: item.diagnostics!.type,
            filePath: item.filePath!,
            folder: item.folder!
        }));

        treeDataTransfer.set('application/vnd.code.tree.codeMarkerProvider', new vscode.DataTransferItem(JSON.stringify(dragData)));
    }

    // ドロップ時の処理
    async handleDrop(target: CodeMarkerTreeItem | undefined, sources: vscode.DataTransfer): Promise<void> {
        const transferItem = sources.get('application/vnd.code.tree.codeMarkerProvider');
        if (!transferItem) return;

        try {
            const dragData = JSON.parse(transferItem.value);
            
            // ドロップ先がフォルダの場合
            if (target && target.itemType === 'folder') {
                const targetFolder = target.folderPath!;
                
                for (const item of dragData) {
                    // 元のフォルダから削除
                    await this.storage.deleteDiagnostics(item.folder, item.filePath, item.id);
                    
                    // 新しいフォルダに追加
                    await this.storage.addDiagnosticsToFolder(targetFolder, item.filePath, {
                        type: item.type,
                        text: item.text,
                        Lines: item.Lines
                    });
                }
                
                // 成功メッセージ
                if (dragData.length === 1) {
                    vscode.window.showInformationMessage(`Moved "${dragData[0].text}" to "${targetFolder}"`);
                } else {
                    vscode.window.showInformationMessage(`Moved ${dragData.length} diagnostics to "${targetFolder}"`);
                }
                
                // ツリーを更新
                this.refresh();
            }
        } catch (error) {
            console.error('Error during drag and drop:', error);
            vscode.window.showErrorMessage(`Failed to move diagnostics: ${error}`);
        }
    }
}