import { StateController } from '../stateController';
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
    links: string[] // 関連付けられたワークスペースのファイルパス
    createAt: Date; // 作成日時
    updateAt: Date; // 更新日時
}

// =============================================================================
// QuickMemo ストレージクラス
// =============================================================================
// 
// モデル定義が完了したら、以下のコメントアウトを外して実装してください。
//
// =============================================================================

export class QuickMemoStorage {
    private static readonly TOOL_NAME = 'quickMemo';
    private static readonly CURRENT_VERSION = '1.0.0';
    private static readonly DEFAULT_FOLDER = 'General';

    constructor(private stateController: StateController, private context: vscode.ExtensionContext) {}

    // Get storage URI from StateController
    private getStorageUri(): vscode.Uri | undefined {
        return this.stateController.getStorageUri();
    }

    // 初期化
    async initialize(): Promise<void> {
        const data = await this.stateController.get(QuickMemoStorage.TOOL_NAME);
        if (!data || !data.Version) {
            await this.initializeData();
        }

        // mdファイル用のディレクトリを作成
        const storageUri = this.getStorageUri();
        if (storageUri) {
            const mdDir = vscode.Uri.joinPath(storageUri, 'quickMemo');
            try {
                await vscode.workspace.fs.createDirectory(mdDir);
                console.log('QuickMemo directory created:', mdDir.fsPath);
            } catch (e) {
                // ディレクトリが既に存在する場合は無視
            }
        }
    }
    
    // データの初期化
    private async initializeData(): Promise<void> {
        const initialData: QuickMemo = {
            QuickMemos: {
                [QuickMemoStorage.DEFAULT_FOLDER]: []
            },
            Config: {
                debug: false,
                lastedFolder: QuickMemoStorage.DEFAULT_FOLDER
            },
            Version: QuickMemoStorage.CURRENT_VERSION
        };
        
        await this.stateController.set(QuickMemoStorage.TOOL_NAME, initialData);
    }
    
    // QuickMemoデータ全体を取得
    async getQuickMemoData(): Promise<QuickMemo> {
        const data = await this.stateController.get(QuickMemoStorage.TOOL_NAME);
        if (!data) {
            await this.initializeData();
            return await this.stateController.get(QuickMemoStorage.TOOL_NAME) as QuickMemo;
        }
        return data as QuickMemo;
    }
    
    // フォルダー作成
    async createFolder(folderName: string): Promise<boolean> {
        const data = await this.getQuickMemoData();
        
        if (data.QuickMemos[folderName]) {
            return false; // 既に存在
        }
        
        data.QuickMemos[folderName] = [];
        await this.stateController.set(QuickMemoStorage.TOOL_NAME, data);
        return true;
    }
    
    // フォルダー一覧取得
    async getFolders(): Promise<string[]> {
        const data = await this.getQuickMemoData();
        return Object.keys(data.QuickMemos).sort();
    }
    
    // 指定フォルダのメモ一覧を取得
    async getMemosByFolder(folderName: string): Promise<QuickMemoFile[]> {
        const data = await this.getQuickMemoData();
        return data.QuickMemos[folderName] || [];
    }
    
    // メモの追加（フォルダー指定）
    async addMemoToFolder(folderName: string, title: string, links: string[] = []): Promise<QuickMemoFile> {
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
            links,
            createAt: now,
            updateAt: now
        };

        // mdファイルを作成
        const storageUri = this.getStorageUri();
        if (storageUri) {
            const mdPath = vscode.Uri.joinPath(storageUri, 'quickMemo', fileName);
            const content = `# ${title}\n\nCreated: ${now.toLocaleString()}\n\n`;
            await vscode.workspace.fs.writeFile(mdPath, Buffer.from(content, 'utf-8'));
        }

        data.QuickMemos[folderName].push(newMemo);
        await this.stateController.set(QuickMemoStorage.TOOL_NAME, data);

        return newMemo;
    }

    // メモの内容を取得
    async getMemoContent(memo: QuickMemoFile): Promise<string> {
        const storageUri = this.getStorageUri();
        if (!storageUri) {
            throw new Error('Storage URI not available');
        }

        const mdPath = vscode.Uri.joinPath(storageUri, 'quickMemo', memo.file);
        const content = await vscode.workspace.fs.readFile(mdPath);
        return Buffer.from(content).toString('utf-8');
    }

    // メモの内容を更新
    async updateMemoContent(memo: QuickMemoFile, content: string): Promise<void> {
        const storageUri = this.getStorageUri();
        if (!storageUri) {
            throw new Error('Storage URI not available');
        }

        const mdPath = vscode.Uri.joinPath(storageUri, 'quickMemo', memo.file);
        await vscode.workspace.fs.writeFile(mdPath, Buffer.from(content, 'utf-8'));

        // updateAtを更新
        const data = await this.getQuickMemoData();
        for (const folder in data.QuickMemos) {
            const index = data.QuickMemos[folder].findIndex(m => m.id === memo.id);
            if (index >= 0) {
                data.QuickMemos[folder][index].updateAt = new Date();
                await this.stateController.set(QuickMemoStorage.TOOL_NAME, data);
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
        await this.stateController.set(QuickMemoStorage.TOOL_NAME, data);
    }
    
    // 有効な最後使用フォルダを取得（存在しない場合はDefaultを返す）
    async getValidLastedFolder(): Promise<string> {
        const config = await this.getConfig();
        const lastedFolder = config.lastedFolder;
        
        if (!lastedFolder) {
            return QuickMemoStorage.DEFAULT_FOLDER;
        }
        
        // フォルダが存在するかチェック
        const data = await this.getQuickMemoData();
        if (data.QuickMemos[lastedFolder]) {
            return lastedFolder;
        }
        
        // 存在しない場合はDefaultに設定を更新して返す
        await this.updateConfig({ lastedFolder: QuickMemoStorage.DEFAULT_FOLDER });
        return QuickMemoStorage.DEFAULT_FOLDER;
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
            await this.stateController.set(QuickMemoStorage.TOOL_NAME, data);

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
}