import * as vscode from 'vscode';
import { CodeCopyConfigManager } from './codeCopyConfig';

export class CodeCopy {
    
    static async copySelectedLines(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showErrorMessage('No code selected');
            return;
        }

        const document = editor.document;
        const selectedText = document.getText(selection);
        const startLine = selection.start.line + 1; // 1-based line numbers
        const endLine = selection.end.line + 1; // 1-based line numbers
        
        // Always use relative path from workspace root
        const filepath = vscode.workspace.asRelativePath(document.uri);
        
        // Get language ID from VS Code (e.g., 'typescript', 'python', 'javascript')
        const codetype = document.languageId;

        const format = CodeCopyConfigManager.getFormat();
        const formattedText = CodeCopy.formatText(format, {
            filepath,
            startLine: startLine.toString(),
            endLine: endLine.toString(),
            code: selectedText,
            codetype
        });

        await vscode.env.clipboard.writeText(formattedText);
        vscode.window.showInformationMessage(`Copied ${endLine - startLine + 1} lines to clipboard`);
    }

    private static formatText(format: string, replacements: Record<string, string>): string {
        let result = format;
        for (const [key, value] of Object.entries(replacements)) {
            result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        return result;
    }

    static registerCommands(context: vscode.ExtensionContext): void {
        const copyCommand = vscode.commands.registerCommand('codereader.codeCopy', CodeCopy.copySelectedLines);
        
        context.subscriptions.push(copyCommand);
    }
}