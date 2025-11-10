import * as vscode from 'vscode';
import { CodeMarkerStorage } from './codeMarkerStorage';
import { CodeMarkerLineHighlight, CodeMarkerLine } from './types';

/**
 * プリセットカラーの定義
 */
export const PRESET_COLORS = [
    { name: 'Yellow', color: 'rgba(255, 235, 59, 0.3)' },
    { name: 'Green', color: 'rgba(76, 175, 80, 0.3)' },
    { name: 'Blue', color: 'rgba(33, 150, 243, 0.3)' },
    { name: 'Red', color: 'rgba(244, 67, 54, 0.3)' },
    { name: 'Purple', color: 'rgba(156, 39, 176, 0.3)' }
];

/**
 * LineHighlight機能を管理するクラス
 */
export class LineHighlightManager {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private fileDecorations: Map<string, Map<string, vscode.DecorationOptions[]>> = new Map();

    constructor(
        private storage: CodeMarkerStorage,
        private context: vscode.ExtensionContext
    ) {
        this.initializeDecorationTypes();
        this.loadAndApplyAllHighlights();

        // エディタが変更されたときにハイライトを再適用
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.applyHighlightsToEditor(editor);
            }
        });

        // ドキュメントを開いたときにハイライトを適用
        vscode.workspace.onDidOpenTextDocument(document => {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
            if (editor) {
                this.applyHighlightsToEditor(editor);
            }
        });
    }

    /**
     * デコレーションタイプを初期化
     */
    private initializeDecorationTypes(): void {
        PRESET_COLORS.forEach(preset => {
            const decorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: preset.color,
                isWholeLine: true,
                overviewRulerColor: preset.color,
                overviewRulerLane: vscode.OverviewRulerLane.Right
            });
            this.decorationTypes.set(preset.color, decorationType);
            this.context.subscriptions.push(decorationType);
        });
    }

    /**
     * すべてのハイライトを読み込んで適用
     */
    private async loadAndApplyAllHighlights(): Promise<void> {
        const data = await this.storage.getData();
        if (!data.CodeMarker) return;

        // すべてのファイルのハイライトを収集
        Object.entries(data.CodeMarker).forEach(([folder, files]) => {
            Object.entries(files).forEach(([filePath, fileData]) => {
                if (fileData.LineHighlight && fileData.LineHighlight.length > 0) {
                    fileData.LineHighlight.forEach(highlight => {
                        this.addHighlightToCache(filePath, highlight);
                    });
                }
            });
        });

        // 現在開いているエディタに適用
        vscode.window.visibleTextEditors.forEach(editor => {
            this.applyHighlightsToEditor(editor);
        });
    }

    /**
     * ハイライトをキャッシュに追加
     */
    private addHighlightToCache(filePath: string, highlight: CodeMarkerLineHighlight): void {
        if (!this.fileDecorations.has(filePath)) {
            this.fileDecorations.set(filePath, new Map());
        }

        const fileDecorations = this.fileDecorations.get(filePath)!;
        const decorations: vscode.DecorationOptions[] = [];

        highlight.Lines.forEach(line => {
            for (let lineNum = line.startLine; lineNum <= line.endLine; lineNum++) {
                decorations.push({
                    range: new vscode.Range(lineNum - 1, 0, lineNum - 1, 0)
                });
            }
        });

        fileDecorations.set(highlight.id, decorations);
    }

    /**
     * エディタにハイライトを適用（表示順序を考慮）
     */
    private applyHighlightsToEditor(editor: vscode.TextEditor): void {
        // ファイルパスを相対パスで取得
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        const filePath = workspaceFolder
            ? vscode.workspace.asRelativePath(editor.document.uri)
            : editor.document.fileName;

        // 既存のデコレーションをクリア
        this.decorationTypes.forEach(decorationType => {
            editor.setDecorations(decorationType, []);
        });

        this.storage.getData().then(data => {
            if (!data.CodeMarker) return;

            // ファイルのすべてのハイライト情報を収集
            const allHighlights: (CodeMarkerLineHighlight & { folder: string })[] = [];
            
            Object.entries(data.CodeMarker).forEach(([folder, files]) => {
                const fileData = files[filePath];
                if (!fileData || !fileData.LineHighlight) return;

                fileData.LineHighlight.forEach(highlight => {
                    allHighlights.push({ ...highlight, folder });
                });
            });

            // 作成日時でソート（古いものから新しいものの順）
            allHighlights.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

            // 行ごとに最新のハイライト色を決定（後から作成されたものが優先）
            const lineColorMap = new Map<number, string>();
            
            allHighlights.forEach(highlight => {
                highlight.Lines.forEach(line => {
                    for (let lineNum = line.startLine; lineNum <= line.endLine; lineNum++) {
                        // 後から作成されたハイライトが前のものを上書き
                        lineColorMap.set(lineNum, highlight.color);
                    }
                });
            });

            // 色ごとにデコレーションをグループ化
            const colorDecorations = new Map<string, vscode.DecorationOptions[]>();
            
            lineColorMap.forEach((color, lineNum) => {
                if (!colorDecorations.has(color)) {
                    colorDecorations.set(color, []);
                }
                colorDecorations.get(color)!.push({
                    range: new vscode.Range(lineNum - 1, 0, lineNum - 1, 0)
                });
            });

            // 各色のデコレーションを適用
            colorDecorations.forEach((decorations, color) => {
                const decorationType = this.decorationTypes.get(color);
                if (decorationType) {
                    editor.setDecorations(decorationType, decorations);
                }
            });
        });
    }

    /**
     * ハイライトを追加
     */
    public async addHighlightToFolder(
        folderPath: string,
        filePath: string,
        color: string,
        startLine: number,
        endLine: number
    ): Promise<void> {
        // 新しいハイライトを追加（重複を内部的に許可）
        const newHighlight: CodeMarkerLineHighlight = {
            id: this.generateId(),
            color: color,
            Lines: [{
                startLine: startLine,
                endLine: endLine
            }],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await this.storage.addLineHighlight(folderPath, filePath, newHighlight);
        this.addHighlightToCache(filePath, newHighlight);

        // エディタに即座に反映
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            const editorFilePath = workspaceFolder
                ? vscode.workspace.asRelativePath(editor.document.uri)
                : editor.document.fileName;
            if (editorFilePath === filePath) {
                this.applyHighlightsToEditor(editor);
            }
        }
    }

    /**
     * ハイライトを削除
     */
    public async deleteHighlight(folderPath: string, filePath: string, highlightId: string): Promise<void> {
        await this.storage.deleteLineHighlight(folderPath, filePath, highlightId);
        
        // キャッシュから削除
        const fileDecorations = this.fileDecorations.get(filePath);
        if (fileDecorations) {
            fileDecorations.delete(highlightId);
        }

        // エディタに即座に反映
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            const editorFilePath = workspaceFolder
                ? vscode.workspace.asRelativePath(editor.document.uri)
                : editor.document.fileName;
            if (editorFilePath === filePath) {
                this.applyHighlightsToEditor(editor);
            }
        }
    }

    /**
     * すべてのハイライトをクリア
     */
    public async clearAllHighlights(): Promise<void> {
        // キャッシュをクリア
        this.fileDecorations.clear();

        // すべてのエディタからデコレーションを削除
        vscode.window.visibleTextEditors.forEach(editor => {
            this.decorationTypes.forEach(decorationType => {
                editor.setDecorations(decorationType, []);
            });
        });
    }

    /**
     * リフレッシュ（ストレージから再読み込み）
     */
    public async refresh(): Promise<void> {
        this.fileDecorations.clear();
        await this.loadAndApplyAllHighlights();
    }

    /**
     * IDを生成
     */
    private generateId(): string {
        return `highlight_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}