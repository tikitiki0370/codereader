import * as vscode from 'vscode';
import { PostItStorage, PostItNote } from './postItStorage';

/**
 * PostItの行番号を自動追跡するクラス
 * コード変更時にPostItの位置を自動的に更新する
 */
export class PostItLineTracker {
    private pendingUpdates: Set<string> = new Set(); // 更新が必要なPostIt ID
    private debounceTimer: NodeJS.Timeout | undefined;
    private readonly DEBOUNCE_MS = 300;
    private postItCache: Map<string, PostItNote[]> = new Map(); // ファイルパス -> PostIt（メモリ上で更新）

    constructor(
        private storage: PostItStorage,
        private onUpdate: () => void // 更新後のコールバック（CodeLensリフレッシュ用）
    ) {}

    /**
     * イベントリスナーを登録
     */
    register(): vscode.Disposable {
        return vscode.workspace.onDidChangeTextDocument(async (event) => {
            try {
                await this.handleDocumentChange(event);
            } catch (error) {
                console.error('PostItLineTracker: Failed to handle document change', error);
            }
        });
    }

    /**
     * ドキュメント変更イベントを処理
     * 行番号の調整は即座に行い、ストレージ保存はデバウンスする
     */
    private async handleDocumentChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
        // ファイル以外（出力チャンネルなど）は無視
        if (event.document.uri.scheme !== 'file') return;
        if (event.contentChanges.length === 0) return;

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(event.document.uri);
        const filePath = workspaceFolder
            ? vscode.workspace.asRelativePath(event.document.uri)
            : event.document.fileName;

        // キャッシュにない場合はストレージから取得
        if (!this.postItCache.has(filePath)) {
            const postIts = await this.storage.getNotesByFile(filePath);
            if (postIts.length === 0) return;
            this.postItCache.set(filePath, postIts);
        }

        const postIts = this.postItCache.get(filePath)!;
        if (postIts.length === 0) return;

        // 即座に行番号を調整（メモリ上）
        // contentChangesは後ろから前の順で来るため、そのまま処理してOK
        for (const change of event.contentChanges) {
            const changedIds = this.adjustLineNumbers(postIts, filePath, change);
            // 更新が必要なPostItのみを記録
            for (const id of changedIds) {
                this.pendingUpdates.add(id);
            }
        }

