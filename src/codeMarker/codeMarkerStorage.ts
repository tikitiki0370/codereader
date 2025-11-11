import { StateController } from '../stateController';
import { CodeMarker, CodeMarkerDiagnostics, DiagnosticsTypes, DiagnosticsLine, CodeMarkerLineHighlight, CodeMarkerSyntaxHighlight } from './types';

export type CreateCodeMarkerDiagnostics = Omit<CodeMarkerDiagnostics, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateCodeMarkerDiagnostics = Partial<Omit<CodeMarkerDiagnostics, 'id' | 'createdAt'>>;
export type CreateCodeMarkerLineHighlight = Omit<CodeMarkerLineHighlight, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateCodeMarkerLineHighlight = Partial<Omit<CodeMarkerLineHighlight, 'id' | 'createdAt'>>;
export type CreateCodeMarkerSyntaxHighlight = Omit<CodeMarkerSyntaxHighlight, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateCodeMarkerSyntaxHighlight = Partial<Omit<CodeMarkerSyntaxHighlight, 'id' | 'createdAt'>>;

export class CodeMarkerStorage {
    private static readonly TOOL_NAME = 'codeMarker';
    private static readonly CURRENT_VERSION = '1.0.0';
    private static readonly DEFAULT_FOLDER = 'Default';
    
    constructor(private stateController: StateController) {}
    
    // CodeMarkerデータ全体を取得
    async getCodeMarkerData(): Promise<CodeMarker> {
        const data = await this.stateController.get(CodeMarkerStorage.TOOL_NAME);
        if (!data) {
            // 初期データ構造を作成
            return {
                CodeMarker: {
                    [CodeMarkerStorage.DEFAULT_FOLDER]: {}
                },
                Config: {
                    debug: false
                },
                Version: CodeMarkerStorage.CURRENT_VERSION
            };
        }
        return data;
    }
    
    // エイリアス（LineHighlightManagerで使用）
    async getData(): Promise<CodeMarker> {
        return this.getCodeMarkerData();
    }
    
    // CodeMarkerデータ全体を保存
    private async saveCodeMarkerData(data: CodeMarker): Promise<void> {
        await this.stateController.set(CodeMarkerStorage.TOOL_NAME, data);
    }
    
    // フォルダを作成（親フォルダも自動作成）
    async createFolder(folderPath: string): Promise<boolean> {
        const data = await this.getCodeMarkerData();

        if (data.CodeMarker[folderPath]) {
            return false; // 既に存在する
        }

        // 親フォルダも作成
        const parts = folderPath.split('/');
        for (let i = 1; i <= parts.length; i++) {
            const subPath = parts.slice(0, i).join('/');
            if (!data.CodeMarker[subPath]) {
                data.CodeMarker[subPath] = {};
            }
        }

        await this.saveCodeMarkerData(data);
        return true;
    }
    
    // 全フォルダを取得
    async getFolders(): Promise<string[]> {
        const data = await this.getCodeMarkerData();
        return Object.keys(data.CodeMarker);
    }

    // サブフォルダを取得（ネストフォルダーサポート）
    async getSubfolders(parentFolder: string): Promise<string[]> {
        const folders = await this.getFolders();
        const prefix = parentFolder + '/';
        return folders.filter(f =>
            f.startsWith(prefix) &&
            f.substring(prefix.length).indexOf('/') === -1
        );
    }
    
    // フォルダをリネーム（サブフォルダーも一緒にリネーム）
    async renameFolder(oldPath: string, newPath: string): Promise<boolean> {
        if (oldPath === CodeMarkerStorage.DEFAULT_FOLDER) {
            return false; // デフォルトフォルダはリネーム不可
        }

        const data = await this.getCodeMarkerData();

        if (!data.CodeMarker[oldPath] || data.CodeMarker[newPath]) {
            return false; // 元のフォルダが存在しないか、新しいフォルダ名が既に存在する
        }

        // フォルダのデータを移動
        data.CodeMarker[newPath] = data.CodeMarker[oldPath];
        delete data.CodeMarker[oldPath];

        // サブフォルダもリネーム
        const subfolders = Object.keys(data.CodeMarker).filter(f => f.startsWith(oldPath + '/'));
        for (const subfolder of subfolders) {
            const newSubPath = subfolder.replace(oldPath, newPath);
            data.CodeMarker[newSubPath] = data.CodeMarker[subfolder];
            delete data.CodeMarker[subfolder];
        }

        // 最後に使用したフォルダの更新
        if (data.Config.lastedFolder === oldPath) {
            data.Config.lastedFolder = newPath;
        }

        await this.saveCodeMarkerData(data);
        return true;
    }
    
