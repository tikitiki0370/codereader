import * as vscode from 'vscode';
import { PostItStorage, PostItNote } from './postItStorage';

export class PostItProvider implements vscode.TreeDataProvider<PostItItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PostItItem | undefined | null | void> = new vscode.EventEmitter<PostItItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PostItItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private postItStorage: PostItStorage) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PostItItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PostItItem): Promise<PostItItem[]> {
        try {
            if (!element) {
                // ルートレベル - フォルダを表示
                const folders = await this.postItStorage.getFolders();
                return folders.map(folder => new PostItItem(
                    folder,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'folder',
                    folder
                ));
            } else if (element.itemType === 'folder') {
                // フォルダ内のPostItNotesを表示
                const notes = await this.postItStorage.getNotesByFolder(element.folderPath!);
                return notes.map(note => new PostItItem(
                    note.title,
                    vscode.TreeItemCollapsibleState.None,
                    'note',
                    undefined,
                    note
                ));
            }
        } catch (error) {
            console.error('Error getting PostIt children:', error);
            vscode.window.showErrorMessage(`Failed to load PostIt data: ${error}`);
        }
        
        return [];
    }
}

class PostItItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: 'folder' | 'note',
        public readonly folderPath?: string,
        public readonly note?: PostItNote,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        
        if (itemType === 'folder') {
            this.tooltip = `Folder: ${folderPath}`;
            this.description = '';
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'postItFolder';
        } else if (itemType === 'note' && note) {
            this.tooltip = `${note.title}\nColor: ${note.corlor}\nFile: ${note.Lines.file}\nLine: ${note.Lines.line}\nCreated: ${note.createdAt}`;
            this.description = `${note.corlor} • Line ${note.Lines.line}`;
            this.iconPath = new vscode.ThemeIcon('note');
            this.contextValue = 'postItNote';
            
            // ノートをクリックした時にファイルを開くコマンドを設定
            const lineData = note.Lines;
            const vscodeLineNumber = lineData.line - 1; // 1ベースから0ベースに変換
            
            // ワークスペース相対パスから絶対パスに変換
            let fileUri: vscode.Uri;
            if (lineData.file.startsWith('/') || lineData.file.match(/^[a-zA-Z]:/)) {
                // 既に絶対パスの場合
                fileUri = vscode.Uri.file(lineData.file);
            } else {
                // 相対パスの場合、ワークスペースフォルダから解決
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    fileUri = vscode.Uri.joinPath(workspaceFolder.uri, lineData.file);
                } else {
                    fileUri = vscode.Uri.file(lineData.file);
                }
            }
            
            console.log(`Opening PostIt:`, {
                storedFile: lineData.file,
                resolvedUri: fileUri.toString(),
                storedLine: lineData.line, // 保存されている行番号（1ベース）
                vscodeLineNumber: vscodeLineNumber, // VSCode用行番号（0ベース）
                text: lineData.text.substring(0, 50) + (lineData.text.length > 50 ? '...' : '')
            });
            
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [
                    fileUri,
                    {
                        selection: new vscode.Range(
                            vscodeLineNumber, 0, 
                            vscodeLineNumber, 0
                        )
                    }
                ]
            };
        }
    }
}