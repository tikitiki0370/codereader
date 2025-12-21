import { StateController } from '../stateController';
import { BaseFolderStorage } from '../modules';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

// =============================================================================
// QuickMemo モデル定義
// =============================================================================
// 
// ここにQuickMemoのデータ構造を定義してください。
// 必要なインターフェースや型を自由に追加してください。
//
// =============================================================================

export interface QuickMemo {
    QuickMemos: {
        [folder: string]: QuickMemoFile[]  // folder = ユーザー定義のカテゴリー（例: "Active", "Archive", "TODO", "Ideas"など）
    };
    Config: {
        debug: boolean;
        lastedFolder?: string; // 最後に利用(追加、作成)したフォルダ
    }
    Version: string;
}

export interface QuickMemoFile{
    id: string; // ユニークID
    title: string; // ファイル名として表示するもの
    file: string; // ExtensionContext.storageUriのmdファイルpath
    Lines: QuickMemoLine[]; // 関連付けられたワークスペースのファイルパス
    linkedLine?: QuickMemoLine; // メモ作成時に紐付けられた行
    createAt: Date; // 作成日時
    updateAt: Date; // 更新日時
}

export interface QuickMemoLine {
    file: string;
    line: number;
    endLine?: number;
    text: string;
}

// =============================================================================
// QuickMemo ストレージクラス
// =============================================================================
// 
// モデル定義が完了したら、以下のコメントアウトを外して実装してください。
//
// =============================================================================

export class QuickMemoStorage extends BaseFolderStorage<QuickMemo> {
    protected readonly TOOL_NAME = 'quickMemo';
    private static readonly CURRENT_VERSION = '1.0.0';
    protected readonly DEFAULT_FOLDER = 'General';

    constructor(stateController: StateController, private context: vscode.ExtensionContext) {
        super(stateController);
    }

    // Get storage URI from StateController
    private getStorageUri(): vscode.Uri | undefined {
        return this.stateController.getStorageUri();
    }

    /**
     * Ensure quickMemo subdirectory exists (lazy initialization)
     * This is called automatically when creating memo files
     */
    private async ensureQuickMemoDirectory(): Promise<void> {
        const storageUri = this.getStorageUri();
        if (storageUri) {
            const mdDir = vscode.Uri.joinPath(storageUri, 'quickMemo');
            try {
                await vscode.workspace.fs.stat(mdDir);
                console.log('QuickMemo directory exists:', mdDir.fsPath);
            } catch {
                try {
                    await vscode.workspace.fs.createDirectory(mdDir);
                    console.log('QuickMemo directory created:', mdDir.fsPath);
                } catch (e) {
                    console.error('Failed to create QuickMemo directory:', e);
                }
            }
        }
    }
    
    // 初期データ構造を作成（保存はしない）
    private createInitialData(): QuickMemo {
        return {
            QuickMemos: {
                [this.DEFAULT_FOLDER]: []
            },
            Config: {
                debug: false,
                lastedFolder: this.DEFAULT_FOLDER
            },
            Version: QuickMemoStorage.CURRENT_VERSION
        };
    }
    
    // QuickMemoデータ全体を取得
    async getQuickMemoData(): Promise<QuickMemo> {
        const data = await this.stateController.get(this.TOOL_NAME);
        if (!data) {
            // データが存在しない場合は初期データを返すが、保存はしない
            // 保存は実際にメモを作成する時に行われる
            return this.createInitialData();
        }
        return data as QuickMemo;
    }
    
    // 指定フォルダのメモ一覧を取得
    async getMemosByFolder(folderName: string): Promise<QuickMemoFile[]> {
        const data = await this.getQuickMemoData();
        return data.QuickMemos[folderName] || [];
    }
    
    // メモの追加（フォルダー指定）
    async addMemoToFolder(folderName: string, title: string, links: string[] = [], linkedLine?: QuickMemoLine): Promise<QuickMemoFile> {
        const data = await this.getQuickMemoData();

        if (!data.QuickMemos[folderName]) {
            await this.createFolder(folderName);
        }

        const id = randomUUID();
        const fileName = `${id}.md`;
        const now = new Date();

        const newMemo: QuickMemoFile = {
            id,
            title,
            file: fileName,
            Lines: [],
            linkedLine,
            createAt: now,
            updateAt: now
        };

        // mdファイルを作成（ディレクトリの遅延作成を含む）
        const storageUri = this.getStorageUri();
        if (storageUri) {
            await this.ensureQuickMemoDirectory();
            const mdPath = vscode.Uri.joinPath(storageUri, 'quickMemo', fileName);
            
            let content = `# ${title}\n\nCreated: ${now.toLocaleString()}\n`;
            
            if (linkedLine) {
                 // VSCode URI format: vscode://file/<absolute_path>:<line>:<column>
                 // Note: line is 1-based in link, but 0-based in internal data usually. VSCode API works with 1-based commonly in UI links. 
                 // However, internal storage usually keeps 0-based. Let's assume input line is 0-based, so +1 for display/link.
                 const linkLine = linkedLine.line + 1;
                 const fileUri = vscode.Uri.file(linkedLine.file);
                 const link = `vscode://file/${linkedLine.file}:${linkLine}:1`;
                 const relativePath = vscode.workspace.asRelativePath(linkedLine.file);
                 content += `Linked: [${relativePath}:${linkLine}](${link})\n`;
            }

            content += `\n`;

            await vscode.workspace.fs.writeFile(mdPath, Buffer.from(content, 'utf-8'));
        }

        data.QuickMemos[folderName].push(newMemo);
        await this.stateController.set(this.TOOL_NAME, data);

        return newMemo;
    }

