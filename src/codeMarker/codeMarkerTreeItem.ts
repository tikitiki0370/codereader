import * as vscode from 'vscode';
import * as path from 'path';
import { CodeMarkerDiagnostics, DiagnosticsTypes } from './types';

export class CodeMarkerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: 'folder' | 'diagnostics',
        public readonly folderPath?: string,
        public readonly filePath?: string,
        public readonly diagnostics?: CodeMarkerDiagnostics,
        public readonly folder?: string
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
            default:
                return undefined;
        }
    }
}