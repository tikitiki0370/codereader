import * as vscode from 'vscode';
import { BaseTreeProvider } from '../modules';
import { CodeMarkerStorage } from './codeMarkerStorage';
import { CodeMarkerDiagnostics, CodeMarkerLineHighlight, CodeMarkerSyntaxHighlight } from './types';
import { CodeMarkerTreeItem } from './codeMarkerTreeItem';

// CodeMarkerアイテムの統一型
type CodeMarkerDataItem = 
    | { type: 'diagnostics'; data: CodeMarkerDiagnostics; filePath: string; folder: string }
    | { type: 'lineHighlight'; data: CodeMarkerLineHighlight; filePath: string; folder: string }
    | { type: 'syntaxHighlight'; data: CodeMarkerSyntaxHighlight; filePath: string; folder: string };

/**
 * CodeMarker用TreeProvider（統合実装版）
 */
export class CodeMarkerTreeView extends BaseTreeProvider<CodeMarkerDataItem, CodeMarkerTreeItem, CodeMarkerStorage> {
    // ドラッグ&ドロップ設定
    readonly dropMimeTypes = ['application/vnd.code.tree.codemarker'];
    readonly dragMimeTypes = ['application/vnd.code.tree.codemarker'];

    constructor(storage: CodeMarkerStorage) {
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

    protected async getItemsByFolder(folderPath: string): Promise<CodeMarkerDataItem[]> {
        const allItems: CodeMarkerDataItem[] = [];
        
        // Diagnosticsを取得
        const diagnosticsByFolder = await this.storage.getDiagnosticsByFolder(folderPath);
        for (const item of diagnosticsByFolder) {
            for (const diag of item.diagnostics) {
                allItems.push({ 
                    type: 'diagnostics', 
                    data: diag, 
                    filePath: item.filePath, 
                    folder: folderPath 
                });
            }
        }
        
        // LineHighlightを取得
        const lineHighlightsByFolder = await this.storage.getLineHighlightsByFolder(folderPath);
        for (const item of lineHighlightsByFolder) {
            for (const highlight of item.highlights) {
                allItems.push({ 
                    type: 'lineHighlight', 
                    data: highlight, 
                    filePath: item.filePath, 
                    folder: folderPath 
                });
            }
        }
        
        // SyntaxHighlightを取得
        const syntaxHighlightsByFolder = await this.storage.getSyntaxHighlightsByFolder(folderPath);
        for (const item of syntaxHighlightsByFolder) {
            allItems.push({ 
                type: 'syntaxHighlight', 
                data: item.syntaxHighlight, 
                filePath: item.filePath, 
                folder: folderPath 
            });
        }
        
        return allItems;
    }

    protected createFolderItem(folderPath: string): CodeMarkerTreeItem {
        return new CodeMarkerTreeItem(
            folderPath,
            vscode.TreeItemCollapsibleState.Collapsed,
            'folder',
            folderPath
        );
    }

    protected createDataItem(data: CodeMarkerDataItem, folderPath?: string): CodeMarkerTreeItem {
        if (data.type === 'diagnostics') {
            return new CodeMarkerTreeItem(
                data.data.text,
                vscode.TreeItemCollapsibleState.None,
                'diagnostics',
                undefined,
                data.filePath,
                data.data,
                data.folder
            );
        } else if (data.type === 'lineHighlight') {
            const lineInfo = data.data.Lines.length === 1 && data.data.Lines[0].startLine === data.data.Lines[0].endLine
                ? `Line ${data.data.Lines[0].startLine}`
                : `Lines ${data.data.Lines[0].startLine}-${data.data.Lines[data.data.Lines.length - 1].endLine}`;
            
            return new CodeMarkerTreeItem(
                `${lineInfo} (${data.data.color.split('(')[0].trim()})`,
                vscode.TreeItemCollapsibleState.None,
                'lineHighlight',
                undefined,
                data.filePath,
                undefined,
                data.folder,
                data.data
            );
        } else if (data.type === 'syntaxHighlight') {
            const lineInfo = data.data.Lines.length === 1
                ? `Line ${data.data.Lines[0]}`
                : `Lines ${data.data.Lines[0]}-${data.data.Lines[data.data.Lines.length - 1]}`;
            
            return new CodeMarkerTreeItem(
                `${lineInfo} (Greyout)`,
                vscode.TreeItemCollapsibleState.None,
                'syntaxHighlight',
                undefined,
                data.filePath,
                undefined,
                data.folder,
                undefined,
                data.data
            );
        }
        
        throw new Error('Unknown data type');
    }

    protected getErrorMessage(error: any): string {
        return `Failed to load CodeMarker data: ${error}`;
    }

    // ===========================================
    // ドラッグ&ドロップメソッド
    // ===========================================

    protected canDrag(item: CodeMarkerTreeItem): boolean {
        return item.itemType !== 'folder';
    }

    protected canDrop(target: CodeMarkerTreeItem | undefined): boolean {
        return target?.itemType === 'folder' || !target;
    }

    protected createDragData(items: CodeMarkerTreeItem[]): any {
        return items
            .filter(item => item.itemType !== 'folder')
            .map(item => ({
                itemType: item.itemType,
                folder: item.folder,
                filePath: item.filePath,
                id: item.diagnostics?.id || item.highlight?.id,
                label: item.label
            }));
    }

    protected async performDrop(target: CodeMarkerTreeItem | undefined, dragData: any[]): Promise<void> {
        const targetFolder = target?.folderPath || 'Default';

        for (const item of dragData) {
            if (item.itemType === 'diagnostics' && item.id && item.folder && item.filePath) {
                await this.storage.moveDiagnosticsToFolder(item.folder, item.filePath, item.id, targetFolder);
            } else if (item.itemType === 'lineHighlight' && item.id && item.folder && item.filePath) {
                await this.storage.moveLineHighlightToFolder(item.folder, item.filePath, item.id, targetFolder);
            } else if (item.itemType === 'syntaxHighlight' && item.folder && item.filePath) {
                await this.storage.moveSyntaxHighlightToFolder(item.folder, item.filePath, targetFolder);
            }
        }
    }

    protected getDropSuccessMessage(dragData: any[], targetFolder: string): string {
        return dragData.length === 1
            ? `Moved "${dragData[0].label}" to "${targetFolder}"`
            : `Moved ${dragData.length} items to "${targetFolder}"`;
    }

    protected getDropErrorMessage(error: any): string {
        return `Failed to move CodeMarker item: ${error}`;
    }

    protected isFolderItem(element: CodeMarkerTreeItem): boolean {
        return element.itemType === 'folder';
    }

    protected getFolderPath(element: CodeMarkerTreeItem): string | undefined {
        return element.folderPath;
    }
}