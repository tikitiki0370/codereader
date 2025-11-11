import { StateController } from '../../stateController';

/**
 * フォルダー管理の共通ロジックを提供する抽象基底クラス
 * PostItStorageとCodeMarkerStorageで共通のフォルダー操作を統一
 */
export abstract class BaseFolderStorage<TData> {
    protected abstract readonly TOOL_NAME: string;
    protected abstract readonly DEFAULT_FOLDER: string;

    constructor(protected stateController: StateController) {}

    /**
     * ツール固有のデータ全体を取得する（サブクラスで実装）
     */
    protected abstract getData(): Promise<TData>;

    /**
     * ツール固有のデータ全体を保存する（サブクラスで実装）
     */
    protected abstract saveData(data: TData): Promise<void>;

    /**
     * データからフォルダーオブジェクトを取得する（サブクラスで実装）
     */
    protected abstract getFolderObject(data: TData): Record<string, any>;

    /**
     * データにフォルダーオブジェクトを設定する（サブクラスで実装）
     */
    protected abstract setFolderObject(data: TData, folders: Record<string, any>): void;

    /**
     * 最後に使用したフォルダーを取得する（サブクラスで実装可能）
     */
    protected abstract getLastedFolder(data: TData): string | undefined;

    /**
     * 最後に使用したフォルダーを設定する（サブクラスで実装可能）
     */
    protected abstract setLastedFolder(data: TData, folder: string): void;

    // ===========================================
    // フォルダー管理メソッド（共通実装）
    // ===========================================

    /**
     * フォルダ一覧を取得
     */
    async getFolders(): Promise<string[]> {
        const data = await this.getData();
        const folderObject = this.getFolderObject(data);
        return Object.keys(folderObject);
    }

    /**
     * フォルダを作成（親フォルダも自動作成）
     */
    async createFolder(folderPath: string): Promise<boolean> {
        const data = await this.getData();
        const folderObject = this.getFolderObject(data);

        if (folderObject[folderPath]) {
            return false; // 既に存在
        }

        // 親フォルダも作成
        const parts = folderPath.split('/');
        for (let i = 1; i <= parts.length; i++) {
            const subPath = parts.slice(0, i).join('/');
            if (!folderObject[subPath]) {
                folderObject[subPath] = this.createEmptyFolder();
            }
        }

        this.setFolderObject(data, folderObject);
        await this.saveData(data);
        return true;
    }

    /**
     * 空のフォルダーデータ構造を作成（サブクラスでオーバーライド可能）
     */
    protected createEmptyFolder(): any {
        return [];
    }

    /**
     * サブフォルダを取得
     */
    async getSubfolders(parentFolder: string): Promise<string[]> {
        const folders = await this.getFolders();
        const prefix = parentFolder + '/';
        return folders.filter(f =>
            f.startsWith(prefix) &&
            f.substring(prefix.length).indexOf('/') === -1
        );
    }

    /**
     * フォルダをリネーム
     */
    async renameFolder(oldPath: string, newPath: string): Promise<boolean> {
        if (oldPath === this.DEFAULT_FOLDER) {
            return false; // デフォルトフォルダはリネーム不可
        }

        const data = await this.getData();
        const folderObject = this.getFolderObject(data);

        if (!folderObject[oldPath] || folderObject[newPath]) {
            return false; // 元のフォルダが存在しないか、新しいフォルダ名が既に存在する
        }

        // フォルダのデータを移動
        folderObject[newPath] = folderObject[oldPath];
        delete folderObject[oldPath];

        // サブフォルダもリネーム
        const subfolders = Object.keys(folderObject).filter(f => f.startsWith(oldPath + '/'));
        for (const subfolder of subfolders) {
            const newSubPath = subfolder.replace(oldPath, newPath);
            folderObject[newSubPath] = folderObject[subfolder];
            delete folderObject[subfolder];
        }

        // 最後に使用したフォルダの更新
        if (this.getLastedFolder(data) === oldPath) {
            this.setLastedFolder(data, newPath);
        }

        this.setFolderObject(data, folderObject);
        await this.saveData(data);
        return true;
    }

    /**
     * フォルダを削除
     */
    async deleteFolder(folderPath: string): Promise<boolean> {
        if (folderPath === this.DEFAULT_FOLDER) {
            return false; // デフォルトフォルダは削除不可
        }

        const data = await this.getData();
        const folderObject = this.getFolderObject(data);

        if (!folderObject[folderPath]) {
            return false; // フォルダが存在しない
        }

        // フォルダを削除
        delete folderObject[folderPath];

        // サブフォルダも削除
        const subfolders = Object.keys(folderObject).filter(f => f.startsWith(folderPath + '/'));
        for (const subfolder of subfolders) {
            delete folderObject[subfolder];
        }

        // 最後に使用したフォルダの更新
        if (this.getLastedFolder(data) === folderPath) {
            this.setLastedFolder(data, this.DEFAULT_FOLDER);
        }

        this.setFolderObject(data, folderObject);
        await this.saveData(data);
        return true;
    }

    /**
     * フォルダが空かどうかチェック（サブクラスで実装）
     */
    abstract isFolderEmpty(folder: string): Promise<boolean>;

    /**
     * 有効な最後に使用したフォルダを取得
     */
    async getValidLastedFolder(): Promise<string> {
        const data = await this.getData();
        const lastedFolder = this.getLastedFolder(data);

        if (!lastedFolder) {
            return this.DEFAULT_FOLDER;
        }

        const folderObject = this.getFolderObject(data);

        // フォルダが存在するかチェック
        if (folderObject[lastedFolder]) {
            return lastedFolder;
        }

        // 存在しない場合はDefaultに設定を更新して返す
        this.setLastedFolder(data, this.DEFAULT_FOLDER);
        await this.saveData(data);
        return this.DEFAULT_FOLDER;
    }

    /**
     * フォルダツリーを取得（階層構造として）
     */
    async getFolderTree(): Promise<any> {
        const folders = await this.getFolders();
        const tree: any = {};

        for (const folder of folders) {
            const parts = folder.split('/');
            let current = tree;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (!current[part]) {
                    current[part] = {
                        _path: parts.slice(0, i + 1).join('/'),
                        _children: {}
                    };
                }
                current = current[part]._children;
            }
        }

        return tree;
    }
}
