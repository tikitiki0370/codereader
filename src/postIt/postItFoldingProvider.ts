import * as vscode from 'vscode';
import { PostItStorage } from './postItStorage';

export class PostItFoldingProvider implements vscode.FoldingRangeProvider {
    private _onDidChangeFoldingRanges: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeFoldingRanges: vscode.Event<void> = this._onDidChangeFoldingRanges.event;

    constructor(private postItStorage: PostItStorage) {}

    refresh(): void {
        this._onDidChangeFoldingRanges.fire();
    }

    async provideFoldingRanges(document: vscode.TextDocument): Promise<vscode.FoldingRange[]> {
        const foldingRanges: vscode.FoldingRange[] = [];

        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            const filePath = workspaceFolder 
                ? vscode.workspace.asRelativePath(document.uri)
                : document.fileName;

            const postIts = await this.postItStorage.getNotesByFile(filePath);

            for (const postIt of postIts) {
                const firstLine = postIt.Lines[0];
                let startLine = firstLine.line - 1; // 1ベースから0ベースに変換
                let endLine = firstLine.endLine - 1; // 1ベースから0ベースに変換

                // 末尾空白行の自動調整
                while (endLine > startLine && document.lineAt(endLine).text.trim() === '') {
                    endLine--;
                }

                // 有効な範囲かチェック（最低2行以上）
                if (startLine >= 0 && endLine > startLine && endLine < document.lineCount) {
                    foldingRanges.push(new vscode.FoldingRange(
                        startLine, 
                        endLine, 
                        vscode.FoldingRangeKind.Region
                    ));
                    console.log(`Added PostIt FoldingRange: ${postIt.title}, lines ${startLine + 1}-${endLine + 1}`);
                }
            }
        } catch (error) {
            console.error('Failed to provide PostIt folding ranges:', error);
        }

        return foldingRanges;
    }
}