import * as vscode from 'vscode';
import { PostItStorage, PostItViewType } from './postItStorage';
import { PostItManager } from './postIt';

/**
 * PostIt機能のコマンド処理を管理するクラス
 */
export class PostItCommandProvider {
    private foldedPostIts = new Map<string, boolean>();

    constructor(
        private storage: PostItStorage,
        private manager: PostItManager,
        private postItDecorationType: vscode.TextEditorDecorationType,
        private context: vscode.ExtensionContext
    ) {}

    /**
     * PostIt関連のコマンドを登録
     */
    registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('codereader.createPostIt', this.createPostIt.bind(this)),
            vscode.commands.registerCommand('codereader.createPostItWithTitle', this.createPostItWithTitle.bind(this)),
            vscode.commands.registerCommand('codereader.createPostItAtLine', this.createPostItAtLine.bind(this)),
            vscode.commands.registerCommand('codereader.clearAllPostIts', this.clearAllPostIts.bind(this)),
            vscode.commands.registerCommand('codereader.changePostItTitle', this.changePostItTitle.bind(this)),
            vscode.commands.registerCommand('codereader.createFolder', this.createFolder.bind(this)),
            vscode.commands.registerCommand('codereader.createSubFolder', this.createSubFolder.bind(this)),
            vscode.commands.registerCommand('codereader.renameFolder', this.renameFolder.bind(this)),
            vscode.commands.registerCommand('codereader.deletePostIt', this.deletePostIt.bind(this)),
            vscode.commands.registerCommand('codereader.togglePostItFold', this.togglePostItFold.bind(this)),
            vscode.commands.registerCommand('codereader.openPostItLocation', this.openPostItLocation.bind(this))
        ];
    }

    /**
     * PostIt gutter decorationを更新
     */
    async updatePostItDecorations(editor?: vscode.TextEditor): Promise<void> {
        if (!editor) {
            editor = vscode.window.activeTextEditor;
        }
        
        if (!editor) {
            return;
        }

        try {
            // 現在のファイルに関連するPostItを取得
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            const filePath = workspaceFolder 
                ? vscode.workspace.asRelativePath(editor.document.uri)
                : editor.document.fileName;

            const postIts = await this.storage.getNotesByFile(filePath);
            
            // PostItがある行のdecorationを作成
            const decorationRanges: vscode.Range[] = postIts.map(postIt => {
                const line = postIt.Lines[0].line - 1; // 1ベースから0ベースに変換（最初の行を使用）
                return new vscode.Range(
                    new vscode.Position(line, 0),
                    new vscode.Position(line, 0)
                );
            });

            // decorationを適用
            editor.setDecorations(this.postItDecorationType, decorationRanges);
            
            console.log(`Updated PostIt decorations for ${filePath}: ${decorationRanges.length} PostIts`);
        } catch (error) {
            console.error('Failed to update PostIt decorations:', error);
        }
    }

    /**
     * CodeLensと折りたたみ範囲を更新
     */
    updateCodeLens(): void {
        this.manager.getCodeLensProvider().refresh();
        this.manager.getFoldingProvider().refresh();
    }

    /**
     * PostItを作成するコマンド
     */
    private async createPostIt(): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

            const document = editor.document;
            const selection = editor.selection;
            
            // ファイル名をタイトルとして使用（パスの最後の部分のみ）
            const fileName = document.fileName.split('/').pop() || document.fileName;
            
            // ワークスペース相対パスを取得
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            const filePath = workspaceFolder 
                ? vscode.workspace.asRelativePath(document.uri)
                : document.fileName;
            
            // カーソル位置または選択範囲を取得
            let startLine: number;
            let endLine: number;
            let lines: Array<{file: string, line: number, endLine: number, text: string}> = [];
            
            if (!selection.isEmpty) {
                // 選択範囲がある場合
                startLine = selection.start.line;
                endLine = selection.end.line;
                
                console.log(`Original selection:`, {
                    start: { line: selection.start.line, character: selection.start.character },
                    end: { line: selection.end.line, character: selection.end.character }
                });
                
                // 選択範囲の最後が行の先頭の場合、前の行までにする
                if (selection.end.character === 0 && endLine > startLine) {
                    console.log(`Adjusting endLine from ${endLine} to ${endLine - 1} (end character is 0)`);
                    endLine--;
                }
                
                // 末尾空白行の自動調整: 内容のある最後の行まで調整
                while (endLine > startLine && document.lineAt(endLine).text.trim() === '') {
                    endLine--;
                }
                
                // 選択範囲のテキストを結合
                const selectedLines: string[] = [];
                for (let i = startLine; i <= endLine; i++) {
                    selectedLines.push(document.lineAt(i).text);
                }
                const combinedText = selectedLines.join('\n');
                
                console.log(`Creating PostIt: ${fileName}, lines ${startLine + 1}-${endLine + 1}`);
                
                lines.push({
                    file: filePath,
                    line: startLine + 1, // 1ベース
                    endLine: endLine + 1, // 1ベース
                    text: combinedText
                });
            } else {
                // 選択範囲がない場合はカーソル位置の行
                const cursorPosition = selection.active;
                startLine = endLine = cursorPosition.line;
                const lineText = document.lineAt(startLine).text;
                
                console.log(`Creating PostIt: ${fileName}, line ${startLine + 1}`);
                
                lines.push({
                    file: filePath,
                    line: startLine + 1, // 1ベース
                    endLine: endLine + 1, // 1ベース
                    text: lineText
                });
            }

            // 最後に使用したフォルダを取得（存在しない場合はDefaultを返す）
            const targetFolder = await this.storage.getValidLastedFolder();

            // PostItを指定フォルダに作成
            const newNote = await this.storage.addNoteToFolder(targetFolder, {
                title: fileName,
                color: 'yellow', // デフォルト色
                Lines: lines,
                ViewType: PostItViewType.Line // デフォルトはLine
            });

            // 最後に使用したフォルダとして更新
            await this.storage.updateConfig({ lastedFolder: targetFolder });

            vscode.window.showInformationMessage(`PostIt created: ${newNote.title}`);
            
            // サイドバーを更新
            this.manager.getTreeProvider().refresh();
            
            // Gutter decorationを更新
            this.updatePostItDecorations();
            
            // CodeLensを更新
            this.updateCodeLens();

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create PostIt: ${error}`);
        }
    }

    /**
     * タイトル付きでPostItを作成するコマンド
     */
    private async createPostItWithTitle(): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

            // タイトルの入力を求める
            const title = await vscode.window.showInputBox({
                prompt: 'Enter PostIt title',
                placeHolder: 'e.g., TODO: Fix this bug',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Title cannot be empty';
                    }
                    return null;
                }
            });

            if (!title) {
                return; // キャンセルされた場合
            }

            const document = editor.document;
            const selection = editor.selection;
            
            // ワークスペース相対パスを取得
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            const filePath = workspaceFolder 
                ? vscode.workspace.asRelativePath(document.uri)
                : document.fileName;
            
            // カーソル位置または選択範囲を取得
            let startLine: number;
            let endLine: number;
            let lines: Array<{file: string, line: number, endLine: number, text: string}> = [];
            
            if (!selection.isEmpty) {
                // 選択範囲がある場合
                startLine = selection.start.line;
                endLine = selection.end.line;
                
                // 選択範囲の最後が行の先頭の場合、前の行までにする
                if (selection.end.character === 0 && endLine > startLine) {
                    endLine--;
                }
                
                // 末尾空白行の自動調整
                while (endLine > startLine && document.lineAt(endLine).text.trim() === '') {
                    endLine--;
                }
                
                // 選択範囲のテキストを結合
                const selectedLines: string[] = [];
                for (let i = startLine; i <= endLine; i++) {
                    selectedLines.push(document.lineAt(i).text);
                }
                const combinedText = selectedLines.join('\n');
                
                lines.push({
                    file: filePath,
                    line: startLine + 1, // 1ベース
                    endLine: endLine + 1, // 1ベース
                    text: combinedText
                });
            } else {
                // 選択範囲がない場合はカーソル位置の行
                const cursorPosition = selection.active;
                startLine = endLine = cursorPosition.line;
                const lineText = document.lineAt(startLine).text;
                
                lines.push({
                    file: filePath,
                    line: startLine + 1, // 1ベース
                    endLine: endLine + 1, // 1ベース
                    text: lineText
                });
            }

            // 最後に使用したフォルダを取得（存在しない場合はDefaultを返す）
            const targetFolder = await this.storage.getValidLastedFolder();

            // PostItを指定フォルダに作成（ユーザー指定のタイトル使用）
            const newNote = await this.storage.addNoteToFolder(targetFolder, {
                title: title.trim(),
                color: 'yellow', // デフォルト色
                Lines: lines,
                ViewType: PostItViewType.CodeLens // タイトル指定時はCodeLensビュー
            });

            // 最後に使用したフォルダとして更新
            await this.storage.updateConfig({ lastedFolder: targetFolder });

            vscode.window.showInformationMessage(`PostIt created: ${newNote.title}`);
            
            // サイドバーを更新
            this.manager.getTreeProvider().refresh();
            
            // Gutter decorationを更新
            this.updatePostItDecorations();
            
            // CodeLensを更新
            this.updateCodeLens();

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create PostIt: ${error}`);
        }
    }

    /**
     * 行番号の右クリックからPostItを作成するコマンド
     */
    private async createPostItAtLine(uri: vscode.Uri, lineNumber: number): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.toString() !== uri.toString()) {
                vscode.window.showWarningMessage('Active editor does not match the file');
                return;
            }

            const document = editor.document;
            
            // ファイル名をタイトルとして使用（パスの最後の部分のみ）
            const fileName = document.fileName.split('/').pop() || document.fileName;
            
            // ワークスペース相対パスを取得
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            const filePath = workspaceFolder 
                ? vscode.workspace.asRelativePath(document.uri)
                : document.fileName;
            
            // 指定された行番号（0ベース）のテキストを取得
            const lineText = document.lineAt(lineNumber).text;
            
            console.log(`Creating PostIt at specific line:`, {
                file: filePath,
                vscodeLineNumber: lineNumber, // VSCode内部の行番号（0ベース）
                displayLine: lineNumber + 1, // 表示用行番号（1ベース）
                text: lineText.substring(0, 50) + (lineText.length > 50 ? '...' : '')
            });

            // 最後に使用したフォルダを取得（存在しない場合はDefaultを返す）
            const targetFolder = await this.storage.getValidLastedFolder();

            // PostItを指定フォルダに作成
            const newNote = await this.storage.addNoteToFolder(targetFolder, {
                title: fileName,
                color: 'yellow', // デフォルト色
                Lines: [{
                    file: filePath,
                    line: lineNumber + 1, // 1ベース行番号で保存
                    endLine: lineNumber + 1, // 単一行の場合は同じ行番号
                    text: lineText
                }],
                ViewType: PostItViewType.Line // デフォルトはLine
            });

            // 最後に使用したフォルダとして更新
            await this.storage.updateConfig({ lastedFolder: targetFolder });

            vscode.window.showInformationMessage(`PostIt created at line ${lineNumber + 1}: ${newNote.title}`);
            
            // サイドバーを更新
            this.manager.getTreeProvider().refresh();
            
            // Gutter decorationを更新
            this.updatePostItDecorations();
            
            // CodeLensを更新
            this.updateCodeLens();

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create PostIt: ${error}`);
        }
    }

    /**
     * PostItデータを全削除するコマンド
     */
    private async clearAllPostIts(): Promise<void> {
        try {
            // 確認ダイアログを表示
            const answer = await vscode.window.showWarningMessage(
                'すべてのPostItを削除しますか？この操作は元に戻せません。',
                { modal: true },
                '削除',
                'キャンセル'
            );

            if (answer !== '削除') {
                return;
            }

            // PostItNoteのみ削除（フォルダ構造とConfigは保持）
            await this.storage.clearAllNotes();
            
            vscode.window.showInformationMessage('すべてのPostItを削除しました');
            
            // サイドバーを更新
            this.manager.getTreeProvider().refresh();
            
            // Gutter decorationを更新
            this.updatePostItDecorations();
            
            // CodeLensを更新
            this.updateCodeLens();

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to clear PostIts: ${error}`);
        }
    }

    /**
     * PostItのタイトル変更コマンド
     */
    private async changePostItTitle(item: any): Promise<void> {
        try {
            if (!item || !item.note) {
                vscode.window.showErrorMessage('Invalid PostIt item');
                return;
            }

            const currentTitle = item.note.title;
            const newTitle = await vscode.window.showInputBox({
                prompt: 'Enter new title for PostIt',
                value: currentTitle,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Title cannot be empty';
                    }
                    return null;
                }
            });

            if (newTitle && newTitle !== currentTitle) {
                await this.storage.updateNote(item.note.id, { 
                    title: newTitle.trim(),
                    ViewType: PostItViewType.CodeLens // タイトル変更時はCodeLensに変更
                });
                vscode.window.showInformationMessage(`PostIt title updated to: ${newTitle.trim()}`);
                
                // サイドバー、ガター表示、CodeLensを更新
                this.manager.getTreeProvider().refresh();
                this.updatePostItDecorations();
                this.updateCodeLens();
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to change PostIt title: ${error}`);
        }
    }

    /**
     * フォルダ作成コマンド（従来版）
     */
    private async createFolder(): Promise<void> {
        try {
            const folderPath = await vscode.window.showInputBox({
                prompt: 'Enter folder path (use / for subfolders)',
                placeHolder: 'e.g., TODO, Projects/WebApp, Archive/2024',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Folder path cannot be empty';
                    }
                    if (value.includes('//') || value.startsWith('/') || value.endsWith('/')) {
                        return 'Invalid folder path format';
                    }
                    return null;
                }
            });

            if (folderPath) {
                const trimmedPath = folderPath.trim();
                const success = await this.storage.createFolder(trimmedPath);
                
                if (success) {
                    // 最後に使用したフォルダとして記録
                    await this.storage.updateConfig({ lastedFolder: trimmedPath });
                    vscode.window.showInformationMessage(`Created folder: ${trimmedPath}`);
                    
                    // サイドバーを更新
                    this.manager.getTreeProvider().refresh();
                } else {
                    vscode.window.showWarningMessage(`Folder "${trimmedPath}" already exists`);
                }
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
        }
    }

    /**
     * サブフォルダ作成コマンド
     */
    private async createSubFolder(item: any): Promise<void> {
        try {
            if (!item || !item.folderPath) {
                vscode.window.showErrorMessage('Invalid folder item');
                return;
            }

            const parentPath = item.folderPath;
            const subFolderName = await vscode.window.showInputBox({
                prompt: `Create subfolder in "${parentPath}"`,
                placeHolder: 'e.g., Completed, Archive, Sprint1',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Subfolder name cannot be empty';
                    }
                    if (value.includes('/')) {
                        return 'Subfolder name cannot contain "/"';
                    }
                    return null;
                }
            });

            if (subFolderName) {
                const trimmedName = subFolderName.trim();
                const fullPath = `${parentPath}/${trimmedName}`;
                const success = await this.storage.createFolder(fullPath);
                
                if (success) {
                    // 最後に使用したフォルダとして記録
                    await this.storage.updateConfig({ lastedFolder: fullPath });
                    vscode.window.showInformationMessage(`Created subfolder: ${fullPath}`);
                    
                    // サイドバーを更新
                    this.manager.getTreeProvider().refresh();
                } else {
                    vscode.window.showWarningMessage(`Subfolder "${fullPath}" already exists`);
                }
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create subfolder: ${error}`);
        }
    }

    /**
     * フォルダリネームコマンド
     */
    private async renameFolder(item: any): Promise<void> {
        try {
            if (!item || !item.folderPath) {
                vscode.window.showErrorMessage('Invalid folder item');
                return;
            }

            const oldPath = item.folderPath;
            
            // デフォルトフォルダはリネーム不可
            if (oldPath === 'Default') {
                vscode.window.showWarningMessage('Cannot rename the Default folder');
                return;
            }

            const currentName = oldPath.split('/').pop() || oldPath;
            const newName = await vscode.window.showInputBox({
                prompt: `Rename folder "${oldPath}"`,
                value: currentName,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Folder name cannot be empty';
                    }
                    if (value.includes('/')) {
                        return 'Folder name cannot contain "/"';
                    }
                    return null;
                }
            });

            if (newName && newName.trim() !== currentName) {
                const trimmedName = newName.trim();
                // 親パスを保持して新しいパスを構築
                const pathParts = oldPath.split('/');
                pathParts[pathParts.length - 1] = trimmedName;
                const newPath = pathParts.join('/');
                
                const success = await this.storage.renameFolder(oldPath, newPath);
                
                if (success) {
                    vscode.window.showInformationMessage(`Renamed folder: ${oldPath} → ${newPath}`);
                    
                    // サイドバーを更新
                    this.manager.getTreeProvider().refresh();
                } else {
                    vscode.window.showWarningMessage(`Failed to rename folder: "${newPath}" already exists or operation not allowed`);
                }
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to rename folder: ${error}`);
        }
    }

    /**
     * PostIt削除コマンド
     */
    private async deletePostIt(item: any): Promise<void> {
        try {
            if (!item || !item.note) {
                vscode.window.showErrorMessage('Invalid PostIt item');
                return;
            }

            const answer = await vscode.window.showWarningMessage(
                `Delete PostIt "${item.note.title}"?`,
                { modal: true },
                'Delete',
                'Cancel'
            );

            if (answer === 'Delete') {
                await this.storage.deleteNote(item.note.id);
                vscode.window.showInformationMessage(`PostIt "${item.note.title}" deleted`);
                
                // サイドバー、ガター表示、CodeLensを更新
                this.manager.getTreeProvider().refresh();
                this.updatePostItDecorations();
                this.updateCodeLens();
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete PostIt: ${error}`);
        }
    }

    /**
     * PostIt専用折りたたみ関数
     */
    private async foldSpecificRange(
        editor: vscode.TextEditor, 
        startLine: number, 
        endLine: number, 
        postItId: string
    ): Promise<boolean> {
        try {
            console.log(`Folding PostIt ${postItId}: lines ${startLine + 1}-${endLine + 1}`);
            
            // 方法1: 選択範囲を作成してからカスタム折りたたみ範囲を作成
            const startPos = new vscode.Position(startLine, 0);
            const endPos = new vscode.Position(endLine, editor.document.lineAt(endLine).text.length);
            editor.selection = new vscode.Selection(startPos, endPos);
            
            // カスタム折りたたみ範囲を作成（任意の範囲を折りたたみ可能にする）
            await vscode.commands.executeCommand('editor.createFoldingRangeFromSelection');
            
            // 少し待機してから折りたたみ実行
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // カーソルを開始行に戻してから折りたたみ
            editor.selection = new vscode.Selection(startPos, startPos);
            await vscode.commands.executeCommand('editor.fold');
            
            return true;
        } catch (error) {
            console.error(`Failed to fold PostIt ${postItId}:`, error);
            return false;
        }
    }

    /**
     * PostIt専用展開関数
     */
    private async unfoldSpecificRange(
        editor: vscode.TextEditor, 
        startLine: number, 
        endLine: number
    ): Promise<boolean> {
        try {
            console.log(`Unfolding range: lines ${startLine + 1}-${endLine + 1}`);
            
            // カーソルを開始行に配置
            const startPosition = new vscode.Position(startLine, 0);
            editor.selection = new vscode.Selection(startPosition, startPosition);
            
            // 展開実行
            await vscode.commands.executeCommand('editor.unfold');
            
            return true;
        } catch (error) {
            console.error(`Failed to unfold range ${startLine + 1}-${endLine + 1}:`, error);
            return false;
        }
    }

    /**
     * CodeLensクリック時のトグルコマンド
     */
    private async togglePostItFold(postIt: any, documentUri: vscode.Uri): Promise<void> {
        try {
            const firstLine = postIt.Lines[0];
            const foldKey = `${documentUri.toString()}:${postIt.id}`;
            const isFolded = this.foldedPostIts.get(foldKey) || false;
            
            // アクティブエディタが対象ファイルと一致するかチェック
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.uri.toString() !== documentUri.toString()) {
                // ファイルを開く
                const document = await vscode.workspace.openTextDocument(documentUri);
                await vscode.window.showTextDocument(document);
            }
            
            const editor = vscode.window.activeTextEditor!;
            
            // PostItの正確な範囲を設定（1ベースから0ベースに変換）
            const startLine = firstLine.line - 1;
            const endLine = firstLine.endLine - 1;
            
            console.log(`Toggle fold for PostIt "${postIt.title}":`, {
                storedLine: firstLine.line, // 保存値（1ベース）
                storedEndLine: firstLine.endLine, // 保存値（1ベース）
                commandStartLine: startLine, // コマンド用（0ベース）
                commandEndLine: endLine, // コマンド用（0ベース）
                documentLineCount: editor.document.lineCount,
                currentFoldState: isFolded
            });
            
            // 有効な範囲かチェック
            if (startLine < 0 || endLine >= editor.document.lineCount || startLine >= endLine) {
                console.error(`Invalid PostIt range:`, {
                    startLine,
                    endLine,
                    documentLineCount: editor.document.lineCount
                });
                vscode.window.showErrorMessage(`Invalid PostIt range: lines ${firstLine.line}-${firstLine.endLine}`);
                return;
            }
            
            // 末尾空白行の自動調整: 内容のある最後の行まで調整
            let adjustedEndLine = endLine;
            while (adjustedEndLine > startLine && editor.document.lineAt(adjustedEndLine).text.trim() === '') {
                adjustedEndLine--;
            }
            
            console.log(`PostIt fold: ${postIt.title}, lines ${firstLine.line}-${adjustedEndLine + 1}`);
            
            if (isFolded) {
                // 展開: 調整済み範囲で展開
                await this.unfoldSpecificRange(editor, startLine, adjustedEndLine);
                this.foldedPostIts.set(foldKey, false);
                vscode.window.showInformationMessage(`Unfolded PostIt: ${postIt.title} (lines ${firstLine.line}-${adjustedEndLine + 1})`);
            } else {
                // 折りたたみ: 調整済み範囲で折りたたみ
                const success = await this.foldSpecificRange(editor, startLine, adjustedEndLine, postIt.id);
                if (success) {
                    this.foldedPostIts.set(foldKey, true);
                    vscode.window.showInformationMessage(`Folded PostIt: ${postIt.title} (lines ${firstLine.line}-${adjustedEndLine + 1})`);
                } else {
                    vscode.window.showErrorMessage(`Failed to fold PostIt: ${postIt.title}`);
                }
            }
            
            // カーソルを開始行に移動（折りたたみ処理後にリセット）
            const resetPos = new vscode.Position(startLine, 0);
            editor.selection = new vscode.Selection(resetPos, resetPos);
            editor.revealRange(new vscode.Range(resetPos, resetPos), vscode.TextEditorRevealType.InCenter);
            
        } catch (error) {
            console.error('Failed to toggle PostIt fold:', error);
            vscode.window.showErrorMessage(`Failed to toggle PostIt fold: ${error}`);
        }
    }

    /**
     * 旧コマンド（互換性のため）
     */
    private async openPostItLocation(postIt: any): Promise<void> {
        try {
            const firstLine = postIt.Lines[0];
            vscode.window.showInformationMessage(`PostIt: ${postIt.title} at line ${firstLine.line}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open PostIt location: ${error}`);
        }
    }
}