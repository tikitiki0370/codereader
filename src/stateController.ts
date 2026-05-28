import * as vscode from 'vscode';

/**
 * After a self-write completes, suppress watcher events for this long to absorb
 * the filesystem echo. Covers the gap between `savingInProgress` being cleared
 * and the watcher event being delivered, and the mtime-resolution edge case
 * where two writes within the same second share an mtime.
 */
const SELF_WRITE_SUPPRESS_MS = 1500;

/**
 * Coalesce bursts of watcher events (atomic save's delete+create, rapid edits)
 * so subscribers see at most one onExternalChange per toolName per this window.
 */
const EXTERNAL_CHANGE_DEBOUNCE_MS = 100;

export class StateController {
    private static instance: StateController | null = null;
    private extensionStorageUri: vscode.Uri | undefined;
    private dataCache: Map<string, any> = new Map();
    private saveTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private savingInProgress: Set<string> = new Set();
    private deletingInProgress: Set<string> = new Set();
    private lastKnownMtime: Map<string, number> = new Map();
    /** Timestamp (ms) of the last self-write per toolName, for SELF_WRITE_SUPPRESS_MS. */
    private recentSelfWriteAt: Map<string, number> = new Map();
    /** Tracks toolNames for which a "corrupted JSON" notification has already been shown. */
    private notifiedCorruption: Set<string> = new Set();

    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private watcherStoragePath: string | undefined;
    private externalChangeDebounce: Map<string, NodeJS.Timeout> = new Map();
    private subscriptions: vscode.Disposable[] = [];
    private _onExternalChange = new vscode.EventEmitter<string>();
    /**
     * Fires with the toolName (e.g., "postIt") whenever the corresponding
     * `<storage>/<toolName>.json` is modified, created, or deleted by something
     * other than this extension. Cache + mtime are invalidated before the event fires,
     * so subscribers can call get(toolName) to obtain fresh data.
     */
    public readonly onExternalChange = this._onExternalChange.event;

    private _onStorageDirectoryCreated = new vscode.EventEmitter<vscode.Uri>();
    /**
     * Fires once when the storage directory (e.g., `.codereader/`) is created
     * by this extension's lazy init. Lets consumers like AgentDocsGenerator
     * run setup that depends on the directory existing.
     */
    public readonly onStorageDirectoryCreated = this._onStorageDirectoryCreated.event;