    // メモの内容を取得
    async getMemoContent(memo: QuickMemoFile): Promise<string> {
        const storageUri = this.getStorageUri();
        if (!storageUri) {
            // throw new Error('Storage URI not available');
            return '';
        }

        const mdPath = vscode.Uri.joinPath(storageUri, 'quickMemo', memo.file);
        try {
            const content = await vscode.workspace.fs.readFile(mdPath);
            return Buffer.from(content).toString('utf-8');
        } catch {
            return '';
        }
    }

    // ファイルパスに紐づくメモを取得
    async getMemosByLinkedFile(filePath: string): Promise<QuickMemoFile[]> {
        const data = await this.getQuickMemoData();
        const results: QuickMemoFile[] = [];

        for (const memos of Object.values(data.QuickMemos)) {
            for (const memo of memos) {
                if (memo.linkedLine) {
                     // Normalize paths for comparison if needed, or stick to simple string check
                     // Using asRelativePath might be safer if filePath passed is relative/absolute handled consistently
                     // But assuming strict match or workspace-relative match based on design
                     
                     // Design says: "vscode.workspace.asRelativePath(memo.linkedLine.file) === filePath"
                     // The input `filePath` to this function usually comes from `vscode.workspace.asRelativePath`.
                     // Let's compare normalized absolute paths or check relative.
                     // Simpler: Check if memo.linkedLine.file (absolute) matches passed absolute path 
                     // OR if we pass relative path here.
                     // The design plan snippet showed `vscode.workspace.asRelativePath(memo.linkedLine.file) === filePath`
                     // implying `filePath` argument is relative.
                     // Let's try to handle both or assume standard.
                     // Let's implement more robust check:
                     if (memo.linkedLine.file === filePath) {
                        results.push(memo);
                     }
                }
            }
        }
        return results;
    }

    // IDでメモを検索
    async getMemoById(id: string): Promise<QuickMemoFile | null> {
        const data = await this.getQuickMemoData();

        for (const memos of Object.values(data.QuickMemos)) {
            const memo = memos.find(m => m.id === id);
            if (memo) return memo;
        }

        return null;
    }

    // メモの内容を更新
    async updateMemoContent(memo: QuickMemoFile, content: string): Promise<void> {
        const storageUri = this.getStorageUri();
        if (!storageUri) {
            throw new Error('Storage URI not available');
        }

        await this.ensureQuickMemoDirectory();
        const mdPath = vscode.Uri.joinPath(storageUri, 'quickMemo', memo.file);
        await vscode.workspace.fs.writeFile(mdPath, Buffer.from(content, 'utf-8'));

        // updateAtを更新
        const data = await this.getQuickMemoData();
        for (const folder in data.QuickMemos) {
            const index = data.QuickMemos[folder].findIndex(m => m.id === memo.id);
            if (index >= 0) {
                data.QuickMemos[folder][index].updateAt = new Date();
                await this.stateController.set(this.TOOL_NAME, data);
                break;
            }
        }
    }
    
    // 最新のメモを取得（作成or更新日時順）
    async getLatestMemo(): Promise<{ memo: QuickMemoFile, folder: string } | null> {
        const data = await this.getQuickMemoData();
        let latestMemo: QuickMemoFile | null = null;
        let latestFolder = '';
        let latestTime = new Date(0);
        
        for (const folder in data.QuickMemos) {
            for (const memo of data.QuickMemos[folder]) {
                const memoTime = new Date(memo.updateAt);
                if (memoTime > latestTime) {
                    latestTime = memoTime;
                    latestMemo = memo;
                    latestFolder = folder;
                }
            }
        }
        
        return latestMemo ? { memo: latestMemo, folder: latestFolder } : null;
    }
    
    // 設定の取得
    async getConfig(): Promise<QuickMemo['Config']> {
        const data = await this.getQuickMemoData();
        return data.Config;
    }
    
    // 設定の更新
    async updateConfig(config: Partial<QuickMemo['Config']>): Promise<void> {
        const data = await this.getQuickMemoData();
        data.Config = { ...data.Config, ...config };
        await this.stateController.set(this.TOOL_NAME, data);
    }
    
