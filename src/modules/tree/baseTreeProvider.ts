import * as vscode from 'vscode';

/**
 * TreeDataProviderの抽象基底クラス
 * 各機能のTreeProviderは、このクラスを継承して必要なメソッドをオーバーライドする
 */
export abstract class BaseTreeProvider<TData, TTreeItem extends vscode.TreeItem> 
    implements vscode.TreeDataProvider<TTreeItem>, vscode.TreeDragAndDropController<TTreeItem> {
    
    private _onDidChangeTreeData: vscode.EventEmitter<TTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<TTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    // ドラッグ&ドロップ設定
    abstract readonly dropMimeTypes: string[];
    abstract readonly dragMimeTypes: string[];

    constructor() {
        // 抽象クラスのコンストラクター
    }

    /**
     * ツリーを更新
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * TreeItemを取得
     */
    getTreeItem(element: TTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * 子要素を取得
     */
    async getChildren(element?: TTreeItem): Promise<TTreeItem[]> {
        console.log('BaseTreeProvider.getChildren called with element:', element);
        try {
            if (!element) {
                // ルートレベル - フォルダを表示
                console.log('Getting root folders...');
                const folders = await this.getRootFolders();
                console.log('Root folders:', folders);
                const items = folders.map(folder => this.createFolderItem(folder));
                console.log('Created root items:', items.length);
                return items;
            } else if (this.isFolderItem(element)) {
                // フォルダ内のサブフォルダとアイテムを表示
                const folderPath = this.getFolderPath(element);
                console.log('Getting children for folder:', folderPath);
                if (folderPath) {
                    const items: TTreeItem[] = [];
                    
                    // サブフォルダを追加
                    const subfolders = await this.getSubfolders(folderPath);
                    console.log('Subfolders:', subfolders);
                    items.push(...subfolders.map(subfolder => this.createFolderItem(subfolder)));
                    
                    // データアイテムを追加
                    const dataItems = await this.getItemsByFolder(folderPath);
                    console.log('Data items:', dataItems.length);
                    items.push(...dataItems.map(item => this.createDataItem(item)));
                    
                    console.log('Total folder items:', items.length);
                    return items;
                }
            }
        } catch (error) {
            console.error('Error getting tree children:', error);
            vscode.window.showErrorMessage(this.getErrorMessage(error));
        }
        
        console.log('Returning empty array');
        return [];
    }

    // ===========================================
    // 抽象メソッド（継承クラスで実装）
    // ===========================================

    /**
     * ルートフォルダ一覧を取得
     */
    protected abstract getRootFolders(): Promise<string[]>;

    /**
     * 指定フォルダのサブフォルダを取得
     */
    protected abstract getSubfolders(parentFolder: string): Promise<string[]>;

    /**
     * 指定フォルダ内のデータアイテムを取得
     */
    protected abstract getItemsByFolder(folderPath: string): Promise<TData[]>;

    /**
     * フォルダのTreeItemを作成
     */
    protected abstract createFolderItem(folderPath: string): TTreeItem;

    /**
     * データのTreeItemを作成
     */
    protected abstract createDataItem(data: TData): TTreeItem;

    /**
     * エラー時のメッセージを取得
     */
    protected abstract getErrorMessage(error: any): string;

    /**
     * ドラッグ開始時の処理
     */
    async handleDrag(source: TTreeItem[], treeDataTransfer: vscode.DataTransfer): Promise<void> {
        // ドラッグ&ドロップが無効な場合は何もしない
        if (this.dragMimeTypes.length === 0) return;
        
        // ドラッグ可能なアイテムのみフィルタリング
        const draggableItems = source.filter(item => this.canDrag(item));
        if (draggableItems.length === 0) return;

        // ドラッグデータを作成
        const dragData = this.createDragData(draggableItems);

        // DataTransferに設定
        treeDataTransfer.set(
            this.dragMimeTypes[0], 
            new vscode.DataTransferItem(JSON.stringify(dragData))
        );
    }

    /**
     * ドロップ時の処理
     */
    async handleDrop(target: TTreeItem | undefined, sources: vscode.DataTransfer): Promise<void> {
        // ドラッグ&ドロップが無効な場合は何もしない
        if (this.dropMimeTypes.length === 0) return;
        
        const transferItem = sources.get(this.dropMimeTypes[0]);
        if (!transferItem) return;

        try {
            const dragData = JSON.parse(transferItem.value);
            
            // ドロップ可能なターゲットかチェック
            if (this.canDrop(target)) {
                await this.performDrop(target, dragData);
                
                // 成功メッセージを表示
                const targetFolder = target ? this.getFolderPath(target) : 'Default';
                if (targetFolder) {
                    const message = this.getDropSuccessMessage(dragData, targetFolder);
                    vscode.window.showInformationMessage(message);
                }
                
                // ツリーを更新
                this.refresh();
            }
        } catch (error) {
            console.error('Error during drag and drop:', error);
            const errorMessage = this.getDropErrorMessage(error);
            vscode.window.showErrorMessage(errorMessage);
        }
    }

    // ===========================================
    // ドラッグ&ドロップ抽象メソッド
    // ===========================================

    /**
     * ドラッグ可能なアイテムかチェック
     */
    protected abstract canDrag(item: TTreeItem): boolean;

    /**
     * ドロップ可能なターゲットかチェック
     */
    protected abstract canDrop(target: TTreeItem | undefined): boolean;

    /**
     * ドラッグデータを作成
     */
    protected abstract createDragData(items: TTreeItem[]): any;

    /**
     * ドロップ処理を実行
     */
    protected abstract performDrop(target: TTreeItem | undefined, dragData: any): Promise<void>;

    /**
     * ドロップ成功メッセージを取得
     */
    protected abstract getDropSuccessMessage(dragData: any, targetFolder: string): string;

    /**
     * ドロップエラーメッセージを取得
     */
    protected abstract getDropErrorMessage(error: any): string;

    /**
     * フォルダアイテムかどうかを判定
     */
    protected abstract isFolderItem(element: TTreeItem): boolean;

    /**
     * フォルダパスを取得
     */
    protected abstract getFolderPath(element: TTreeItem): string | undefined;
}