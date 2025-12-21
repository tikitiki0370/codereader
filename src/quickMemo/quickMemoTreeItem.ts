import * as vscode from 'vscode';
import { QuickMemoFile } from './quickMemoStorage';
import { BaseTreeItem } from '../modules';

export class QuickMemoTreeItem extends BaseTreeItem<QuickMemoFile> {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        itemType: 'folder' | 'memo',
        public readonly folderPath?: string,
        memo?: QuickMemoFile,
        cmd?: vscode.Command,
        public readonly parentFolderPath?: string // New property for getParent support
    ) {
        super(
            label, 
            collapsibleState, 
            itemType === 'memo' ? 'data' : 'folder',
            folderPath,
            memo,
            cmd
        );
    }

    // dataプロパティへのエイリアス（互換性のため）
    get memo(): QuickMemoFile | undefined { return this.data; }

    protected getFolderContextValue(): string {
        return 'quickMemoFolder';
    }

    protected getUriScheme(): string {
        return 'quickmemo-folder';
    }

    protected getDataTooltip(): string {
        if (!this.data) return '';
        return `${this.data.title}\nCreated: ${this.data.createAt}\nUpdated: ${this.data.updateAt}`;
    }

    protected getDataDescription(): string | undefined {
        if (!this.data) return undefined;
        return `${this.data.Lines.length > 0 ? '🔗 ' : ''}${new Date(this.data.updateAt).toLocaleDateString()}`;
    }

    protected getDataIcon(): vscode.ThemeIcon {
        return new vscode.ThemeIcon('note');
    }

    protected getDataContextValue(): string {
        return 'quickMemoNote';
    }

    protected getDataCommand(): vscode.Command | undefined {
        if (!this.data) return undefined;
        return {
            command: 'codereader.openQuickMemo',
            title: 'Open Memo',
            arguments: [this.data]
        };
    }
}