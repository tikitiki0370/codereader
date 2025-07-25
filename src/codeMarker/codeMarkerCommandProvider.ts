import * as vscode from 'vscode';
import { CodeMarkerStorage } from './codeMarkerStorage';
import { DiagnosticsManager } from './diagnosticsManager';
import { CodeMarkerTreeProvider } from './codeMarkerTreeProvider';
import { DiagnosticsTypes } from './types';

/**
 * CodeMarker機能のコマンド処理を管理するクラス
 */
export class CodeMarkerCommandProvider {
    constructor(
        private storage: CodeMarkerStorage,
        private diagnosticsManager: DiagnosticsManager,
        private treeProvider: CodeMarkerTreeProvider,
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
            vscode.commands.registerCommand('codereader.clearAllDiagnostics', this.clearAllDiagnostics.bind(this)),
            vscode.commands.registerCommand('codereader.createCodeMarkerFolder', this.createCodeMarkerFolder.bind(this)),
            vscode.commands.registerCommand('codereader.createCodeMarkerSubFolder', this.createCodeMarkerSubFolder.bind(this)),
            vscode.commands.registerCommand('codereader.renameCodeMarkerFolder', this.renameCodeMarkerFolder.bind(this)),
            vscode.commands.registerCommand('codereader.deleteCodeMarkerFolder', this.deleteCodeMarkerFolder.bind(this)),
            vscode.commands.registerCommand('codereader.deleteCodeMarkerDiagnostics', this.deleteCodeMarkerDiagnostics.bind(this)),
            vscode.commands.registerCommand('codereader.openDiagnosticsLocation', this.openDiagnosticsLocation.bind(this))
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
}