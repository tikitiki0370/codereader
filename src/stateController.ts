import * as vscode from 'vscode';

export class StateController {
    private static instance: StateController | null = null;
    private extensionStorageUri: vscode.Uri | undefined;
    private dataCache: Map<string, any> = new Map();
    private saveTimeouts: Map<string, NodeJS.Timeout> = new Map();

    private constructor(context: vscode.ExtensionContext) {
        this.extensionStorageUri = context.storageUri;
    }

    public static getInstance(context?: vscode.ExtensionContext): StateController {
        if (!StateController.instance && context) {
            StateController.instance = new StateController(context);
        }
        if (!StateController.instance) {
            throw new Error('StateController not initialized. Call getInstance with context first.');
        }
        return StateController.instance;
    }

    /**
     * Get the storage URI based on user configuration
     * @returns Storage URI (either workspace .codereader or extension storage)
     */
    private getStorageUriInternal(): vscode.Uri | undefined {
        const config = vscode.workspace.getConfiguration('codereader');
        const storageLocation = config.get<string>('storageLocation', 'workspace');

        if (storageLocation === 'workspace') {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                // Fallback to extension storage if no workspace is open
                console.log('No workspace open, falling back to extension storage');
                return this.extensionStorageUri;
            }
            return vscode.Uri.joinPath(workspaceFolders[0].uri, '.codereader');
        }

        return this.extensionStorageUri; // extension storage
    }

    /**
     * Public method to get storage URI for other classes
     * @returns Storage URI
     */
    public getStorageUri(): vscode.Uri | undefined {
        return this.getStorageUriInternal();
    }

    public async initialize(): Promise<void> {
        const storageUri = this.getStorageUriInternal();
        if (!storageUri) {
            throw new Error('No workspace storage available');
        }

        // ストレージディレクトリの確認・作成
        try {
            await vscode.workspace.fs.stat(storageUri);
            console.log('Storage directory exists:', storageUri.fsPath);
        } catch {
            try {
                await vscode.workspace.fs.createDirectory(storageUri);
                console.log('Storage directory created:', storageUri.fsPath);
            } catch (error) {
                console.error('Failed to create storage directory:', error);
                // If workspace storage fails, try extension storage as fallback
                if (storageUri !== this.extensionStorageUri && this.extensionStorageUri) {
                    console.log('Falling back to extension storage');
                    try {
                        await vscode.workspace.fs.createDirectory(this.extensionStorageUri);
                    } catch (fallbackError) {
                        throw new Error('Failed to create storage directory: ' + error);
                    }
                } else {
                    throw new Error('Failed to create storage directory: ' + error);
                }
            }
        }
    }

    // ツール固有のデータ取得
    public async get(toolName: string): Promise<any> {
        if (this.dataCache.has(toolName)) {
            return this.dataCache.get(toolName);
        }
        
        return await this.load(toolName);
    }

    // ツール固有のデータ設定（自動保存）
    public set(toolName: string, data: any): void {
        this.dataCache.set(toolName, data);
        this.scheduleSave(toolName);
    }

    // ツール固有のデータ削除
    public async delete(toolName: string): Promise<void> {
        this.dataCache.delete(toolName);

        const storageUri = this.getStorageUriInternal();
        if (!storageUri) return;

        try {
            const filePath = vscode.Uri.joinPath(storageUri, `${toolName}.json`);
            await vscode.workspace.fs.delete(filePath);
            console.log(`${toolName}.json deleted`);
        } catch (error) {
            console.error(`Failed to delete ${toolName}.json:`, error);
        }
    }

    // 利用可能なツール一覧を取得
    public async getAvailableTools(): Promise<string[]> {
        const storageUri = this.getStorageUriInternal();
        if (!storageUri) return [];

        try {
            const files = await vscode.workspace.fs.readDirectory(storageUri);
            return files
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.json'))
                .map(([name]) => name.replace('.json', ''));
        } catch (error) {
            return [];
        }
    }

    // ツール固有のデータをクリア
    public clear(toolName: string): void {
        this.dataCache.set(toolName, null);
        this.scheduleSave(toolName);
    }

    // ツール固有ファイルからの読み込み
    private async load(toolName: string): Promise<any> {
        const storageUri = this.getStorageUriInternal();
        if (!storageUri) return null;

        const filePath = vscode.Uri.joinPath(storageUri, `${toolName}.json`);

        try {
            const fileData = await vscode.workspace.fs.readFile(filePath);
            const jsonData = new TextDecoder().decode(fileData);
            const data = JSON.parse(jsonData);
            this.dataCache.set(toolName, data);
            console.log(`${toolName} data loaded from file:`, filePath.fsPath);
            return data;
        } catch (error) {
            // ファイルが存在しない場合はnullを返す
            console.log(`No existing ${toolName}.json file at:`, filePath.fsPath);
            return null;
        }
    }

    // ツール固有ファイルへの保存（デバウンス付き）
    private scheduleSave(toolName: string): void {
        const existingTimeout = this.saveTimeouts.get(toolName);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        const timeout = setTimeout(() => {
            this.save(toolName);
            this.saveTimeouts.delete(toolName);
        }, 500); // 500ms後に保存

        this.saveTimeouts.set(toolName, timeout);
    }

    // ツール固有の実際の保存処理
    private async save(toolName: string): Promise<void> {
        const storageUri = this.getStorageUriInternal();
        if (!storageUri) return;

        const data = this.dataCache.get(toolName);
        if (data === undefined) return;

        try {
            const filePath = vscode.Uri.joinPath(storageUri, `${toolName}.json`);
            const jsonData = JSON.stringify(data, null, 2);
            await vscode.workspace.fs.writeFile(filePath, new TextEncoder().encode(jsonData));
            console.log(`${toolName} data saved to file:`, filePath.fsPath);
        } catch (error) {
            console.error(`Failed to save ${toolName} data:`, error);
        }
    }

    // 特定ツールの即座保存
    public async forceSave(toolName: string): Promise<void> {
        const timeout = this.saveTimeouts.get(toolName);
        if (timeout) {
            clearTimeout(timeout);
            this.saveTimeouts.delete(toolName);
        }
        await this.save(toolName);
    }

    // 全ツールの即座保存
    public async forceSaveAll(): Promise<void> {
        const tools = Array.from(this.dataCache.keys());
        await Promise.all(tools.map(tool => this.forceSave(tool)));
    }

    // クリーンアップ
    public async close(): Promise<void> {
        await this.forceSaveAll();
        this.dataCache.clear();
        this.saveTimeouts.forEach(timeout => clearTimeout(timeout));
        this.saveTimeouts.clear();
    }

    public static async dispose(): Promise<void> {
        if (StateController.instance) {
            await StateController.instance.close();
            StateController.instance = null;
        }
    }
}