        // ストレージ保存はデバウンス
        if (this.pendingUpdates.size > 0) {
            this.scheduleSave();
        }
    }

    /**
     * ストレージ保存をスケジュール
     */
    private scheduleSave(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
            await this.savePendingUpdates();
        }, this.DEBOUNCE_MS);
    }

    /**
     * 更新をストレージに保存
     */
    private async savePendingUpdates(): Promise<void> {
        if (this.pendingUpdates.size === 0) return;

        const updatedIds = new Set(this.pendingUpdates);
        this.pendingUpdates.clear();

        // キャッシュからPostItを取得して保存
        for (const [, postIts] of this.postItCache) {
            for (const postIt of postIts) {
                if (updatedIds.has(postIt.id)) {
                    await this.storage.updateNote(postIt.id, { Lines: postIt.Lines });
                }
            }
        }

        // キャッシュをクリア（次回は最新データを取得）
        this.postItCache.clear();

        // UIを更新
        this.onUpdate();
    }

    /**
     * 行番号を調整
     * @returns 変更されたPostItのID配列
     */
    private adjustLineNumbers(
        postIts: PostItNote[],
        filePath: string,
        change: vscode.TextDocumentContentChangeEvent
    ): string[] {
        // 変更の開始行（0ベース）
        const changeStartLine = change.range.start.line;
        const changeEndLine = change.range.end.line;

        // 行の差分を計算
        const addedLines = (change.text.match(/\n/g) || []).length;
        const removedLines = changeEndLine - changeStartLine;
        const lineDelta = addedLines - removedLines;

        // 行数に変化がない場合はスキップ
        if (lineDelta === 0) return [];

        const changedIds: string[] = [];

        for (const postIt of postIts) {
            let postItChanged = false;

            for (const line of postIt.Lines) {
                if (line.file !== filePath) continue;

                // PostItの行番号は1ベース、変更位置は0ベース
                const postItStartLine0 = line.line - 1;
                const postItEndLine0 = line.endLine - 1;

                let lineChanged = false;
                if (lineDelta > 0) {
                    // 行が追加された場合
                    lineChanged = this.handleLineAddition(
                        line, changeStartLine, postItStartLine0, postItEndLine0, lineDelta
                    );
                } else {
                    // 行が削除された場合
                    lineChanged = this.handleLineDeletion(
                        line, changeStartLine, changeEndLine, postItStartLine0, postItEndLine0, lineDelta
                    );
                }

                if (lineChanged) {
                    postItChanged = true;
                }
            }

            if (postItChanged) {
                changedIds.push(postIt.id);
            }
        }

        return changedIds;
    }

    /**
     * 行追加時の処理
     */
    private handleLineAddition(
        line: { line: number; endLine: number },
        changeStartLine: number,
        postItStartLine0: number,
        postItEndLine0: number,
        lineDelta: number
    ): boolean {
        if (changeStartLine <= postItStartLine0) {
            // 変更がPostItより前または同じ行 → 全体をシフト
            line.line += lineDelta;
            line.endLine += lineDelta;
            return true;
        } else if (changeStartLine <= postItEndLine0) {
            // 変更がPostItの範囲内 → endLineのみシフト
            line.endLine += lineDelta;
            return true;
        }
        return false;
    }

    /**
     * 行削除時の処理
     */
    private handleLineDeletion(
        line: { line: number; endLine: number },
        changeStartLine: number,
        changeEndLine: number,
        postItStartLine0: number,
        postItEndLine0: number,
        lineDelta: number
    ): boolean {
        if (changeEndLine < postItStartLine0) {
            // 削除がPostItより前 → 全体をシフト
            line.line += lineDelta;
            line.endLine += lineDelta;
            return true;
        } else if (changeStartLine > postItEndLine0) {
            // 削除がPostItより後 → 影響なし
            return false;
        } else {
            // 削除がPostItと重なる → 複雑なケース
            return this.handleOverlappingDeletion(
                line, changeStartLine, changeEndLine, postItStartLine0, postItEndLine0
            );
        }
    }

    /**
     * PostItの範囲と重なる削除の処理
     */
    private handleOverlappingDeletion(
        line: { line: number; endLine: number },
        changeStartLine: number,
        changeEndLine: number,
        postItStartLine0: number,
        postItEndLine0: number
    ): boolean {
        if (changeStartLine <= postItStartLine0 && changeEndLine >= postItEndLine0) {
            // PostIt全体が削除範囲に含まれる → PostItを削除範囲の開始位置に移動
            line.line = Math.max(1, changeStartLine + 1);
            line.endLine = line.line;
            return true;
        } else if (changeStartLine <= postItStartLine0) {
            // PostItの開始部分が削除される
            const newStartLine = Math.max(1, changeStartLine + 1);
            // 削除終了行より後ろに残るPostItの行数
            const remainingLines = postItEndLine0 - changeEndLine;
            line.line = newStartLine;
            // endLine = startLine + 残り行数 - 1（ただし最低でもstartLineと同じ）
            line.endLine = Math.max(newStartLine, newStartLine + remainingLines - 1);
            return true;
        } else if (changeEndLine >= postItEndLine0) {
            // PostItの終了部分が削除される
            // changeStartLine（0ベース）は削除開始行の直前（1ベース）と同じ値
            line.endLine = Math.max(line.line, changeStartLine);
            return true;
        } else {
            // PostItの中間部分が削除される
            const deletedLines = changeEndLine - changeStartLine;
            line.endLine = Math.max(line.line, line.endLine - deletedLines);
            return true;
        }
    }

    /**
     * クリーンアップ
     */
    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.pendingUpdates.clear();
        this.postItCache.clear();
    }
}
