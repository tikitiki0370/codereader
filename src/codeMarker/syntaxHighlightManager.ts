import * as vscode from 'vscode';
import { CodeMarkerStorage } from './codeMarkerStorage';
import { CodeMarkerSyntaxHighlight } from './types';

/**
 * SyntaxHighlight機能を管理するクラス
 * シンタックスハイライトを上書きしてコードをグレーアウトする
 */
export class SyntaxHighlightManager {
    private greyoutDecorationType!: vscode.TextEditorDecorationType;
    private fileDecorations: Map<string, vscode.DecorationOptions[]> = new Map();

    constructor(
        private storage: CodeMarkerStorage,
        private context: vscode.ExtensionContext
    ) {
        this.initializeDecorationType();
        this.loadAndApplyAllSyntaxHighlights();

        // エディタが変更されたときにハイライトを再適用
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.applySyntaxHighlightToEditor(editor);
            }
        });

        // ドキュメントを開いたときにハイライトを適用
        vscode.workspace.onDidOpenTextDocument(document => {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
            if (editor) {
                this.applySyntaxHighlightToEditor(editor);
            }
        });
    }

    /**
     * グレーアウト用のデコレーションタイプを初期化
     */
    private initializeDecorationType(): void {
        this.greyoutDecorationType = vscode.window.createTextEditorDecorationType({
            color: 'rgba(128, 128, 128, 0.6)', // グレーアウト色
            opacity: '0.5',
            fontStyle: 'italic'
        });
        this.context.subscriptions.push(this.greyoutDecorationType);
    }

    /**
     * すべてのSyntaxHighlightを読み込んで適用
     */
    private async loadAndApplyAllSyntaxHighlights(): Promise<void> {
        const data = await this.storage.getData();
        if (!data.CodeMarker) return;

        // すべてのファイルのSyntaxHighlightを収集
        Object.entries(data.CodeMarker).forEach(([folder, files]) => {
            Object.entries(files).forEach(([filePath, fileData]) => {
                if (fileData.SyntaxHighlight) {
                    const sh = fileData.SyntaxHighlight;
                    if (sh && sh.Lines && sh.Lines.length > 0) {
                        this.addSyntaxHighlightToCache(filePath, sh);
                    }
                }
            });
        });

        // 現在開いているエディタに適用
        vscode.window.visibleTextEditors.forEach(editor => {
            this.applySyntaxHighlightToEditor(editor);
        });
    }

    /**
     * SyntaxHighlightをキャッシュに追加
     */
    private addSyntaxHighlightToCache(filePath: string, syntaxHighlight: CodeMarkerSyntaxHighlight): void {
        const decorations: vscode.DecorationOptions[] = [];

        syntaxHighlight.Lines.forEach(lineNum => {
            decorations.push({
                range: new vscode.Range(lineNum - 1, 0, lineNum - 1, Number.MAX_SAFE_INTEGER)
            });
        });

        this.fileDecorations.set(filePath, decorations);
    }

    /**
     * エディタにSyntaxHighlightを適用
     */
    private applySyntaxHighlightToEditor(editor: vscode.TextEditor): void {
        const filePath = editor.document.uri.fsPath;

        // 既存のデコレーションをクリア
        editor.setDecorations(this.greyoutDecorationType, []);

        this.storage.getData().then(data => {
            if (!data.CodeMarker) return;

            // ファイルのSyntaxHighlight情報を取得
            let syntaxHighlight: CodeMarkerSyntaxHighlight | null = null;
            
            Object.entries(data.CodeMarker).forEach(([folder, files]) => {
                const fileData = files[filePath];
                if (fileData && fileData.SyntaxHighlight) {
                    const sh = fileData.SyntaxHighlight;
                    if (sh && sh.Lines && sh.Lines.length > 0) {
                        syntaxHighlight = sh;
                    }
                }
            });

            if (!syntaxHighlight) return;

            // デコレーションを作成して適用
            const decorations: vscode.DecorationOptions[] = [];
            
            (syntaxHighlight as CodeMarkerSyntaxHighlight).Lines.forEach((lineNum: number) => {
                decorations.push({
                    range: new vscode.Range(lineNum - 1, 0, lineNum - 1, Number.MAX_SAFE_INTEGER)
                });
            });

            editor.setDecorations(this.greyoutDecorationType, decorations);
        });
    }

    /**
     * SyntaxHighlightを追加または更新（ファイルに1つのSyntaxHighlightで行を累積）
     */
    public async addLinesToSyntaxHighlight(
        folderPath: string,
        filePath: string,
        newLines: number[]
    ): Promise<void> {
        // 既存のSyntaxHighlightを取得
        const existingSyntaxHighlight = await this.getSyntaxHighlight(filePath);
        
        let updatedLines: number[];
        let syntaxHighlight: CodeMarkerSyntaxHighlight;
        
        if (existingSyntaxHighlight) {
            // 既存がある場合：既存の行番号と新しい行番号をマージ（重複排除）
            const combinedLines = [...existingSyntaxHighlight.Lines, ...newLines];
            updatedLines = [...new Set(combinedLines)].sort((a, b) => a - b);
            
            syntaxHighlight = {
                ...existingSyntaxHighlight,
                Lines: updatedLines,
                updatedAt: new Date()
            };
        } else {
            // 新規作成の場合
            updatedLines = [...new Set(newLines)].sort((a, b) => a - b);
            
            syntaxHighlight = {
                id: this.generateId(),
                color: 'greyout', // 固定値
                Lines: updatedLines,
                createdAt: new Date(),
                updatedAt: new Date()
            };
        }

        await this.storage.setSyntaxHighlight(folderPath, filePath, syntaxHighlight);
        this.addSyntaxHighlightToCache(filePath, syntaxHighlight);

        // エディタに即座に反映
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.fsPath === filePath) {
            this.applySyntaxHighlightToEditor(editor);
        }
    }

    /**
     * 特定の行をtoggle（追加/削除）
     */
    public async toggleLine(
        folderPath: string,
        filePath: string,
        lineNumber: number
    ): Promise<boolean> {
        // 既存のSyntaxHighlightを取得
        const existingSyntaxHighlight = await this.getSyntaxHighlight(filePath);
        
        let isAdded = false;
        let syntaxHighlight: CodeMarkerSyntaxHighlight;
        
        if (existingSyntaxHighlight) {
            // 既存がある場合：行の存在を確認してtoggle
            const currentLines = [...existingSyntaxHighlight.Lines];
            const lineIndex = currentLines.indexOf(lineNumber);
            
            if (lineIndex > -1) {
                // 行が存在する場合は削除
                currentLines.splice(lineIndex, 1);
                isAdded = false;
            } else {
                // 行が存在しない場合は追加
                currentLines.push(lineNumber);
                isAdded = true;
            }
            
            const updatedLines = currentLines.sort((a, b) => a - b);
            
            if (updatedLines.length === 0) {
                // 全ての行が削除された場合はSyntaxHighlight自体を削除
                await this.deleteSyntaxHighlight(folderPath, filePath);
                return false;
            } else {
                syntaxHighlight = {
                    ...existingSyntaxHighlight,
                    Lines: updatedLines,
                    updatedAt: new Date()
                };
            }
        } else {
            // 新規作成の場合
            syntaxHighlight = {
                id: this.generateId(),
                color: 'greyout',
                Lines: [lineNumber],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            isAdded = true;
        }

        await this.storage.setSyntaxHighlight(folderPath, filePath, syntaxHighlight);
        this.addSyntaxHighlightToCache(filePath, syntaxHighlight);

        // エディタに即座に反映
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.fsPath === filePath) {
            this.applySyntaxHighlightToEditor(editor);
        }
        
        return isAdded;
    }

    /**
     * SyntaxHighlightを削除
     */
    public async deleteSyntaxHighlight(folderPath: string, filePath: string): Promise<void> {
        await this.storage.deleteSyntaxHighlight(folderPath, filePath);
        
        // キャッシュから削除
        this.fileDecorations.delete(filePath);

        // エディタに即座に反映
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.fsPath === filePath) {
            this.applySyntaxHighlightToEditor(editor);
        }
    }

    /**
     * すべてのSyntaxHighlightをクリア
     */
    public async clearAllSyntaxHighlights(): Promise<void> {
        // キャッシュをクリア
        this.fileDecorations.clear();

        // すべてのエディタからデコレーションを削除
        vscode.window.visibleTextEditors.forEach(editor => {
            editor.setDecorations(this.greyoutDecorationType, []);
        });
    }

    /**
     * リフレッシュ（ストレージから再読み込み）
     */
    public async refresh(): Promise<void> {
        this.fileDecorations.clear();
        await this.loadAndApplyAllSyntaxHighlights();
    }

    /**
     * 指定されたファイルのSyntaxHighlightを取得
     */
    public async getSyntaxHighlight(filePath: string): Promise<CodeMarkerSyntaxHighlight | null> {
        const data = await this.storage.getData();
        if (!data.CodeMarker) return null;

        for (const [folder, files] of Object.entries(data.CodeMarker)) {
            const fileData = files[filePath];
            if (fileData && fileData.SyntaxHighlight) {
                const sh = fileData.SyntaxHighlight;
                if (sh && sh.Lines && sh.Lines.length > 0) {
                    return sh;
                }
            }
        }

        return null;
    }

    /**
     * IDを生成
     */
    private generateId(): string {
        return `syntax_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}