    // フォルダを削除（サブフォルダーも一緒に削除）
    async deleteFolder(folderPath: string): Promise<boolean> {
        if (folderPath === CodeMarkerStorage.DEFAULT_FOLDER) {
            return false; // デフォルトフォルダは削除不可
        }

        const data = await this.getCodeMarkerData();

        if (!data.CodeMarker[folderPath]) {
            return false; // フォルダが存在しない
        }

        // フォルダを削除
        delete data.CodeMarker[folderPath];

        // サブフォルダも削除
        const subfolders = Object.keys(data.CodeMarker).filter(f => f.startsWith(folderPath + '/'));
        for (const subfolder of subfolders) {
            delete data.CodeMarker[subfolder];
        }

        // 最後に使用したフォルダの更新
        if (data.Config.lastedFolder === folderPath) {
            data.Config.lastedFolder = CodeMarkerStorage.DEFAULT_FOLDER;
        }

        await this.saveCodeMarkerData(data);
        return true;
    }
    
    // 有効な最後に使用したフォルダを取得（PostItと同じ実装）
    async getValidLastedFolder(): Promise<string> {
        const data = await this.getCodeMarkerData();
        const lastedFolder = data.Config.lastedFolder;
        
        if (!lastedFolder) {
            return CodeMarkerStorage.DEFAULT_FOLDER;
        }
        
        // フォルダが存在するかチェック
        if (data.CodeMarker[lastedFolder]) {
            return lastedFolder;
        }
        
        // 存在しない場合はDefaultに設定を更新して返す
        await this.updateConfig({ lastedFolder: CodeMarkerStorage.DEFAULT_FOLDER });
        return CodeMarkerStorage.DEFAULT_FOLDER;
    }
    
    // 特定フォルダの特定ファイルのDiagnosticsを取得
    async getDiagnosticsByFolderAndFile(folder: string, filePath: string): Promise<CodeMarkerDiagnostics[]> {
        const data = await this.getCodeMarkerData();
        return data.CodeMarker[folder]?.[filePath]?.Diagnostics || [];
    }
    
    // 特定ファイルの全フォルダからDiagnosticsを取得
    async getDiagnosticsByFile(filePath: string): Promise<CodeMarkerDiagnostics[]> {
        const data = await this.getCodeMarkerData();
        const allDiagnostics: CodeMarkerDiagnostics[] = [];
        
        for (const folder of Object.keys(data.CodeMarker)) {
            const diagnostics = data.CodeMarker[folder][filePath]?.Diagnostics || [];
            allDiagnostics.push(...diagnostics);
        }
        
        return allDiagnostics;
    }
    
    // 全てのDiagnosticsを取得
    async getAllDiagnostics(): Promise<{ folder: string; filePath: string; diagnostics: CodeMarkerDiagnostics[] }[]> {
        const data = await this.getCodeMarkerData();
        const result: { folder: string; filePath: string; diagnostics: CodeMarkerDiagnostics[] }[] = [];
        
        for (const [folder, folderData] of Object.entries(data.CodeMarker)) {
            for (const [filePath, fileData] of Object.entries(folderData)) {
                if (fileData.Diagnostics && fileData.Diagnostics.length > 0) {
                    result.push({ folder, filePath, diagnostics: fileData.Diagnostics });
                }
            }
        }
        
        return result;
    }
    
    // フォルダ内のDiagnosticsを取得
    async getDiagnosticsByFolder(folder: string): Promise<{ filePath: string; diagnostics: CodeMarkerDiagnostics[] }[]> {
        const data = await this.getCodeMarkerData();
        const result: { filePath: string; diagnostics: CodeMarkerDiagnostics[] }[] = [];
        
        if (!data.CodeMarker[folder]) {
            return result;
        }
        
        for (const [filePath, fileData] of Object.entries(data.CodeMarker[folder])) {
            if (fileData.Diagnostics && fileData.Diagnostics.length > 0) {
                result.push({ filePath, diagnostics: fileData.Diagnostics });
            }
        }
        
        return result;
    }
    
