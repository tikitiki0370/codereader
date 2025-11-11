import { StateController } from '../stateController';
import { BaseFolderStorage } from '../modules';

// =============================================================================
// PostIt モデル定義
// =============================================================================
// 
// ここにPostItのデータ構造を定義してください。
// 必要なインターフェースや型を自由に追加してください。
//
// =============================================================================

export interface PostIt {
    PostIts: {
        [folder: string]: PostItNote[]  // folder = ユーザー定義のカテゴリー（例: "Active", "Archive", "TODO", "Ideas"など）
    };
    Config: {
        debug: boolean;
        lastedFolder?: string; // 最後に利用(追加、作成)したフォルダ
    }
    Version: string;
}

export interface PostItNote {
    id: string;
    title: string;
    color: string;
    Lines: PostItLine[];
    ViewType: PostItViewType;
    createdAt: Date;
    updatedAt: Date;
}
export interface PostItLine {
    file: string;
    line: number;
    endLine: number;
    text: string;
}

export enum PostItViewType {
    Line = 'line',
    CodeLens = 'codelens',
}

// PostIt作成時の入力型（idと日付フィールドを除く）
export type CreatePostItNote = Omit<PostItNote, 'id' | 'createdAt' | 'updatedAt'>;

// PostIt更新時の入力型（idとcreatedAtを除く、全てoptional）
export type UpdatePostItNote = Partial<Omit<PostItNote, 'id' | 'createdAt'>>;


// =============================================================================
// PostIt ストレージクラス
// =============================================================================
// 
// モデル定義が完了したら、以下のコメントアウトを外して実装してください。
//
// =============================================================================

export class PostItStorage extends BaseFolderStorage<PostIt> {
    protected readonly TOOL_NAME = 'postIt';
    private static readonly CURRENT_VERSION = '1.0.0';
    protected readonly DEFAULT_FOLDER = 'Default';

    constructor(stateController: StateController) {
        super(stateController);
    }
    
    // PostItデータ全体を取得
    async getPostItData(): Promise<PostIt> {
        const data = await this.stateController.get(this.TOOL_NAME);
        if (!data) {
            // 初期データ構造を作成
            const initialData = {
                PostIts: {
                    [this.DEFAULT_FOLDER]: []  // デフォルトフォルダを作成
                },
                Config: {
                    debug: false
                },
                Version: PostItStorage.CURRENT_VERSION
            };

            // 初期データを保存
            await this.savePostItData(initialData);
            console.log('PostIt initial data created and saved');
            return initialData;
        }
        return data;
    }

    // PostItデータ全体を保存
    private async savePostItData(data: PostIt): Promise<void> {
        this.stateController.set(this.TOOL_NAME, data);
    }
    
    // 特定のフォルダのPostItNoteを取得
    async getNotesByFolder(folder: string): Promise<PostItNote[]> {
        const data = await this.getPostItData();
        return data.PostIts[folder] || [];
    }
    
    // 全てのPostItNoteを取得
    async getAllNotes(): Promise<PostItNote[]> {
        const data = await this.getPostItData();
        const allNotes: PostItNote[] = [];
        
        for (const notes of Object.values(data.PostIts)) {
            allNotes.push(...notes);
        }
        
        return allNotes;
    }
    
    // 全フォルダの全てのPostItNoteを取得
    async getAllNotesGroupedByFolder(): Promise<{ folder: string; notes: PostItNote[] }[]> {
        const data = await this.getPostItData();
        return Object.entries(data.PostIts).map(([folder, notes]) => ({
            folder,
            notes
        }));
    }


    // PostItNoteを別のフォルダに移動
    async moveNoteToFolder(noteId: string, targetFolder: string): Promise<boolean> {
        const data = await this.getPostItData();
        let noteToMove: PostItNote | null = null;
        let sourceFolder: string | null = null;
        
        // ノートを探す
        for (const [folder, notes] of Object.entries(data.PostIts)) {
            const noteIndex = notes.findIndex(n => n.id === noteId);
            if (noteIndex !== -1) {
                noteToMove = notes[noteIndex];
                sourceFolder = folder;
                data.PostIts[folder].splice(noteIndex, 1);
                break;
            }
        }
        
        if (!noteToMove || !sourceFolder) return false;
        
        // ターゲットフォルダが存在しない場合は作成
        if (!data.PostIts[targetFolder]) {
            data.PostIts[targetFolder] = [];
        }
        
        // ノートを移動
        data.PostIts[targetFolder].push(noteToMove);
        
        // 元のフォルダが空になったら削除（デフォルトフォルダと親フォルダが空でない場合のみ）
        if (data.PostIts[sourceFolder].length === 0 && sourceFolder !== this.DEFAULT_FOLDER) {
            // サブフォルダがあるかチェック
            const hasSubfolders = Object.keys(data.PostIts).some(f => 
                f !== sourceFolder && f.startsWith(sourceFolder + '/')
            );
            
            if (!hasSubfolders) {
                delete data.PostIts[sourceFolder];
            }
        }
        
        await this.savePostItData(data);
        return true;
    }
    
