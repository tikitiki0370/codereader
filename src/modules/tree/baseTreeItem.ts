import * as vscode from 'vscode';

/**
 * ツリーアイテムの共通基底クラス
 * フォルダとデータアイテムの共通ロジックを提供
 */
export abstract class BaseTreeItem<T> extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: 'folder' | 'data',
        public readonly folderPath?: string,
        public readonly data?: T,
        command?: vscode.Command 
    ) {
        super(label, collapsibleState);
        
        // コンストラクタ引数のcommandをプロパティに設定
        if (command) {
            this.command = command;
        }

        if (this.isFolder()) {
            this.setupFolder();
        } else {
            this.setupDataItem();
        }
    }

    /**
     * フォルダーかどうかを判定（オーバーライド可能）
     */
    protected isFolder(): boolean {
        return this.itemType === 'folder';
    }

    /**
     * フォルダー表示のセットアップ（オーバーライド可能）
     */
    protected setupFolder(): void {
        this.tooltip = `Folder: ${this.folderPath}`;
        this.description = '';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = this.getFolderContextValue();
        this.resourceUri = vscode.Uri.parse(`${this.getUriScheme()}:/${this.folderPath}`);
    }

    /**
     * データアイテム表示のセットアップ（オーバーライド可能）
     */
    protected setupDataItem(): void {
        this.tooltip = this.getDataTooltip();
        this.description = this.getDataDescription();
        this.iconPath = this.getDataIcon();
        this.contextValue = this.getDataContextValue();
        
        // コマンドが設定されていない場合、getDataCommand()を使用
        if (!this.command) {
            this.command = this.getDataCommand();
        }
    }

    /**
     * フォルダのContextValueを取得（サブクラスで実装）
     */
    protected abstract getFolderContextValue(): string;

    /**
     * URIスキームを取得（サブクラスで実装）
     */
    protected abstract getUriScheme(): string;

    /**
     * データのツールチップを取得（サブクラスで実装）
     */
    protected abstract getDataTooltip(): string;

    /**
     * データの説明文を取得（サブクラスで実装）
     */
    protected abstract getDataDescription(): string | undefined;

    /**
     * データのアイコンを取得（サブクラスで実装）
     */
    protected abstract getDataIcon(): vscode.ThemeIcon;

    /**
     * データのContextValueを取得（サブクラスで実装）
     */
    protected abstract getDataContextValue(): string;

    /**
     * データのクリック時のコマンドを取得（サブクラスで実装）
     */
    protected abstract getDataCommand(): vscode.Command | undefined;
}
