import * as vscode from 'vscode';
import { PostItStorage } from './postItStorage';

export class PostItCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(private postItStorage: PostItStorage) {}

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];

        try {
            // 現在のファイルに関連するPostItを取得
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            const filePath = workspaceFolder 
                ? vscode.workspace.asRelativePath(document.uri)
                : document.fileName;

            const postIts = await this.postItStorage.getNotesByFile(filePath);

            for (const postIt of postIts) {
                // ViewTypeがCodeLensの場合のみCodeLensを表示
                if (postIt.ViewType === 'codelens') {
                    const firstLine = postIt.Lines[0];
                    const startLine = firstLine.line - 1; // 1ベースから0ベースに変換
                    const endLine = firstLine.endLine - 1; // 1ベースから0ベースに変換
                    
                    // 折りたたみ可能な範囲（2行以上）の場合のみCodeLensを表示
                    if (endLine > startLine && endLine < document.lineCount) {
                        const range = new vscode.Range(startLine, 0, startLine, 0);
                        
                        const codeLens = new vscode.CodeLens(range, {
                            title: `📝 ${postIt.title} [Click to toggle fold]`,
                            command: 'codereader.togglePostItFold',
                            arguments: [postIt, document.uri]
                        });
                        
                        codeLenses.push(codeLens);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to provide CodeLenses:', error);
        }

        return codeLenses;
    }
}