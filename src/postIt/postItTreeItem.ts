import * as vscode from 'vscode';
import { PostItNote } from './postItStorage';
import { BaseTreeItem } from '../modules';

export class PostItTreeItem extends BaseTreeItem<PostItNote> {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        // プロパティとして定義せず、引数としてのみ受け取る
        itemType: 'folder' | 'note',
        public readonly folderPath?: string,
        note?: PostItNote,
        cmd?: vscode.Command,
    ) {
        // BaseTreeItemのコンストラクタに合わせてitemTypeを変換
        // note -> data
        super(
            label, 
            collapsibleState, 
            itemType === 'note' ? 'data' : 'folder',
            folderPath,
            note,
            cmd
        );
    }

    // noteプロパティへのエイリアス（互換性のため）
    get note(): PostItNote | undefined { return this.data; }

    protected getFolderContextValue(): string {
        return 'postItFolder';
    }

    protected getUriScheme(): string {
        return 'postit-folder';
    }

    protected getDataTooltip(): string {
        if (!this.data) return '';
        const firstLine = this.data.Lines[0];
        return `${this.data.title}\nColor: ${this.data.color}\nFile: ${firstLine.file}\nLine: ${firstLine.line}\nCreated: ${this.data.createdAt}`;
    }

    protected getDataDescription(): string | undefined {
        if (!this.data) return undefined;
        return `${this.data.color} • ${this.data.Lines.length} line(s)`;
    }

    protected getDataIcon(): vscode.ThemeIcon {
        return new vscode.ThemeIcon('note');
    }

    protected getDataContextValue(): string {
        return 'postItNote';
    }

    protected getDataCommand(): vscode.Command | undefined {
        if (!this.data) return undefined;

        const lineData = this.data.Lines[0];
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
        
        return {
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