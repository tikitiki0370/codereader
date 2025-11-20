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
        
        // Expand selection to include full lines
        // Start from the beginning of the start line (column 0)
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        
        // Get the full line range
        const startPosition = new vscode.Position(startLine, 0);
        const endPosition = document.lineAt(endLine).range.end;
        const fullLineRange = new vscode.Range(startPosition, endPosition);
        
        // Get the text of the full lines
        const selectedText = document.getText(fullLineRange);
        
        // Convert to 1-based line numbers for display
        const displayStartLine = startLine + 1;
        const displayEndLine = endLine + 1;
        
        // Always use relative path from workspace root
        const filepath = vscode.workspace.asRelativePath(document.uri);
        
        // Get language ID from VS Code (e.g., 'typescript', 'python', 'javascript')
        const codetype = document.languageId;

        const format = CodeCopyConfigManager.getFormat();
        const formattedText = CodeCopy.formatText(format, {
            filepath,
            startLine: displayStartLine.toString(),
            endLine: displayEndLine.toString(),
            code: selectedText,
            codetype
        });

        await vscode.env.clipboard.writeText(formattedText);
        vscode.window.showInformationMessage(`Copied ${displayEndLine - displayStartLine + 1} lines to clipboard`);
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