    private constructor(context: vscode.ExtensionContext) {
        this.extensionStorageUri = context.storageUri;
        this.ensureFileWatcher();

        // Recreate the watcher when storage location or workspace folders change
        this.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('codereader.storageLocation')) {
                    this.ensureFileWatcher();
                }
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.ensureFileWatcher();
            })
        );
    }

    /** True if the toolName is in any phase of an in-flight self-write. */
    private isSelfWriteInFlight(toolName: string): boolean {
        if (this.saveTimeouts.has(toolName)) {return true;}
        if (this.savingInProgress.has(toolName)) {return true;}
        if (this.deletingInProgress.has(toolName)) {return true;}
        const recentAt = this.recentSelfWriteAt.get(toolName);
        if (recentAt !== undefined && Date.now() - recentAt < SELF_WRITE_SUPPRESS_MS) {
            return true;
        }
        return false;
    }

    /**
     * Create (or recreate) the FileSystemWatcher for the current storage URI.
     * Detects external edits to `<storage>/*.json` and fires onExternalChange.
     */
    private ensureFileWatcher(): void {
        const storageUri = this.getStorageUriInternal();
        const newPath = storageUri?.fsPath;
        if (newPath === this.watcherStoragePath && this.fileWatcher) {
            return; // already watching the right place
        }

        this.fileWatcher?.dispose();
        this.fileWatcher = undefined;
        this.watcherStoragePath = undefined;

        if (!storageUri) {
            return;
        }

        const pattern = new vscode.RelativePattern(storageUri, '*.json');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        this.watcherStoragePath = newPath;

        const handleEvent = (uri: vscode.Uri, kind: 'change' | 'create' | 'delete') => {
            const toolName = this.toolNameFromUri(uri);
            if (!toolName) {return;}
            if (this.isSelfWriteInFlight(toolName)) {return;}

            const existing = this.externalChangeDebounce.get(toolName);
            if (existing) {clearTimeout(existing);}

            const timer = setTimeout(async () => {
                this.externalChangeDebounce.delete(toolName);

                // Re-check at firing time: a save() may have completed during the debounce window.
                if (this.isSelfWriteInFlight(toolName)) {return;}

                if (kind !== 'delete') {
                    // Final mtime check defends against the filesystem echoing back a write
                    // that completed just before debounce fired.
                    try {
                        const stat = await vscode.workspace.fs.stat(uri);
                        if (this.lastKnownMtime.get(toolName) === stat.mtime) {return;}
                    } catch {
                        // file vanished mid-debounce — fall through, treat as external delete
                    }
                }

                this.dataCache.delete(toolName);
                this.lastKnownMtime.delete(toolName);
                this._onExternalChange.fire(toolName);
            }, EXTERNAL_CHANGE_DEBOUNCE_MS);

            this.externalChangeDebounce.set(toolName, timer);
        };

        this.fileWatcher.onDidChange(uri => handleEvent(uri, 'change'));
        this.fileWatcher.onDidCreate(uri => handleEvent(uri, 'create'));
        this.fileWatcher.onDidDelete(uri => handleEvent(uri, 'delete'));
    }

    private toolNameFromUri(uri: vscode.Uri): string | undefined {
        const match = uri.path.match(/\/([^/]+)\.json$/);
        return match ? match[1] : undefined;
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

    /**
     * Check if current storage mode is workspace (not extension storage)
     * Used by AgentDocsGenerator to determine if docs should be generated
     */
    public isWorkspaceStorage(): boolean {
        const config = vscode.workspace.getConfiguration('codereader');
        const storageLocation = config.get<string>('storageLocation', 'workspace');
        const workspaceFolders = vscode.workspace.workspaceFolders;
        return storageLocation === 'workspace' && !!workspaceFolders && workspaceFolders.length > 0;
    }

    /**
     * Ensure storage directory exists (lazy initialization)
     * This is called automatically when saving data
     */
    private async ensureStorageDirectory(): Promise<void> {
        const storageUri = this.getStorageUriInternal();
        if (!storageUri) {
            throw new Error('No workspace storage available');
        }

        // Check if directory exists, create if not
        try {
            await vscode.workspace.fs.stat(storageUri);
        } catch {
            try {
                await vscode.workspace.fs.createDirectory(storageUri);
                this._onStorageDirectoryCreated.fire(storageUri);
            } catch (error) {
                console.error('Failed to create storage directory:', error);
                // If workspace storage fails, try extension storage as fallback
                if (storageUri !== this.extensionStorageUri && this.extensionStorageUri) {
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
            // 外部変更をチェック（保留中の保存がある場合はスキップ）
            if (await this.hasFileChangedExternally(toolName)) {
                return await this.load(toolName);
            }
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
        this.lastKnownMtime.delete(toolName);

        const storageUri = this.getStorageUriInternal();
        if (!storageUri) {return;}

        this.deletingInProgress.add(toolName);
        try {
            const filePath = vscode.Uri.joinPath(storageUri, `${toolName}.json`);
            await vscode.workspace.fs.delete(filePath);
            // Mark the deletion timestamp so the watcher's delete echo is suppressed
            this.recentSelfWriteAt.set(toolName, Date.now());
        } catch (error) {
            console.error(`Failed to delete ${toolName}.json:`, error);
        } finally {
            this.deletingInProgress.delete(toolName);
        }
    }

    // 利用可能なツール一覧を取得
    public async getAvailableTools(): Promise<string[]> {
        const storageUri = this.getStorageUriInternal();
        if (!storageUri) {return [];}

        try {
            const files = await vscode.workspace.fs.readDirectory(storageUri);
            return files
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.json'))
                .map(([name]) => name.replace('.json', ''));
        } catch (error) {
            return [];
        }
    }

    /**
     * JSONファイルが外部から変更されたかをmtimeでチェック
     * stat()はreadFile()+JSON.parse()よりも軽量なため効率的
     */
    private async hasFileChangedExternally(toolName: string): Promise<boolean> {
        // 保留中の保存または保存中の場合、メモリ上のデータが最新なのでスキップ
        if (this.saveTimeouts.has(toolName) || this.savingInProgress.has(toolName)) {
            return false;
        }

        const storageUri = this.getStorageUriInternal();
        if (!storageUri) {
            return false;
        }

        const filePath = vscode.Uri.joinPath(storageUri, `${toolName}.json`);
        try {
            const stat = await vscode.workspace.fs.stat(filePath);
            const lastMtime = this.lastKnownMtime.get(toolName);
            if (lastMtime !== undefined && stat.mtime !== lastMtime) {
                return true;
            }
            return false;
        } catch {
            // ファイルが存在しない場合、以前は存在していたなら外部変更とみなす
            if (this.lastKnownMtime.has(toolName)) {
                this.lastKnownMtime.delete(toolName);
                this.dataCache.delete(toolName);
                return true;
            }
            return false;
        }
    }

    // ツール固有ファイルからの読み込み
    private async load(toolName: string): Promise<any> {
        const storageUri = this.getStorageUriInternal();
        if (!storageUri) {return null;}

        const filePath = vscode.Uri.joinPath(storageUri, `${toolName}.json`);

        // stat: 「ファイルが存在しない」と「読み取り権限なし等の本物の失敗」を切り分ける。
        // 旧実装は両者+JSON parse 失敗をまとめて握り潰して null を返していたため、
        // 破損 JSON が「未作成」と解釈され、後続の save() で初期データに上書きされる
        // データロストパスがあった。
        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(filePath);
        } catch (error) {
            const code = (error as { code?: string })?.code;
            if (code === 'FileNotFound' || code === 'EntryNotFound') {
                return null;
            }
            console.error(`Failed to stat ${toolName}.json:`, error);
            throw error;
        }

        let jsonData: string;
        try {
            const fileData = await vscode.workspace.fs.readFile(filePath);
            jsonData = new TextDecoder().decode(fileData);
        } catch (error) {
            console.error(`Failed to read ${toolName}.json:`, error);
            throw error;
        }

        try {
            const data = JSON.parse(jsonData);
            this.dataCache.set(toolName, data);
            this.lastKnownMtime.set(toolName, stat.mtime);
            // 復旧したら次回の破損時に再通知できるよう notify フラグをリセット
            this.notifiedCorruption.delete(toolName);
            return data;
        } catch (error) {
            // 上書き保存を阻止するため throw する。caller (各 storage / extension activate) は
            // 既に try/catch を持っているのでユーザー向けの致命エラーにはならない。
            console.error(`Failed to parse ${toolName}.json (corrupted file):`, error);
            this.notifyCorruptedFileOnce(toolName, filePath);
            throw new Error(
                `${toolName}.json is corrupted and could not be parsed. ` +
                `Loading aborted to prevent overwriting your data with defaults. ` +
                `Please back up and fix or delete the file: ${filePath.fsPath}`
            );
        }
    }

    /** 破損 JSON の通知を toolName あたり 1 回に絞る */
    private notifyCorruptedFileOnce(toolName: string, filePath: vscode.Uri): void {
        if (this.notifiedCorruption.has(toolName)) {return;}
        this.notifiedCorruption.add(toolName);
        vscode.window.showErrorMessage(
            `CodeReader: ${toolName}.json is corrupted. ` +
            `Loading was aborted to prevent overwriting your data. ` +
            `Open ${filePath.fsPath} to inspect or fix it.`
        );
    }

    // ツール固有ファイルへの保存（デバウンス付き）
    private scheduleSave(toolName: string): void {
        const existingTimeout = this.saveTimeouts.get(toolName);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        const timeout = setTimeout(async () => {
            this.savingInProgress.add(toolName);
            this.saveTimeouts.delete(toolName);
            try {
                await this.save(toolName);
            } finally {
                this.savingInProgress.delete(toolName);
            }
        }, 500); // 500ms後に保存

        this.saveTimeouts.set(toolName, timeout);
    }

    // ツール固有の実際の保存処理
    private async save(toolName: string): Promise<void> {
        const storageUri = this.getStorageUriInternal();
        if (!storageUri) {return;}

        const data = this.dataCache.get(toolName);
        if (data === undefined) {return;}

        try {
            // Ensure storage directory exists before saving (lazy initialization)
            await this.ensureStorageDirectory();
            
            const filePath = vscode.Uri.joinPath(storageUri, `${toolName}.json`);
            const jsonData = JSON.stringify(data, null, 2);
            await vscode.workspace.fs.writeFile(filePath, new TextEncoder().encode(jsonData));

            // 保存後にmtimeを記録（自身の書き込みを外部変更と誤検知しないため）
            try {
                const stat = await vscode.workspace.fs.stat(filePath);
                this.lastKnownMtime.set(toolName, stat.mtime);
            } catch {
                // stat失敗時は前回のmtimeを維持し、次回の変更検知に利用する
            }

            // Stamp self-write time so any delayed watcher echo within the
            // suppress window is ignored even after savingInProgress is cleared.
            this.recentSelfWriteAt.set(toolName, Date.now());
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
        this.savingInProgress.add(toolName);
        try {
            await this.save(toolName);
        } finally {
            this.savingInProgress.delete(toolName);
        }
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
        this.lastKnownMtime.clear();
        this.savingInProgress.clear();
        this.deletingInProgress.clear();
        this.recentSelfWriteAt.clear();
        this.notifiedCorruption.clear();
        this.saveTimeouts.forEach(timeout => clearTimeout(timeout));
        this.saveTimeouts.clear();
        this.externalChangeDebounce.forEach(timeout => clearTimeout(timeout));
        this.externalChangeDebounce.clear();
        this.fileWatcher?.dispose();
        this.fileWatcher = undefined;
        this.watcherStoragePath = undefined;
        this.subscriptions.forEach(d => d.dispose());
        this.subscriptions = [];
        this._onExternalChange.dispose();
        this._onStorageDirectoryCreated.dispose();
    }

    public static async dispose(): Promise<void> {
        if (StateController.instance) {
            await StateController.instance.close();
            StateController.instance = null;
        }
    }
}