    // メモをVSCodeで開く
    async openMemo(memo: QuickMemoFile): Promise<void> {
        const storageUri = this.getStorageUri();
        if (!storageUri) {
            throw new Error('Storage URI not available');
        }

        const mdPath = vscode.Uri.joinPath(storageUri, 'quickMemo', memo.file);
        const doc = await vscode.workspace.openTextDocument(mdPath);
        await vscode.window.showTextDocument(doc);
    }

    // メモを削除
    async deleteMemo(memo: QuickMemoFile): Promise<boolean> {
        try {
            const data = await this.getQuickMemoData();
            let found = false;

            // 全フォルダーからメモを検索・削除
            for (const folder in data.QuickMemos) {
                const index = data.QuickMemos[folder].findIndex(m => m.id === memo.id);
                if (index >= 0) {
                    data.QuickMemos[folder].splice(index, 1);
                    found = true;
                    break;
                }
            }

            if (!found) {
                return false;
            }

            // データを保存
            await this.stateController.set(this.TOOL_NAME, data);

            // Markdownファイルを削除
            const storageUri = this.getStorageUri();
            if (storageUri) {
                const mdPath = vscode.Uri.joinPath(storageUri, 'quickMemo', memo.file);
                try {
                    await vscode.workspace.fs.delete(mdPath);
                } catch (error) {
                    console.warn('Failed to delete markdown file:', error);
                    // ファイル削除に失敗してもデータベースからは削除されているので続行
                }
            }

            return true;
        } catch (error) {
            console.error('Error deleting QuickMemo:', error);
            throw error;
        }
    }

    // メモを別のフォルダに移動（ドラッグ&ドロップ用）
    async moveMemoToFolder(memoId: string, targetFolder: string): Promise<boolean> {
        const data = await this.getQuickMemoData();
        let memoToMove: QuickMemoFile | null = null;
        let sourceFolder: string | null = null;

        // メモを探す
        for (const [folder, memos] of Object.entries(data.QuickMemos)) {
            const memoIndex = memos.findIndex(m => m.id === memoId);
            if (memoIndex !== -1) {
                memoToMove = memos[memoIndex];
                sourceFolder = folder;
                data.QuickMemos[folder].splice(memoIndex, 1);
                break;
            }
        }

        if (!memoToMove || !sourceFolder) {
            return false;
        }

        // ターゲットフォルダが存在しない場合は作成
        if (!data.QuickMemos[targetFolder]) {
            data.QuickMemos[targetFolder] = [];
        }

        // メモを移動
        data.QuickMemos[targetFolder].push(memoToMove);

        // 元のフォルダが空になったら削除（デフォルトフォルダと親フォルダが空でない場合のみ）
        if (data.QuickMemos[sourceFolder].length === 0 && sourceFolder !== this.DEFAULT_FOLDER) {
            // サブフォルダがあるかチェック
            const hasSubfolders = Object.keys(data.QuickMemos).some(f =>
                f !== sourceFolder && f.startsWith(sourceFolder + '/')
            );

            if (!hasSubfolders) {
                delete data.QuickMemos[sourceFolder];
            }
        }

        await this.stateController.set(this.TOOL_NAME, data);
        return true;
    }

    // ===========================================
    // BaseFolderStorage抽象メソッドの実装
    // ===========================================

    protected async getData(): Promise<QuickMemo> {
        return await this.getQuickMemoData();
    }

    protected async saveData(data: QuickMemo): Promise<void> {
        await this.stateController.set(this.TOOL_NAME, data);
    }

    protected getFolderObject(data: QuickMemo): Record<string, any> {
        return data.QuickMemos;
    }

    protected setFolderObject(data: QuickMemo, folders: Record<string, any>): void {
        data.QuickMemos = folders;
    }

    protected getLastedFolder(data: QuickMemo): string | undefined {
        return data.Config.lastedFolder;
    }

    protected setLastedFolder(data: QuickMemo, folder: string): void {
        data.Config.lastedFolder = folder;
    }

    async isFolderEmpty(folder: string): Promise<boolean> {
        const data = await this.getData();
        const memos = data.QuickMemos[folder];
        return !memos || memos.length === 0;
    }

    protected async beforeDeleteFolders(foldersToDelete: string[], data: QuickMemo): Promise<void> {
        // 各フォルダーのメモを削除（.mdファイルも削除）
        const storageUri = this.getStorageUri();
        for (const folder of foldersToDelete) {
            const memos = data.QuickMemos[folder];
            if (storageUri && memos) {
                for (const memo of memos) {
                    const mdPath = vscode.Uri.joinPath(storageUri, 'quickMemo', memo.file);
                    try {
                        await vscode.workspace.fs.delete(mdPath);
                    } catch (error) {
                        console.warn('Failed to delete markdown file:', error);
                    }
                }
            }
        }
    }
}