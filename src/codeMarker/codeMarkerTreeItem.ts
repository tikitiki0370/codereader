import * as vscode from 'vscode';
import * as path from 'path';
import { CodeMarkerDiagnostics, DiagnosticsTypes, CodeMarkerLineHighlight, CodeMarkerSyntaxHighlight } from './types';

export class CodeMarkerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: 'folder' | 'diagnostics' | 'lineHighlight' | 'syntaxHighlight',
        public readonly folderPath?: string,
        public readonly filePath?: string,
        public readonly diagnostics?: CodeMarkerDiagnostics,
        public readonly folder?: string,
        public readonly highlight?: CodeMarkerLineHighlight,
        public readonly syntaxHighlight?: CodeMarkerSyntaxHighlight
    ) {
        super(label, collapsibleState);
        
        this.tooltip = this.getTooltip();
        this.description = this.getDescription();
        this.contextValue = this.getContextValue();
        this.iconPath = this.getIconPath();
        this.command = this.getCommand();
    }
    
    private getTooltip(): string {
        switch (this.itemType) {
            case 'folder':
                return `Folder: ${this.label}`;
            case 'diagnostics':
                if (this.diagnostics) {
                    const fileName = this.filePath ? path.basename(this.filePath) : 'Unknown file';
                    return `${this.diagnostics.type}: ${this.diagnostics.text}\nFile: ${fileName}\nLine: ${this.diagnostics.Lines.startLine}-${this.diagnostics.Lines.endLine}`;
                }
                return 'Diagnostics';
            case 'lineHighlight':
                if (this.highlight) {
                    const fileName = this.filePath ? path.basename(this.filePath) : 'Unknown file';
                    const lines = this.highlight.Lines.map(line => 
                        line.startLine === line.endLine ? `${line.startLine}` : `${line.startLine}-${line.endLine}`
                    ).join(', ');
                    return `Line Highlight\nFile: ${fileName}\nLines: ${lines}\nColor: ${this.highlight.color}`;
                }
                return 'Line Highlight';
            case 'syntaxHighlight':
                if (this.syntaxHighlight) {
                    const fileName = this.filePath ? path.basename(this.filePath) : 'Unknown file';
                    const lines = this.syntaxHighlight.Lines.join(', ');
                    return `Syntax Highlight\nFile: ${fileName}\nLines: ${lines}`;
                }
                return 'Syntax Highlight';
            default:
                return this.label;
        }
    }
    
    private getDescription(): string | undefined {
        // descriptionはcodeMarkerTreeProvider.tsで直接設定するため、ここでは何も返さない
        return undefined;
    }
    
    private getContextValue(): string {
        switch (this.itemType) {
            case 'folder':
                return 'codeMarkerFolder';
            case 'diagnostics':
                return 'codeMarkerDiagnostics';
            case 'lineHighlight':
                return 'codeMarkerLineHighlight';
            case 'syntaxHighlight':
                return 'codeMarkerSyntaxHighlight';
            default:
                return '';
        }
    }
    
    private getIconPath(): vscode.ThemeIcon {
        switch (this.itemType) {
            case 'folder':
                return new vscode.ThemeIcon('folder');
            case 'diagnostics':
                if (this.diagnostics) {
                    switch (this.diagnostics.type) {
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
                }
                return new vscode.ThemeIcon('symbol-misc');
            case 'lineHighlight':
                return new vscode.ThemeIcon('symbol-color', new vscode.ThemeColor('textPreformat.foreground'));
            case 'syntaxHighlight':
                return new vscode.ThemeIcon('eye-closed', new vscode.ThemeColor('disabledForeground'));
            default:
                return new vscode.ThemeIcon('symbol-misc');
        }
    }
    
    private getCommand(): vscode.Command | undefined {
        switch (this.itemType) {
            case 'diagnostics':
                if (this.diagnostics && this.filePath) {
                    return {
                        command: 'codereader.openDiagnosticsLocation',
                        title: 'Open Location',
                        arguments: [this.diagnostics, this.filePath]
                    };
                }
                return undefined;
            case 'lineHighlight':
                if (this.highlight && this.filePath) {
                    return {
                        command: 'codereader.openLineHighlightLocation',
                        title: 'Open Location',
                        arguments: [this.highlight, this.filePath]
                    };
                }
                return undefined;
            case 'syntaxHighlight':
                if (this.syntaxHighlight && this.filePath) {
                    return {
                        command: 'codereader.openSyntaxHighlightLocation',
                        title: 'Open Location',
                        arguments: [this.syntaxHighlight, this.filePath]
                    };
                }
                return undefined;
            default:
                return undefined;
        }
    }
}