import * as vscode from 'vscode';
import { CodeMarkerStorage } from './codeMarkerStorage';
import { DiagnosticsManager } from './diagnosticsManager';
import { LineHighlightManager, PRESET_COLORS } from './lineHighlightManager';
import { SyntaxHighlightManager } from './syntaxHighlightManager';
import { DiagnosticsTypes, CodeMarkerDiagnostics } from './types';
import { CodeMarkerTreeItem } from './codeMarkerTreeItem';
import { CodeMarkerTreeView } from './codeMarkerTreeView';

/**
 * CodeMarker機能のコマンド処理を管理するクラス
 */
export class CodeMarkerCommandProvider {
    constructor(
        private storage: CodeMarkerStorage,
        private diagnosticsManager: DiagnosticsManager,
        private lineHighlightManager: LineHighlightManager,
        private syntaxHighlightManager: SyntaxHighlightManager,
        private treeProvider: CodeMarkerTreeView,
        private context: vscode.ExtensionContext
    ) {}

    /**
     * CodeMarker関連のコマンドを登録
     */
    registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('codereader.addDiagnosticsHint', this.createDiagnosticsCommand(DiagnosticsTypes.Hint)),
            vscode.commands.registerCommand('codereader.addDiagnosticsInfo', this.createDiagnosticsCommand(DiagnosticsTypes.Info)),
            vscode.commands.registerCommand('codereader.addDiagnosticsWarning', this.createDiagnosticsCommand(DiagnosticsTypes.Warning)),
            vscode.commands.registerCommand('codereader.addDiagnosticsError', this.createDiagnosticsCommand(DiagnosticsTypes.Error)),
            vscode.commands.registerCommand('codereader.addLineHighlight', this.addLineHighlight.bind(this)),
            vscode.commands.registerCommand('codereader.addSyntaxHighlight', this.addSyntaxHighlight.bind(this)),
            vscode.commands.registerCommand('codereader.clearAllDiagnostics', this.clearAllDiagnostics.bind(this)),
            vscode.commands.registerCommand('codereader.createCodeMarkerFolder', this.createCodeMarkerFolder.bind(this)),
            vscode.commands.registerCommand('codereader.createCodeMarkerSubFolder', this.createCodeMarkerSubFolder.bind(this)),
            vscode.commands.registerCommand('codereader.renameCodeMarkerFolder', this.renameCodeMarkerFolder.bind(this)),
            vscode.commands.registerCommand('codereader.deleteCodeMarkerFolder', this.deleteCodeMarkerFolder.bind(this)),
            vscode.commands.registerCommand('codereader.deleteCodeMarkerDiagnostics', this.deleteCodeMarkerDiagnostics.bind(this)),
            vscode.commands.registerCommand('codereader.deleteCodeMarkerLineHighlight', this.deleteCodeMarkerLineHighlight.bind(this)),
            vscode.commands.registerCommand('codereader.deleteCodeMarkerSyntaxHighlight', this.deleteCodeMarkerSyntaxHighlight.bind(this)),
            vscode.commands.registerCommand('codereader.openDiagnosticsLocation', this.openDiagnosticsLocation.bind(this)),
            vscode.commands.registerCommand('codereader.openLineHighlightLocation', this.openLineHighlightLocation.bind(this)),
            vscode.commands.registerCommand('codereader.openSyntaxHighlightLocation', this.openSyntaxHighlightLocation.bind(this)),
            vscode.commands.registerCommand('codereader.toggleSyntaxHighlightUp', this.toggleSyntaxHighlightUp.bind(this)),
            vscode.commands.registerCommand('codereader.toggleSyntaxHighlightDown', this.toggleSyntaxHighlightDown.bind(this))
        ];
    }

    /**
     * Diagnosticsコマンドを作成するファクトリー関数
     */
    private createDiagnosticsCommand(type: DiagnosticsTypes) {
        return async (): Promise<void> => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('No active editor found');
                    return;
                }

                const document = editor.document;
                const selection = editor.selection;
                
                // メッセージの入力を求める
                const message = await vscode.window.showInputBox({
                    prompt: `Enter ${type} message`,
                    placeHolder: `e.g., This code needs attention`,
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Message cannot be empty';
                        }
                        return null;
                    }
                });

                if (!message) {
                    return; // キャンセルされた場合
                }

                // ファイルパスを取得
                const filePath = document.uri.fsPath;
                
                let startLine: number;
                let endLine: number;
                let startColumn: number;
                let endColumn: number;
                let selectedText: string;
                
                if (!selection.isEmpty) {
                    // 選択範囲がある場合
                    startLine = selection.start.line + 1; // 1ベース
                    endLine = selection.end.line + 1;
                    startColumn = selection.start.character;
                    endColumn = selection.end.character;
                    selectedText = document.getText(selection);
                    
                    // 選択範囲の最後が行の先頭の場合、前の行までにする
                    if (selection.end.character === 0 && endLine > startLine) {
                        endLine--;
                        endColumn = document.lineAt(endLine - 1).text.length; // 0ベースで取得して1ベースに調整
                    }
                } else {
                    // 選択範囲がない場合はカーソル位置の行
                    const cursorPosition = selection.active;
                    startLine = endLine = cursorPosition.line + 1; // 1ベース
                    startColumn = 0;
                    endColumn = document.lineAt(cursorPosition.line).text.length;
                    selectedText = document.lineAt(cursorPosition.line).text;
                }

                // 最後に使用したフォルダを取得
                const targetFolder = await this.storage.getValidLastedFolder();

                // Diagnosticsを追加
                await this.diagnosticsManager.addDiagnosticsToFolder(
                    targetFolder,
                    filePath,
                    type,
                    message.trim(),
                    startLine,
                    endLine,
                    startColumn,
                    endColumn,
                    selectedText
                );

                // 最後に使用したフォルダとして更新
                await this.storage.updateConfig({ lastedFolder: targetFolder });

                // ツリーを更新
                this.treeProvider.refresh();

                vscode.window.showInformationMessage(`${type} added: ${message.trim()}`);

            } catch (error) {
                vscode.window.showErrorMessage(`Failed to add ${type}: ${error}`);
            }
        };
    }

    /**
     * 全てのDiagnosticsをクリアするコマンド
     */
    private async clearAllDiagnostics(): Promise<void> {
        try {
            // 確認ダイアログを表示
            const answer = await vscode.window.showWarningMessage(
                'すべてのCodeMarker Diagnosticsを削除しますか？この操作は元に戻せません。',
                { modal: true },
                '削除',
                'キャンセル'
            );

            if (answer !== '削除') {
                return;
            }

            await this.diagnosticsManager.clearAllDiagnostics();
            this.treeProvider.refresh();
            vscode.window.showInformationMessage('すべてのCodeMarker Diagnosticsを削除しました');

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to clear Diagnostics: ${error}`);
        }
    }

    /**
     * CodeMarker フォルダ作成コマンド
     */
    private async createCodeMarkerFolder(): Promise<void> {
        try {
            const folderPath = await vscode.window.showInputBox({
                prompt: 'Enter folder path (use / for subfolders)',
                placeHolder: 'e.g., Issues, TODOs, Bugs/Critical',
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
                    await this.storage.updateConfig({ lastedFolder: trimmedPath });
                    vscode.window.showInformationMessage(`Created folder: ${trimmedPath}`);
                    this.treeProvider.refresh();
                } else {
                    vscode.window.showWarningMessage(`Folder "${trimmedPath}" already exists`);
                }
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
        }
    }

    /**
     * CodeMarker サブフォルダ作成コマンド
     */
    private async createCodeMarkerSubFolder(item: any): Promise<void> {
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
                    await this.storage.updateConfig({ lastedFolder: fullPath });
                    vscode.window.showInformationMessage(`Created subfolder: ${fullPath}`);
                    this.treeProvider.refresh();
                } else {
                    vscode.window.showWarningMessage(`Subfolder "${fullPath}" already exists`);
                }
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create subfolder: ${error}`);
        }
    }

    /**
     * CodeMarker フォルダリネームコマンド
     */
    private async renameCodeMarkerFolder(item: any): Promise<void> {
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
                const pathParts = oldPath.split('/');
                pathParts[pathParts.length - 1] = trimmedName;
                const newPath = pathParts.join('/');
                
                const success = await this.storage.renameFolder(oldPath, newPath);
                
                if (success) {
                    vscode.window.showInformationMessage(`Renamed folder: ${oldPath} → ${newPath}`);
                    this.treeProvider.refresh();
                } else {
                    vscode.window.showWarningMessage(`Failed to rename folder: "${newPath}" already exists or operation not allowed`);
                }
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to rename folder: ${error}`);
        }
    }

    /**
     * CodeMarker フォルダ削除コマンド
     */
    private async deleteCodeMarkerFolder(item: any): Promise<void> {
        try {
            if (!item || !item.folderPath) {
                vscode.window.showErrorMessage('Invalid folder item');
                return;
            }

            const folderPath = item.folderPath;
            
            // デフォルトフォルダは削除不可
            if (folderPath === 'Default') {
                vscode.window.showWarningMessage('Cannot delete the Default folder');
                return;
            }

            // 確認ダイアログを表示
            const answer = await vscode.window.showWarningMessage(
                `Delete folder "${folderPath}" and all its diagnostics?`,
                { modal: true },
                'Delete',
                'Cancel'
            );

            if (answer === 'Delete') {
                const success = await this.storage.deleteFolder(folderPath);
                
                if (success) {
                    vscode.window.showInformationMessage(`Deleted folder: ${folderPath}`);
                    this.treeProvider.refresh();
                } else {
                    vscode.window.showWarningMessage(`Failed to delete folder: ${folderPath}`);
                }
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete folder: ${error}`);
        }
    }

    /**
     * CodeMarker Diagnostics削除コマンド
     */
    private async deleteCodeMarkerDiagnostics(item: any): Promise<void> {
        try {
            if (!item || !item.diagnostics || !item.folder || !item.filePath) {
                vscode.window.showErrorMessage('Invalid diagnostics item');
                return;
            }

            const answer = await vscode.window.showWarningMessage(
                `Delete diagnostics "${item.diagnostics.text}"?`,
                { modal: true },
                'Delete',
                'Cancel'
            );

            if (answer === 'Delete') {
                await this.diagnosticsManager.deleteDiagnostics(item.folder, item.filePath, item.diagnostics.id);
                vscode.window.showInformationMessage(`Diagnostics "${item.diagnostics.text}" deleted`);
                this.treeProvider.refresh();
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete diagnostics: ${error}`);
        }
    }

    /**
     * Diagnostics位置を開くコマンド
     */
    private async openDiagnosticsLocation(diagnostics: any, filePath: string): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const editor = await vscode.window.showTextDocument(document);
            
            const startPosition = new vscode.Position(diagnostics.Lines.startLine - 1, diagnostics.Lines.startColumn);
            const endPosition = new vscode.Position(diagnostics.Lines.endLine - 1, diagnostics.Lines.endColumn);
            
            editor.selection = new vscode.Selection(startPosition, endPosition);
            editor.revealRange(new vscode.Range(startPosition, endPosition), vscode.TextEditorRevealType.InCenter);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open diagnostics location: ${error}`);
        }
    }
    
    /**
     * 行をハイライトするコマンド
     */
    private async addLineHighlight(): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

            const document = editor.document;
            const selection = editor.selection;
            
            // 色を選択させる
            const colorOptions = PRESET_COLORS.map(preset => ({
                label: preset.name,
                description: preset.color,
                color: preset.color
            }));
            
            const selectedColor = await vscode.window.showQuickPick(colorOptions, {
                placeHolder: 'Select highlight color',
                title: 'Choose a color for line highlight'
            });
            
            if (!selectedColor) {
                return; // キャンセルされた場合
            }
            
            // ファイルパスを取得
            const filePath = document.uri.fsPath;
            
            let startLine: number;
            let endLine: number;
            
            if (!selection.isEmpty) {
                // 選択範囲がある場合
                startLine = selection.start.line + 1; // 1ベース
                endLine = selection.end.line + 1;
                
                // 選択範囲の最後が行の先頭の場合、前の行までにする
                if (selection.end.character === 0 && endLine > startLine) {
                    endLine--;
                }
            } else {
                // 選択範囲がない場合はカーソル位置の行
                const cursorPosition = selection.active;
                startLine = endLine = cursorPosition.line + 1; // 1ベース
            }
            
            // 最後に使用したフォルダを取得
            const targetFolder = await this.storage.getValidLastedFolder();
            
            // LineHighlightを追加
            await this.lineHighlightManager.addHighlightToFolder(
                targetFolder,
                filePath,
                selectedColor.color,
                startLine,
                endLine
            );
            
            // 最後に使用したフォルダとして更新
            await this.storage.updateConfig({ lastedFolder: targetFolder });
            
            // ツリーを更新
            this.treeProvider.refresh();
            
            vscode.window.showInformationMessage(`Line highlight added with ${selectedColor.label} color`);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add line highlight: ${error}`);
        }
    }
    
    /**
     * CodeMarker LineHighlight削除コマンド
     */
    private async deleteCodeMarkerLineHighlight(item: any): Promise<void> {
        try {
            if (!item || !item.highlight || !item.folder || !item.filePath) {
                vscode.window.showErrorMessage('Invalid line highlight item');
                return;
            }

            const answer = await vscode.window.showWarningMessage(
                `Delete line highlight (${item.highlight.Lines.length} lines)?`,
                { modal: true },
                'Delete',
                'Cancel'
            );

            if (answer === 'Delete') {
                await this.lineHighlightManager.deleteHighlight(item.folder, item.filePath, item.highlight.id);
                vscode.window.showInformationMessage('Line highlight deleted');
                this.treeProvider.refresh();
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete line highlight: ${error}`);
        }
    }
    
    /**
     * LineHighlight位置を開くコマンド
     */
    private async openLineHighlightLocation(highlight: any, filePath: string): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const editor = await vscode.window.showTextDocument(document);
            
            // 最初の行を基準にカーソルを移動
            const firstLine = highlight.Lines[0];
            const startPosition = new vscode.Position(firstLine.startLine - 1, 0);
            const endPosition = new vscode.Position(firstLine.endLine - 1, 0);
            
            editor.selection = new vscode.Selection(startPosition, endPosition);
            editor.revealRange(new vscode.Range(startPosition, endPosition), vscode.TextEditorRevealType.InCenter);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open line highlight location: ${error}`);
        }
    }
    
    /**
     * SyntaxHighlightを追加するコマンド
     */
    private async addSyntaxHighlight(): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found');
                return;
            }

            const document = editor.document;
            const selection = editor.selection;
            
            // ファイルパスを取得
            const filePath = document.uri.fsPath;
            
            // 既存のSyntaxHighlightがあるかチェック（情報表示のみ）
            const existingSyntaxHighlight = await this.syntaxHighlightManager.getSyntaxHighlight(filePath);
            if (existingSyntaxHighlight) {
                vscode.window.showInformationMessage(
                    `Adding to existing syntax highlight (${existingSyntaxHighlight.Lines.length} lines)`
                );
            }
            
            let lines: number[] = [];
            
            if (!selection.isEmpty) {
                // 選択範囲がある場合
                const startLine = selection.start.line + 1; // 1ベース
                let endLine = selection.end.line + 1;
                
                // 選択範囲の最後が行の先頭の場合、前の行までにする
                if (selection.end.character === 0 && endLine > startLine) {
                    endLine--;
                }
                
                for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
                    lines.push(lineNum);
                }
            } else {
                // 選択範囲がない場合はカーソル位置の行
                const cursorPosition = selection.active;
                lines.push(cursorPosition.line + 1); // 1ベース
            }
            
            // 最後に使用したフォルダを取得
            const targetFolder = await this.storage.getValidLastedFolder();
            
            // SyntaxHighlightを追加
            await this.syntaxHighlightManager.addLinesToSyntaxHighlight(
                targetFolder,
                filePath,
                lines
            );
            
            // 最後に使用したフォルダとして更新
            await this.storage.updateConfig({ lastedFolder: targetFolder });
            
            // ツリーを更新
            this.treeProvider.refresh();
            
            // 更新後の結果を取得して表示
            const updatedSyntaxHighlight = await this.syntaxHighlightManager.getSyntaxHighlight(filePath);
            const totalLines = updatedSyntaxHighlight ? updatedSyntaxHighlight.Lines.length : lines.length;
            vscode.window.showInformationMessage(`Syntax highlight updated: ${lines.length} line(s) added (total: ${totalLines} lines)`);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to add syntax highlight: ${error}`);
        }
    }
    
    /**
     * CodeMarker SyntaxHighlight削除コマンド
     */
    private async deleteCodeMarkerSyntaxHighlight(item: any): Promise<void> {
        try {
            if (!item || !item.syntaxHighlight || !item.folder || !item.filePath) {
                vscode.window.showErrorMessage('Invalid syntax highlight item');
                return;
            }

            const answer = await vscode.window.showWarningMessage(
                `Delete syntax highlight (${item.syntaxHighlight.Lines.length} lines)?`,
                { modal: true },
                'Delete',
                'Cancel'
            );

            if (answer === 'Delete') {
                await this.syntaxHighlightManager.deleteSyntaxHighlight(item.folder, item.filePath);
                vscode.window.showInformationMessage('Syntax highlight deleted');
                this.treeProvider.refresh();
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete syntax highlight: ${error}`);
        }
    }
    
    /**
     * SyntaxHighlight位置を開くコマンド
     */
    private async openSyntaxHighlightLocation(syntaxHighlight: any, filePath: string): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const editor = await vscode.window.showTextDocument(document);
            
            // 最初の行を基準にカーソルを移動
            const firstLine = syntaxHighlight.Lines[0];
            const startPosition = new vscode.Position(firstLine - 1, 0);
            const endPosition = new vscode.Position(firstLine - 1, 0);
            
            editor.selection = new vscode.Selection(startPosition, endPosition);
            editor.revealRange(new vscode.Range(startPosition, endPosition), vscode.TextEditorRevealType.InCenter);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open syntax highlight location: ${error}`);
        }
    }
    
    /**
     * カーソルを上に移動しながら元の行をtoggle
     */
    private async toggleSyntaxHighlightUp(): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const document = editor.document;
            const currentPosition = editor.selection.active;
            const currentLine = currentPosition.line;
            
            // カーソルを上に移動（最初の行でなければ）
            if (currentLine > 0) {
                const newPosition = new vscode.Position(currentLine - 1, currentPosition.character);
                editor.selection = new vscode.Selection(newPosition, newPosition);
                editor.revealRange(new vscode.Range(newPosition, newPosition));
                
                // 元の行（移動前）をtoggle
                const filePath = document.uri.fsPath;
                const targetFolder = await this.storage.getValidLastedFolder();
                const isAdded = await this.syntaxHighlightManager.toggleLine(
                    targetFolder,
                    filePath,
                    currentLine + 1 // 1ベース
                );
                
                // ツリーを更新
                this.treeProvider.refresh();
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to toggle syntax highlight: ${error}`);
        }
    }
    
    /**
     * カーソルを下に移動しながら元の行をtoggle
     */
    private async toggleSyntaxHighlightDown(): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const document = editor.document;
            const currentPosition = editor.selection.active;
            const currentLine = currentPosition.line;
            const lastLine = document.lineCount - 1;
            
            // カーソルを下に移動（最後の行でなければ）
            if (currentLine < lastLine) {
                const newPosition = new vscode.Position(currentLine + 1, currentPosition.character);
                editor.selection = new vscode.Selection(newPosition, newPosition);
                editor.revealRange(new vscode.Range(newPosition, newPosition));
                
                // 元の行（移動前）をtoggle
                const filePath = document.uri.fsPath;
                const targetFolder = await this.storage.getValidLastedFolder();
                const isAdded = await this.syntaxHighlightManager.toggleLine(
                    targetFolder,
                    filePath,
                    currentLine + 1 // 1ベース
                );
                
                // ツリーを更新
                this.treeProvider.refresh();
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to toggle syntax highlight: ${error}`);
        }
    }
}