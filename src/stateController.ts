import * as vscode from 'vscode';

export class StateController {
    private static instance: StateController | null = null;
    private storageUri: vscode.Uri | undefined;
    private dataCache: Map<string, any> = new Map();
    private saveTimeouts: Map<string, NodeJS.Timeout> = new Map();

    private constructor(context: vscode.ExtensionContext) {
        this.storageUri = context.storageUri;
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

    public async initialize(): Promise<void> {
        if (!this.storageUri) {
            throw new Error('No workspace storage available');
        }

        // ストレージディレクトリの確認・作成
        try {
            await vscode.workspace.fs.stat(this.storageUri);
        } catch {
            await vscode.workspace.fs.createDirectory(this.storageUri);
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
        
        if (!this.storageUri) return;
        
        try {
            const filePath = vscode.Uri.joinPath(this.storageUri, `${toolName}.json`);
            await vscode.workspace.fs.delete(filePath);
            console.log(`${toolName}.json deleted`);
        } catch (error) {
            console.error(`Failed to delete ${toolName}.json:`, error);
        }
    }

    // 利用可能なツール一覧を取得
    public async getAvailableTools(): Promise<string[]> {
        if (!this.storageUri) return [];
        
        try {
            const files = await vscode.workspace.fs.readDirectory(this.storageUri);
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
        if (!this.storageUri) return null;

        const filePath = vscode.Uri.joinPath(this.storageUri, `${toolName}.json`);
        
        try {
            const fileData = await vscode.workspace.fs.readFile(filePath);
            const jsonData = new TextDecoder().decode(fileData);
            const data = JSON.parse(jsonData);
            this.dataCache.set(toolName, data);
            console.log(`${toolName} data loaded from file`);
            return data;
        } catch (error) {
            // ファイルが存在しない場合はnullを返す
            console.log(`No existing ${toolName}.json file`);
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
        if (!this.storageUri) return;

        const data = this.dataCache.get(toolName);
        if (data === undefined) return;

        try {
            const filePath = vscode.Uri.joinPath(this.storageUri, `${toolName}.json`);
            const jsonData = JSON.stringify(data, null, 2);
            await vscode.workspace.fs.writeFile(filePath, new TextEncoder().encode(jsonData));
            console.log(`${toolName} data saved to file`);
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