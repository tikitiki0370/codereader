import * as vscode from 'vscode';

export interface CodeCopyConfig {
    format: string;
}

export class CodeCopyConfigManager {
    private static readonly CONFIG_SECTION = 'codereader';
    private static readonly DEFAULT_FORMAT = '`{filepath}` {startLine}行目～{endLine}行目\n```{codetype}\n{code}\n```';

    static getFormat(): string {
        const config = vscode.workspace.getConfiguration(CodeCopyConfigManager.CONFIG_SECTION);
        const format = config.get<string>('codeCopy.format') || CodeCopyConfigManager.DEFAULT_FORMAT;
        // Convert escaped newlines to actual newlines
        return format.replace(/\\n/g, '\n');
    }

    static getDefaultFormat(): string {
        return CodeCopyConfigManager.DEFAULT_FORMAT;
    }
}