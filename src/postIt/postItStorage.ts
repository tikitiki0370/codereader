import { StateController } from '../stateController';

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

export class PostItStorage {
    private static readonly TOOL_NAME = 'postIt';
    private static readonly CURRENT_VERSION = '1.0.0';
    
    constructor(private stateController: StateController) {}
    
    // デフォルトのフォルダ名
    static readonly DEFAULT_FOLDER = 'Default';
    
    // PostItデータ全体を取得
    async getPostItData(): Promise<PostIt> {
        const data = await this.stateController.get(PostItStorage.TOOL_NAME);
        if (!data) {
            // 初期データ構造を作成
            const initialData = {
                PostIts: {
                    [PostItStorage.DEFAULT_FOLDER]: []  // デフォルトフォルダを作成
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
        this.stateController.set(PostItStorage.TOOL_NAME, data);
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
    
    // フォルダ一覧を取得
    async getFolders(): Promise<string[]> {
        console.log('PostItStorage.getFolders called');
        try {
            const data = await this.getPostItData();
            console.log('PostIt data:', data);
            const folders = Object.keys(data.PostIts);
            console.log('PostIt folders from storage:', folders);
            return folders;
        } catch (error) {
            console.error('PostItStorage.getFolders error:', error);
            throw error;
        }
    }
    
    // フォルダツリーを取得（階層構造として）
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
    
    // フォルダを作成（親フォルダも自動作成）
    async createFolder(folderPath: string): Promise<boolean> {
        const data = await this.getPostItData();
        if (data.PostIts[folderPath]) {
            return false; // 既に存在
        }
        
        // 親フォルダも作成
        const parts = folderPath.split('/');
        for (let i = 1; i <= parts.length; i++) {
            const subPath = parts.slice(0, i).join('/');
            if (!data.PostIts[subPath]) {
                data.PostIts[subPath] = [];
            }
        }
        
        await this.savePostItData(data);
        return true;
    }
    
    // サブフォルダを取得
    async getSubfolders(parentFolder: string): Promise<string[]> {
        const folders = await this.getFolders();
        const prefix = parentFolder + '/';
        return folders.filter(f => 
            f.startsWith(prefix) && 
            f.substring(prefix.length).indexOf('/') === -1
        );
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
        if (data.PostIts[sourceFolder].length === 0 && sourceFolder !== PostItStorage.DEFAULT_FOLDER) {
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
        return this.addNoteToFolder(PostItStorage.DEFAULT_FOLDER, noteData);
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
                if (data.PostIts[folder].length === 0 && folder !== PostItStorage.DEFAULT_FOLDER) {
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
    
    // 有効な最後使用フォルダを取得（存在しない場合はDefaultを返す）
    async getValidLastedFolder(): Promise<string> {
        const config = await this.getConfig();
        const lastedFolder = config.lastedFolder;
        
        if (!lastedFolder) {
            return PostItStorage.DEFAULT_FOLDER;
        }
        
        // フォルダが存在するかチェック
        const data = await this.getPostItData();
        if (data.PostIts[lastedFolder]) {
            return lastedFolder;
        }
        
        // 存在しない場合はDefaultに設定を更新して返す
        await this.updateConfig({ lastedFolder: PostItStorage.DEFAULT_FOLDER });
        return PostItStorage.DEFAULT_FOLDER;
    }
    
    // PostItsを削除（Defaultフォルダのみ残す、Configは保持）
    async clearAllNotes(): Promise<void> {
        const data = await this.getPostItData();
        
        // PostItsを初期状態にリセット（Defaultフォルダのみ）
        data.PostIts = {
            [PostItStorage.DEFAULT_FOLDER]: []
        };
        
        await this.savePostItData(data);
    }

    // フォルダをリネーム
    async renameFolder(oldPath: string, newPath: string): Promise<boolean> {
        const data = await this.getPostItData();
        
        // 新しいフォルダパスが既に存在するかチェック
        if (data.PostIts[newPath]) {
            return false; // 既に存在
        }
        
        // デフォルトフォルダはリネーム不可
        if (oldPath === PostItStorage.DEFAULT_FOLDER) {
            return false;
        }
        
        // 対象フォルダが存在するかチェック
        if (!data.PostIts[oldPath]) {
            return false;
        }
        
        // フォルダをリネーム（PostItを移動）
        data.PostIts[newPath] = data.PostIts[oldPath];
        delete data.PostIts[oldPath];
        
        // サブフォルダもリネーム
        const oldPrefix = oldPath + '/';
        const newPrefix = newPath + '/';
        const subfolders = Object.keys(data.PostIts).filter(f => f.startsWith(oldPrefix));
        
        for (const subfolder of subfolders) {
            const newSubfolder = subfolder.replace(oldPrefix, newPrefix);
            data.PostIts[newSubfolder] = data.PostIts[subfolder];
            delete data.PostIts[subfolder];
        }
        
        // 設定のlastedFolderも更新
        if (data.Config.lastedFolder === oldPath) {
            data.Config.lastedFolder = newPath;
        } else if (data.Config.lastedFolder?.startsWith(oldPrefix)) {
            data.Config.lastedFolder = data.Config.lastedFolder.replace(oldPrefix, newPrefix);
        }
        
        await this.savePostItData(data);
        return true;
    }

    /**
     * フォルダを削除
     * デフォルトフォルダは削除不可
     */
    async deleteFolder(folderPath: string): Promise<boolean> {
        if (folderPath === PostItStorage.DEFAULT_FOLDER) {
            return false; // デフォルトフォルダは削除不可
        }
        
        const data = await this.getPostItData();
        
        if (!data.PostIts[folderPath]) {
            return false; // フォルダが存在しない
        }
        
        // フォルダを削除
        delete data.PostIts[folderPath];
        
        // サブフォルダも削除
        const prefix = folderPath + '/';
        const subfolders = Object.keys(data.PostIts).filter(f => f.startsWith(prefix));
        
        for (const subfolder of subfolders) {
            delete data.PostIts[subfolder];
        }
        
        // 最後に使用したフォルダの更新
        if (data.Config.lastedFolder === folderPath) {
            data.Config.lastedFolder = PostItStorage.DEFAULT_FOLDER;
        } else if (data.Config.lastedFolder?.startsWith(prefix)) {
            data.Config.lastedFolder = PostItStorage.DEFAULT_FOLDER;
        }
        
        await this.savePostItData(data);
        return true;
    }
}