import * as vscode from 'vscode';
import { CodeMarkerStorage } from './codeMarkerStorage';
import { CodeMarkerDiagnostics, DiagnosticsTypes } from './types';

export class DiagnosticsManager {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private diagnosticsMap: Map<string, Map<string, { folder: string; diagnostics: CodeMarkerDiagnostics }>> = new Map();
    
    constructor(
        private storage: CodeMarkerStorage,
        context: vscode.ExtensionContext
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('codeMarker');
        context.subscriptions.push(this.diagnosticCollection);
        
        // 初期化時に既存のDiagnosticsを読み込む
        this.loadAllDiagnostics();
    }
    
    // 全てのDiagnosticsを読み込んで表示
    async loadAllDiagnostics(): Promise<void> {
        const allDiagnostics = await this.storage.getAllDiagnostics();
        
        // 一旦クリア
        this.diagnosticCollection.clear();
        this.diagnosticsMap.clear();
        
        // ファイルごとにDiagnosticsを統合
        const fileMap = new Map<string, { vsDiagnostics: vscode.Diagnostic[], diagMap: Map<string, { folder: string; diagnostics: CodeMarkerDiagnostics }> }>();
        
        for (const { folder, filePath, diagnostics } of allDiagnostics) {
            if (!fileMap.has(filePath)) {
                fileMap.set(filePath, {
                    vsDiagnostics: [],
                    diagMap: new Map()
                });
            }
            
            const fileData = fileMap.get(filePath)!;
            
            for (const diag of diagnostics) {
                const range = new vscode.Range(
                    diag.Lines.startLine - 1,  // 1ベースから0ベースに変換
                    diag.Lines.startColumn,
                    diag.Lines.endLine - 1,
                    diag.Lines.endColumn
                );
                
                const severity = this.getSeverity(diag.type);
                const vsDiag = new vscode.Diagnostic(range, diag.text, severity);
                vsDiag.source = 'CodeMarker';
                
                fileData.vsDiagnostics.push(vsDiag);
                fileData.diagMap.set(diag.id, { folder, diagnostics: diag });
            }
        }
        
        // ファイルごとにDiagnosticsを設定
        for (const [filePath, fileData] of fileMap) {
            const uri = vscode.Uri.file(filePath);
            this.diagnosticCollection.set(uri, fileData.vsDiagnostics);
            this.diagnosticsMap.set(filePath, fileData.diagMap);
        }
    }
    
    // Diagnosticsを追加（フォルダ指定）
    async addDiagnosticsToFolder(
        folder: string,
        filePath: string,
        type: DiagnosticsTypes,
        text: string,
        startLine: number,
        endLine: number,
        startColumn: number,
        endColumn: number,
        selectedText: string
    ): Promise<void> {
        const newDiag = await this.storage.addDiagnosticsToFolder(folder, filePath, {
            type,
            text,
            Lines: {
                startLine,
                endLine,
                startColumn,
                endColumn,
                text: selectedText
            }
        });
        
        // 該当ファイルのDiagnosticsを再読み込み
        await this.refreshFileDiagnostics(filePath);
    }
    
    // 特定のファイルのDiagnosticsを更新
    async refreshFileDiagnostics(filePath: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);
        
        // 全フォルダから該当ファイルのDiagnosticsを取得
        const diagnostics = await this.storage.getDiagnosticsByFile(filePath);
        
        if (diagnostics.length === 0) {
            this.diagnosticCollection.delete(uri);
            this.diagnosticsMap.delete(filePath);
            return;
        }
        
        const vsDiagnostics: vscode.Diagnostic[] = [];
        const diagMap = new Map<string, { folder: string; diagnostics: CodeMarkerDiagnostics }>();
        
        // 各フォルダからDiagnosticsを取得してフォルダ情報も保持
        const allDiagnosticsWithFolder = await this.storage.getAllDiagnostics();
        const fileRelatedDiagnostics = allDiagnosticsWithFolder.filter(item => item.filePath === filePath);
        
        for (const { folder, diagnostics: folderDiagnostics } of fileRelatedDiagnostics) {
            for (const diag of folderDiagnostics) {
                const range = new vscode.Range(
                    diag.Lines.startLine - 1,  // 1ベースから0ベースに変換
                    diag.Lines.startColumn,
                    diag.Lines.endLine - 1,
                    diag.Lines.endColumn
                );
                
                const severity = this.getSeverity(diag.type);
                const vsDiag = new vscode.Diagnostic(range, diag.text, severity);
                vsDiag.source = 'CodeMarker';
                
                vsDiagnostics.push(vsDiag);
                diagMap.set(diag.id, { folder, diagnostics: diag });
            }
        }
        
        this.diagnosticCollection.set(uri, vsDiagnostics);
        this.diagnosticsMap.set(filePath, diagMap);
    }
    
    // Diagnosticsを削除
    async deleteDiagnostics(folder: string, filePath: string, id: string): Promise<void> {
        await this.storage.deleteDiagnostics(folder, filePath, id);
        await this.refreshFileDiagnostics(filePath);
    }
    
    // 全てのDiagnosticsをクリア
    async clearAllDiagnostics(): Promise<void> {
        await this.storage.clearAllDiagnostics();
        this.diagnosticCollection.clear();
        this.diagnosticsMap.clear();
    }
    
    // フォルダごとにDiagnosticsをクリア
    async clearDiagnosticsByFolder(folder: string): Promise<void> {
        await this.storage.clearDiagnosticsByFolder(folder);
        // 全ファイルを再読み込み（影響を受けたファイルのみ更新するのは複雑なため）
        await this.loadAllDiagnostics();
    }
    
    // DiagnosticsTypeからVSCodeのDiagnosticSeverityに変換
    private getSeverity(type: DiagnosticsTypes): vscode.DiagnosticSeverity {
        switch (type) {
            case DiagnosticsTypes.Error:
                return vscode.DiagnosticSeverity.Error;
            case DiagnosticsTypes.Warning:
                return vscode.DiagnosticSeverity.Warning;
            case DiagnosticsTypes.Info:
                return vscode.DiagnosticSeverity.Information;
            case DiagnosticsTypes.Hint:
                return vscode.DiagnosticSeverity.Hint;
            default:
                return vscode.DiagnosticSeverity.Information;
        }
    }
    
    // 現在のカーソル位置のDiagnosticsを取得
    getDiagnosticsAtPosition(document: vscode.TextDocument, position: vscode.Position): { folder: string; diagnostics: CodeMarkerDiagnostics }[] {
        const filePath = document.uri.fsPath;
        const diagMap = this.diagnosticsMap.get(filePath);
        
        if (!diagMap) {
            return [];
        }
        
        const result: { folder: string; diagnostics: CodeMarkerDiagnostics }[] = [];
        
        for (const [id, { folder, diagnostics }] of diagMap) {
            const range = new vscode.Range(
                diagnostics.Lines.startLine - 1,
                diagnostics.Lines.startColumn,
                diagnostics.Lines.endLine - 1,
                diagnostics.Lines.endColumn
            );
            
            if (range.contains(position)) {
                result.push({ folder, diagnostics });
            }
        }
        
        return result;
    }
}