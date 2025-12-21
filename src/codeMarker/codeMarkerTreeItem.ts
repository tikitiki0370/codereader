import * as vscode from 'vscode';
import * as path from 'path';
import { BaseTreeItem } from '../modules';
import { CodeMarkerDiagnostics, DiagnosticsTypes, CodeMarkerLineHighlight, CodeMarkerSyntaxHighlight } from './types';

// データ型の定義をまとめる
type CodeMarkerDataItem =
    | { type: 'diagnostics'; data: CodeMarkerDiagnostics; filePath: string; folder: string }
    | { type: 'lineHighlight'; data: CodeMarkerLineHighlight; filePath: string; folder: string }
    | { type: 'syntaxHighlight'; data: CodeMarkerSyntaxHighlight; filePath: string; folder: string };

export class CodeMarkerTreeItem extends BaseTreeItem<CodeMarkerDataItem> {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        // プロパティとして定義せず引数として受け取る
        itemType: 'folder' | 'diagnostics' | 'lineHighlight' | 'syntaxHighlight',
        public readonly folderPath?: string,
        // 引数として受け取り、内部でデータオブジェクトに変換
        filePath?: string,
        diagnostics?: CodeMarkerDiagnostics,
        folder?: string,
        highlight?: CodeMarkerLineHighlight,
        syntaxHighlight?: CodeMarkerSyntaxHighlight
    ) {
        // データオブジェクトを構築
        let data: CodeMarkerDataItem | undefined;
        if (itemType === 'diagnostics' && diagnostics && filePath && folder) {
            data = { type: 'diagnostics', data: diagnostics, filePath, folder };
        } else if (itemType === 'lineHighlight' && highlight && filePath && folder) {
            data = { type: 'lineHighlight', data: highlight, filePath, folder };
        } else if (itemType === 'syntaxHighlight' && syntaxHighlight && filePath && folder) {
            data = { type: 'syntaxHighlight', data: syntaxHighlight, filePath, folder };
        }

        super(
            label,
            collapsibleState,
            itemType === 'folder' ? 'folder' : 'data',
            folderPath,
            data
        );
    }

    // プロパティアクセサ（既存コードとの互換性維持）
    get filePath(): string | undefined { return this.data?.filePath; }
    get folder(): string | undefined { return this.data?.folder; }
    get diagnostics(): CodeMarkerDiagnostics | undefined {
        return this.data?.type === 'diagnostics' ? this.data.data : undefined;
    }
    get highlight(): CodeMarkerLineHighlight | undefined {
        return this.data?.type === 'lineHighlight' ? this.data.data : undefined;
    }
    get syntaxHighlight(): CodeMarkerSyntaxHighlight | undefined {
        return this.data?.type === 'syntaxHighlight' ? this.data.data : undefined;
    }

    protected getFolderContextValue(): string {
        return 'codeMarkerFolder';
    }

    protected getUriScheme(): string {
        return 'codemarker-folder';
    }

    protected getDataTooltip(): string {
        if (!this.data) return '';
        const fileName = path.basename(this.data.filePath);

        switch (this.data.type) {
            case 'diagnostics':
                return `${this.data.data.type}: ${this.data.data.text}\nFile: ${fileName}\nLine: ${this.data.data.Lines.startLine}-${this.data.data.Lines.endLine}`;
            case 'lineHighlight':
                const lines = this.data.data.Lines.map(line => 
                    line.startLine === line.endLine ? `${line.startLine}` : `${line.startLine}-${line.endLine}`
                ).join(', ');
                return `Line Highlight\nFile: ${fileName}\nLines: ${lines}\nColor: ${this.data.data.color}`;
            case 'syntaxHighlight':
                const synLines = this.data.data.Lines.join(', ');
                return `Syntax Highlight\nFile: ${fileName}\nLines: ${synLines}`;
        }
    }

    protected getDataDescription(): string | undefined {
        // codeMarkerTreeProvider.tsで設定されるため、デフォルトではundefined
        return undefined;
    }

    protected getDataContextValue(): string {
        if (!this.data) return '';
        switch (this.data.type) {
            case 'diagnostics': return 'codeMarkerDiagnostics';
            case 'lineHighlight': return 'codeMarkerLineHighlight';
            case 'syntaxHighlight': return 'codeMarkerSyntaxHighlight';
        }
    }

    protected getDataIcon(): vscode.ThemeIcon {
        if (!this.data) return new vscode.ThemeIcon('symbol-misc');
        
        switch (this.data.type) {
            case 'diagnostics':
                switch (this.data.data.type) {
                    case DiagnosticsTypes.Error:
                        return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                    case DiagnosticsTypes.Warning:
                        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
                    case DiagnosticsTypes.Info:
                        return new vscode.ThemeIcon('info', new vscode.ThemeColor('infoForeground'));
                    case DiagnosticsTypes.Hint:
                        return new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('hintForeground'));
                    default:
                        return new vscode.ThemeIcon('symbol-misc');
                }
            case 'lineHighlight':
                return new vscode.ThemeIcon('symbol-color', new vscode.ThemeColor('textPreformat.foreground'));
            case 'syntaxHighlight':
                return new vscode.ThemeIcon('eye-closed', new vscode.ThemeColor('disabledForeground'));
        }
    }

    protected getDataCommand(): vscode.Command | undefined {
        if (!this.data) return undefined;

        switch (this.data.type) {
            case 'diagnostics':
                return {
                    command: 'codereader.openDiagnosticsLocation',
                    title: 'Open Location',
                    arguments: [this.data.data, this.data.filePath]
                };
            case 'lineHighlight':
                return {
                    command: 'codereader.openLineHighlightLocation',
                    title: 'Open Location',
                    arguments: [this.data.data, this.data.filePath]
                };
            case 'syntaxHighlight':
                return {
                    command: 'codereader.openSyntaxHighlightLocation',
                    title: 'Open Location',
                    arguments: [this.data.data, this.data.filePath]
                };
        }
    }
}