    // フォルダが空かどうかチェック（全マーカータイプを考慮）
    async isFolderEmpty(folder: string): Promise<boolean> {
        const data = await this.getCodeMarkerData();
        
        if (!data.CodeMarker[folder]) {
            return true;
        }
        
        for (const fileData of Object.values(data.CodeMarker[folder])) {
            if ((fileData.Diagnostics && fileData.Diagnostics.length > 0) ||
                (fileData.LineHighlight && fileData.LineHighlight.length > 0) ||
                (fileData.SyntaxHighlight && fileData.SyntaxHighlight.Lines && fileData.SyntaxHighlight.Lines.length > 0)) {
                return false;
            }
        }
        
        return true;
    }
    
    // Diagnosticsを追加
    async addDiagnosticsToFolder(
        folder: string,
        filePath: string,
        diagnostics: CreateCodeMarkerDiagnostics
    ): Promise<CodeMarkerDiagnostics> {
        const data = await this.getCodeMarkerData();
        
        // フォルダが無い場合は作成
        if (!data.CodeMarker[folder]) {
            data.CodeMarker[folder] = {};
        }
        
        // ファイルのエントリが無い場合は作成
        if (!data.CodeMarker[folder][filePath]) {
            data.CodeMarker[folder][filePath] = {
                Diagnostics: [],
                LineHighlight: [],
                SyntaxHighlight: null
            };
        }
        
        const newDiagnostics: CodeMarkerDiagnostics = {
            ...diagnostics,
            id: this.generateId(),
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        data.CodeMarker[folder][filePath].Diagnostics.push(newDiagnostics);
        await this.saveCodeMarkerData(data);
        
        return newDiagnostics;
    }
    
    // Diagnosticsを更新
    async updateDiagnostics(
        folder: string,
        filePath: string,
        id: string,
        updates: UpdateCodeMarkerDiagnostics
    ): Promise<boolean> {
        const data = await this.getCodeMarkerData();
        
        if (!data.CodeMarker[folder]?.[filePath]) {
            return false;
        }
        
        const index = data.CodeMarker[folder][filePath].Diagnostics.findIndex(d => d.id === id);
        if (index === -1) {
            return false;
        }
        
        data.CodeMarker[folder][filePath].Diagnostics[index] = {
            ...data.CodeMarker[folder][filePath].Diagnostics[index],
            ...updates,
            updatedAt: new Date()
        };
        
        await this.saveCodeMarkerData(data);
        return true;
    }
    
    // Diagnosticsを削除
    async deleteDiagnostics(folder: string, filePath: string, id: string): Promise<boolean> {
        const data = await this.getCodeMarkerData();
        
        if (!data.CodeMarker[folder]?.[filePath]) {
            return false;
        }
        
        const initialLength = data.CodeMarker[folder][filePath].Diagnostics.length;
        data.CodeMarker[folder][filePath].Diagnostics = 
            data.CodeMarker[folder][filePath].Diagnostics.filter(d => d.id !== id);
        
        // ファイルのすべてのマーカーが空になった場合、ファイルエントリを削除
        const fileData = data.CodeMarker[folder][filePath];
        if (fileData.Diagnostics.length === 0 &&
            fileData.LineHighlight.length === 0 &&
            (!fileData.SyntaxHighlight || !fileData.SyntaxHighlight.Lines || fileData.SyntaxHighlight.Lines.length === 0)) {
            delete data.CodeMarker[folder][filePath];
            
            // フォルダが空になった場合、フォルダエントリを削除（デフォルトフォルダ以外）
            if (folder !== CodeMarkerStorage.DEFAULT_FOLDER && 
                Object.keys(data.CodeMarker[folder]).length === 0) {
                delete data.CodeMarker[folder];
            }
        }
        
        await this.saveCodeMarkerData(data);
        return initialLength !== (data.CodeMarker[folder]?.[filePath]?.Diagnostics.length || 0);
    }
    
    // 全てのDiagnosticsをクリア（PostItと同じくDefaultフォルダのみ残す）
    async clearAllDiagnostics(): Promise<void> {
        const data = await this.getCodeMarkerData();
        
        // PostItと同じく、Defaultフォルダのみ残して他は削除
        data.CodeMarker = {
            [CodeMarkerStorage.DEFAULT_FOLDER]: {}
        };
        
        await this.saveCodeMarkerData(data);
    }
    
    // フォルダごとにDiagnosticsをクリア（PostItと同じくフォルダは残す）
    async clearDiagnosticsByFolder(folder: string): Promise<void> {
        const data = await this.getCodeMarkerData();
        
        if (!data.CodeMarker[folder]) {
            return;
        }
        
        // フォルダ内のファイルエントリをクリア（PostItと同じくフォルダ自体は残す）
        data.CodeMarker[folder] = {};
        
        await this.saveCodeMarkerData(data);
    }
    
    // Config設定を更新
    async updateConfig(updates: Partial<CodeMarker['Config']>): Promise<void> {
        const data = await this.getCodeMarkerData();
        data.Config = { ...data.Config, ...updates };
        await this.saveCodeMarkerData(data);
    }
    
    // IDを生成
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    // LineHighlight関連のメソッド
    
    // LineHighlightを追加
    async addLineHighlight(
        folder: string,
        filePath: string,
        lineHighlight: CodeMarkerLineHighlight
    ): Promise<void> {
        const data = await this.getCodeMarkerData();
        
        // フォルダが無い場合は作成
        if (!data.CodeMarker[folder]) {
            data.CodeMarker[folder] = {};
        }
        
        // ファイルのエントリが無い場合は作成
        if (!data.CodeMarker[folder][filePath]) {
            data.CodeMarker[folder][filePath] = {
                Diagnostics: [],
                LineHighlight: [],
                SyntaxHighlight: null
            };
        }
        
        data.CodeMarker[folder][filePath].LineHighlight.push(lineHighlight);
        await this.saveCodeMarkerData(data);
    }
    
    // LineHighlightを削除
    async deleteLineHighlight(folder: string, filePath: string, id: string): Promise<boolean> {
        const data = await this.getCodeMarkerData();
        
        if (!data.CodeMarker[folder]?.[filePath]) {
            return false;
        }
        
        const initialLength = data.CodeMarker[folder][filePath].LineHighlight.length;
        data.CodeMarker[folder][filePath].LineHighlight = 
            data.CodeMarker[folder][filePath].LineHighlight.filter(h => h.id !== id);
        
        // ファイルのすべてのマーカーが空になった場合、ファイルエントリを削除
        const fileData = data.CodeMarker[folder][filePath];
        if (fileData.Diagnostics.length === 0 &&
            fileData.LineHighlight.length === 0 &&
            (!fileData.SyntaxHighlight || !fileData.SyntaxHighlight.Lines || fileData.SyntaxHighlight.Lines.length === 0)) {
            delete data.CodeMarker[folder][filePath];
            
            // フォルダが空になった場合、フォルダエントリを削除（デフォルトフォルダ以外）
            if (folder !== CodeMarkerStorage.DEFAULT_FOLDER && 
                Object.keys(data.CodeMarker[folder]).length === 0) {
                delete data.CodeMarker[folder];
            }
        }
        
        await this.saveCodeMarkerData(data);
        return initialLength !== (data.CodeMarker[folder]?.[filePath]?.LineHighlight.length || 0);
    }
    
    // 特定フォルダの特定ファイルのLineHighlightを取得
    async getLineHighlightsByFolderAndFile(folder: string, filePath: string): Promise<CodeMarkerLineHighlight[]> {
        const data = await this.getCodeMarkerData();
        return data.CodeMarker[folder]?.[filePath]?.LineHighlight || [];
    }
    
    // フォルダ内のLineHighlightを取得
    async getLineHighlightsByFolder(folder: string): Promise<{ filePath: string; highlights: CodeMarkerLineHighlight[] }[]> {
        const data = await this.getCodeMarkerData();
        const result: { filePath: string; highlights: CodeMarkerLineHighlight[] }[] = [];
        
        if (!data.CodeMarker[folder]) {
            return result;
        }
        
        for (const [filePath, fileData] of Object.entries(data.CodeMarker[folder])) {
            if (fileData.LineHighlight && fileData.LineHighlight.length > 0) {
                result.push({ filePath, highlights: fileData.LineHighlight });
            }
        }
        
        return result;
    }
    
    // 全てのLineHighlightを取得
    async getAllLineHighlights(): Promise<{ folder: string; filePath: string; highlights: CodeMarkerLineHighlight[] }[]> {
        const data = await this.getCodeMarkerData();
        const result: { folder: string; filePath: string; highlights: CodeMarkerLineHighlight[] }[] = [];
        
        for (const [folder, folderData] of Object.entries(data.CodeMarker)) {
            for (const [filePath, fileData] of Object.entries(folderData)) {
                if (fileData.LineHighlight && fileData.LineHighlight.length > 0) {
                    result.push({ folder, filePath, highlights: fileData.LineHighlight });
                }
            }
        }
        
        return result;
    }
    
    // SyntaxHighlight関連のメソッド
    
    // SyntaxHighlightを設定（ファイルに1つのみ）
    async setSyntaxHighlight(
        folder: string,
        filePath: string,
        syntaxHighlight: CodeMarkerSyntaxHighlight
    ): Promise<void> {
        const data = await this.getCodeMarkerData();
        
        // フォルダが無い場合は作成
        if (!data.CodeMarker[folder]) {
            data.CodeMarker[folder] = {};
        }
        
        // ファイルのエントリが無い場合は作成
        if (!data.CodeMarker[folder][filePath]) {
            data.CodeMarker[folder][filePath] = {
                Diagnostics: [],
                LineHighlight: [],
                SyntaxHighlight: null
            };
        }
        
        // ファイルに1つのSyntaxHighlightのみ設定
        data.CodeMarker[folder][filePath].SyntaxHighlight = syntaxHighlight;
        await this.saveCodeMarkerData(data);
    }
    
    // SyntaxHighlightを削除
    async deleteSyntaxHighlight(folder: string, filePath: string): Promise<boolean> {
        const data = await this.getCodeMarkerData();
        
        if (!data.CodeMarker[folder]?.[filePath]) {
            return false;
        }
        
        const syntaxHighlight = data.CodeMarker[folder][filePath].SyntaxHighlight;
        const hadSyntaxHighlight = syntaxHighlight !== null && 
                                   syntaxHighlight.Lines &&
                                   syntaxHighlight.Lines.length > 0;
        
        // SyntaxHighlightを削除
        data.CodeMarker[folder][filePath].SyntaxHighlight = null;
        
        // ファイルのすべてのマーカーが空になった場合、ファイルエントリを削除
        const fileData = data.CodeMarker[folder][filePath];
        if (fileData.Diagnostics.length === 0 &&
            fileData.LineHighlight.length === 0 &&
            (!fileData.SyntaxHighlight || !fileData.SyntaxHighlight.Lines || fileData.SyntaxHighlight.Lines.length === 0)) {
            delete data.CodeMarker[folder][filePath];
            
            // フォルダが空になった場合、フォルダエントリを削除（デフォルトフォルダ以外）
            if (folder !== CodeMarkerStorage.DEFAULT_FOLDER && 
                Object.keys(data.CodeMarker[folder]).length === 0) {
                delete data.CodeMarker[folder];
            }
        }
        
        await this.saveCodeMarkerData(data);
        return hadSyntaxHighlight;
    }
    
    // 特定フォルダの特定ファイルのSyntaxHighlightを取得
    async getSyntaxHighlightByFolderAndFile(folder: string, filePath: string): Promise<CodeMarkerSyntaxHighlight | null> {
        const data = await this.getCodeMarkerData();
        const syntaxHighlight = data.CodeMarker[folder]?.[filePath]?.SyntaxHighlight;
        
        if (syntaxHighlight && syntaxHighlight.Lines && syntaxHighlight.Lines.length > 0) {
            return syntaxHighlight;
        }
        
        return null;
    }
    
    // フォルダ内のSyntaxHighlightを取得
    async getSyntaxHighlightsByFolder(folder: string): Promise<{ filePath: string; syntaxHighlight: CodeMarkerSyntaxHighlight }[]> {
        const data = await this.getCodeMarkerData();
        const result: { filePath: string; syntaxHighlight: CodeMarkerSyntaxHighlight }[] = [];
        
        if (!data.CodeMarker[folder]) {
            return result;
        }
        
        for (const [filePath, fileData] of Object.entries(data.CodeMarker[folder])) {
            if (fileData.SyntaxHighlight && fileData.SyntaxHighlight.Lines && fileData.SyntaxHighlight.Lines.length > 0) {
                result.push({ filePath, syntaxHighlight: fileData.SyntaxHighlight });
            }
        }
        
        return result;
    }
    
    // 全てのSyntaxHighlightを取得
    async getAllSyntaxHighlights(): Promise<{ folder: string; filePath: string; syntaxHighlight: CodeMarkerSyntaxHighlight }[]> {
        const data = await this.getCodeMarkerData();
        const result: { folder: string; filePath: string; syntaxHighlight: CodeMarkerSyntaxHighlight }[] = [];
        
        for (const [folder, folderData] of Object.entries(data.CodeMarker)) {
            for (const [filePath, fileData] of Object.entries(folderData)) {
                if (fileData.SyntaxHighlight && fileData.SyntaxHighlight.Lines && fileData.SyntaxHighlight.Lines.length > 0) {
                    result.push({ folder, filePath, syntaxHighlight: fileData.SyntaxHighlight });
                }
            }
        }
        
        return result;
    }

    // ===========================================
    // ドラッグ&ドロップ用の移動メソッド
    // ===========================================

    // Diagnosticsを別のフォルダに移動
    async moveDiagnosticsToFolder(
        sourceFolder: string,
        filePath: string,
        id: string,
        targetFolder: string
    ): Promise<boolean> {
        const data = await this.getCodeMarkerData();

        // 元のDiagnosticsを取得
        if (!data.CodeMarker[sourceFolder]?.[filePath]) {
            return false;
        }

        const diagnosticsIndex = data.CodeMarker[sourceFolder][filePath].Diagnostics.findIndex(d => d.id === id);
        if (diagnosticsIndex === -1) {
            return false;
        }

        const diagnostics = data.CodeMarker[sourceFolder][filePath].Diagnostics[diagnosticsIndex];

        // ターゲットフォルダが存在しない場合は作成
        if (!data.CodeMarker[targetFolder]) {
            data.CodeMarker[targetFolder] = {};
        }

        // ターゲットフォルダのファイルエントリが無い場合は作成
        if (!data.CodeMarker[targetFolder][filePath]) {
            data.CodeMarker[targetFolder][filePath] = {
                Diagnostics: [],
                LineHighlight: [],
                SyntaxHighlight: null
            };
        }

        // 元のフォルダから削除
        data.CodeMarker[sourceFolder][filePath].Diagnostics.splice(diagnosticsIndex, 1);

        // ターゲットフォルダに追加
        data.CodeMarker[targetFolder][filePath].Diagnostics.push(diagnostics);

        // 元のフォルダのファイルが空になったら削除
        const sourceFileData = data.CodeMarker[sourceFolder][filePath];
        if (sourceFileData.Diagnostics.length === 0 &&
            sourceFileData.LineHighlight.length === 0 &&
            (!sourceFileData.SyntaxHighlight || !sourceFileData.SyntaxHighlight.Lines || sourceFileData.SyntaxHighlight.Lines.length === 0)) {
            delete data.CodeMarker[sourceFolder][filePath];

            // 元のフォルダが空になったら削除（デフォルトフォルダ以外）
            if (sourceFolder !== CodeMarkerStorage.DEFAULT_FOLDER &&
                Object.keys(data.CodeMarker[sourceFolder]).length === 0) {
                delete data.CodeMarker[sourceFolder];
            }
        }

        await this.saveCodeMarkerData(data);
        return true;
    }

    // LineHighlightを別のフォルダに移動
    async moveLineHighlightToFolder(
        sourceFolder: string,
        filePath: string,
        id: string,
        targetFolder: string
    ): Promise<boolean> {
        const data = await this.getCodeMarkerData();

        // 元のLineHighlightを取得
        if (!data.CodeMarker[sourceFolder]?.[filePath]) {
            return false;
        }

        const highlightIndex = data.CodeMarker[sourceFolder][filePath].LineHighlight.findIndex(h => h.id === id);
        if (highlightIndex === -1) {
            return false;
        }

        const highlight = data.CodeMarker[sourceFolder][filePath].LineHighlight[highlightIndex];

        // ターゲットフォルダが存在しない場合は作成
        if (!data.CodeMarker[targetFolder]) {
            data.CodeMarker[targetFolder] = {};
        }

        // ターゲットフォルダのファイルエントリが無い場合は作成
        if (!data.CodeMarker[targetFolder][filePath]) {
            data.CodeMarker[targetFolder][filePath] = {
                Diagnostics: [],
                LineHighlight: [],
                SyntaxHighlight: null
            };
        }

        // 元のフォルダから削除
        data.CodeMarker[sourceFolder][filePath].LineHighlight.splice(highlightIndex, 1);

        // ターゲットフォルダに追加
        data.CodeMarker[targetFolder][filePath].LineHighlight.push(highlight);

        // 元のフォルダのファイルが空になったら削除
        const sourceFileData = data.CodeMarker[sourceFolder][filePath];
        if (sourceFileData.Diagnostics.length === 0 &&
            sourceFileData.LineHighlight.length === 0 &&
            (!sourceFileData.SyntaxHighlight || !sourceFileData.SyntaxHighlight.Lines || sourceFileData.SyntaxHighlight.Lines.length === 0)) {
            delete data.CodeMarker[sourceFolder][filePath];

            // 元のフォルダが空になったら削除（デフォルトフォルダ以外）
            if (sourceFolder !== CodeMarkerStorage.DEFAULT_FOLDER &&
                Object.keys(data.CodeMarker[sourceFolder]).length === 0) {
                delete data.CodeMarker[sourceFolder];
            }
        }

        await this.saveCodeMarkerData(data);
        return true;
    }

    // SyntaxHighlightを別のフォルダに移動
    async moveSyntaxHighlightToFolder(
        sourceFolder: string,
        filePath: string,
        targetFolder: string
    ): Promise<boolean> {
        const data = await this.getCodeMarkerData();

        // 元のSyntaxHighlightを取得
        if (!data.CodeMarker[sourceFolder]?.[filePath]?.SyntaxHighlight) {
            return false;
        }

        const syntaxHighlight = data.CodeMarker[sourceFolder][filePath].SyntaxHighlight;
        if (!syntaxHighlight || !syntaxHighlight.Lines || syntaxHighlight.Lines.length === 0) {
            return false;
        }

        // ターゲットフォルダが存在しない場合は作成
        if (!data.CodeMarker[targetFolder]) {
            data.CodeMarker[targetFolder] = {};
        }

        // ターゲットフォルダのファイルエントリが無い場合は作成
        if (!data.CodeMarker[targetFolder][filePath]) {
            data.CodeMarker[targetFolder][filePath] = {
                Diagnostics: [],
                LineHighlight: [],
                SyntaxHighlight: null
            };
        }

        // 元のフォルダから削除
        data.CodeMarker[sourceFolder][filePath].SyntaxHighlight = null;

        // ターゲットフォルダに追加（上書き）
        data.CodeMarker[targetFolder][filePath].SyntaxHighlight = syntaxHighlight;

        // 元のフォルダのファイルが空になったら削除
        const sourceFileData = data.CodeMarker[sourceFolder][filePath];
        if (sourceFileData.Diagnostics.length === 0 &&
            sourceFileData.LineHighlight.length === 0 &&
            (!sourceFileData.SyntaxHighlight || !sourceFileData.SyntaxHighlight.Lines || sourceFileData.SyntaxHighlight.Lines.length === 0)) {
            delete data.CodeMarker[sourceFolder][filePath];

            // 元のフォルダが空になったら削除（デフォルトフォルダ以外）
            if (sourceFolder !== CodeMarkerStorage.DEFAULT_FOLDER &&
                Object.keys(data.CodeMarker[sourceFolder]).length === 0) {
                delete data.CodeMarker[sourceFolder];
            }
        }

        await this.saveCodeMarkerData(data);
        return true;
    }
}