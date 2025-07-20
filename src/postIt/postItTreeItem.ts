import * as vscode from 'vscode';
import { PostItNote } from './postItStorage';

export class PostItTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: 'folder' | 'note',
        public readonly folderPath?: string,
        public readonly note?: PostItNote,
        public readonly command?: vscode.Command,
    ) {
        super(label, collapsibleState);
        
        if (itemType === 'folder') {
            this.tooltip = `Folder: ${folderPath}`;
            this.description = '';
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'postItFolder';
            this.resourceUri = vscode.Uri.parse(`postit-folder:/${folderPath}`);
        } else if (itemType === 'note' && note) {
            const firstLine = note.Lines[0]; // 最初の行を使用
            this.tooltip = `${note.title}\nColor: ${note.color}\nFile: ${firstLine.file}\nLine: ${firstLine.line}\nCreated: ${note.createdAt}`;
            this.description = `${note.color} • ${note.Lines.length} line(s)`;
            this.iconPath = new vscode.ThemeIcon('note');
            this.contextValue = 'postItNote';
            
            // ノートをクリックした時にファイルを開くコマンドを設定
            const lineData = firstLine;
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