import * as vscode from 'vscode';
import { QuickMemoFile } from './quickMemoStorage';

export class QuickMemoTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: 'folder' | 'memo',
        public readonly folderPath?: string,
        public readonly memo?: QuickMemoFile,
        public readonly command?: vscode.Command,
    ) {
        super(label, collapsibleState);
        
        if (itemType === 'folder') {
            this.tooltip = `Folder: ${folderPath}`;
            this.description = '';
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'quickMemoFolder';
            this.resourceUri = vscode.Uri.parse(`quickmemo-folder:/${folderPath}`);
        } else if (itemType === 'memo' && memo) {
            this.tooltip = `${memo.title}\nCreated: ${memo.createAt}\nUpdated: ${memo.updateAt}`;
            this.description = `${memo.links.length > 0 ? '🔗 ' : ''}${new Date(memo.updateAt).toLocaleDateString()}`;
            this.iconPath = new vscode.ThemeIcon('note');
            this.contextValue = 'quickMemoNote';
            
            // メモをクリックした時にMarkdownファイルを開くコマンドを設定
            this.command = {
                command: 'codereader.openQuickMemo',
                title: 'Open Memo',
                arguments: [memo]
            };
        }
    }
}