    // PostItNoteを追加（デフォルトフォルダに）
    async addNote(noteData: CreatePostItNote): Promise<PostItNote> {
        return this.addNoteToFolder(this.DEFAULT_FOLDER, noteData);
    }
    
    // PostItNoteを特定のフォルダに追加
    async addNoteToFolder(folder: string, noteData: CreatePostItNote): Promise<PostItNote> {
        const data = await this.getPostItData();
        
        // フォルダが存在しない場合は作成
        if (!data.PostIts[folder]) {
            data.PostIts[folder] = [];
        }
        
        const newNote: PostItNote = {
            ...noteData,
            id: Date.now().toString() + Math.random().toString(36).substring(2),
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        data.PostIts[folder].push(newNote);
        await this.savePostItData(data);
        return newNote;
    }
    
    // PostItNoteを更新
    async updateNote(id: string, updates: UpdatePostItNote): Promise<PostItNote | null> {
        const data = await this.getPostItData();
        
        // 全フォルダから該当するノートを探す
        for (const [folder, notes] of Object.entries(data.PostIts)) {
            const index = notes.findIndex(note => note.id === id);
            if (index !== -1) {
                const updatedNote: PostItNote = {
                    ...notes[index],
                    ...updates,
                    updatedAt: new Date()
                };
                
                data.PostIts[folder][index] = updatedNote;
                await this.savePostItData(data);
                return updatedNote;
            }
        }
        
        return null;
    }
    
    // PostItNoteを削除
    async deleteNote(id: string): Promise<boolean> {
        const data = await this.getPostItData();
        
        // 全フォルダから該当するノートを探して削除
        for (const [folder, notes] of Object.entries(data.PostIts)) {
            const initialLength = notes.length;
            data.PostIts[folder] = notes.filter(note => note.id !== id);
            
            if (data.PostIts[folder].length !== initialLength) {
                // 空になったフォルダは削除（デフォルトフォルダとサブフォルダを持つフォルダ以外）
                if (data.PostIts[folder].length === 0 && folder !== this.DEFAULT_FOLDER) {
                    const hasSubfolders = Object.keys(data.PostIts).some(f => 
                        f !== folder && f.startsWith(folder + '/')
                    );
                    
                    if (!hasSubfolders) {
                        delete data.PostIts[folder];
                    }
                }
                await this.savePostItData(data);
                return true;
            }
        }
        
        return false;
    }
    
    // IDでPostItNoteを取得
    async getNoteById(id: string): Promise<PostItNote | null> {
        const data = await this.getPostItData();
        
        for (const notes of Object.values(data.PostIts)) {
            const note = notes.find(n => n.id === id);
            if (note) return note;
        }
        
        return null;
    }
    
    // ファイルパスでPostItNoteを検索
    async getNotesByFile(filePath: string): Promise<PostItNote[]> {
        const data = await this.getPostItData();
        const results: PostItNote[] = [];
        
        for (const notes of Object.values(data.PostIts)) {
            const matchingNotes = notes.filter(note =>
                note.Lines.some(line => line.file === filePath)
            );
            results.push(...matchingNotes);
        }
        
        return results;
    }
    
    // タイトルでPostItNoteを検索
    async searchNotesByTitle(query: string): Promise<PostItNote[]> {
        const data = await this.getPostItData();
        const lowerQuery = query.toLowerCase();
        const results: PostItNote[] = [];
        
        for (const notes of Object.values(data.PostIts)) {
            const matchingNotes = notes.filter(note =>
                note.title.toLowerCase().includes(lowerQuery)
            );
            results.push(...matchingNotes);
        }
        
        return results;
    }
    
    // 設定を更新
    async updateConfig(config: Partial<PostIt['Config']>): Promise<void> {
        const data = await this.getPostItData();
        data.Config = { ...data.Config, ...config };
        await this.savePostItData(data);
    }
    
    // 設定を取得
    async getConfig(): Promise<PostIt['Config']> {
        const data = await this.getPostItData();
        return data.Config;
    }


    // PostItsを削除（Defaultフォルダのみ残す、Configは保持）
    async clearAllNotes(): Promise<void> {
        const data = await this.getPostItData();

        // PostItsを初期状態にリセット（Defaultフォルダのみ）
        data.PostIts = {
            [this.DEFAULT_FOLDER]: []
        };

        await this.savePostItData(data);
    }

    // ===========================================
    // BaseFolderStorage抽象メソッドの実装
    // ===========================================

    protected async getData(): Promise<PostIt> {
        return await this.getPostItData();
    }

    protected async saveData(data: PostIt): Promise<void> {
        await this.savePostItData(data);
    }

    protected getFolderObject(data: PostIt): Record<string, any> {
        return data.PostIts;
    }

    protected setFolderObject(data: PostIt, folders: Record<string, any>): void {
        data.PostIts = folders;
    }

    protected getLastedFolder(data: PostIt): string | undefined {
        return data.Config.lastedFolder;
    }

    protected setLastedFolder(data: PostIt, folder: string): void {
        data.Config.lastedFolder = folder;
    }

    async isFolderEmpty(folder: string): Promise<boolean> {
        const data = await this.getData();
        const notes = data.PostIts[folder];
        return !notes || notes.length === 0;
    }
}