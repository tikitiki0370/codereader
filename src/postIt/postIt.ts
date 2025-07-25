import * as vscode from 'vscode';
import { PostItStorage } from './postItStorage';
import { PostItTreeProvider } from './postItTreeProvider';
import { PostItCodeLensProvider } from './postItCodeLensProvider';
import { PostItFoldingProvider } from './postItFoldingProvider';

/**
 * PostIt機能の統括クラス
 * 各プロバイダーを管理し、統合的なインターフェースを提供
 */
export class PostItManager {
    private treeProvider: PostItTreeProvider;
    private codeLensProvider: PostItCodeLensProvider;
    private foldingProvider: PostItFoldingProvider;
    
    constructor(private storage: PostItStorage) {
        this.treeProvider = new PostItTreeProvider(storage);
        this.codeLensProvider = new PostItCodeLensProvider(storage);
        this.foldingProvider = new PostItFoldingProvider(storage);
    }

    /**
     * VS Code拡張にプロバイダーを登録
     */
    registerProviders(context: vscode.ExtensionContext): void {
        // TreeDataProvider を登録
        vscode.window.registerTreeDataProvider('codeReaderPostIt', this.treeProvider);

        // ドラッグ&ドロップ機能付きTreeViewを登録
        vscode.window.createTreeView('codeReaderPostIt', {
            treeDataProvider: this.treeProvider,
            dragAndDropController: this.treeProvider
        });

        // CodeLensProvider を登録
        const codeLensDisposable = vscode.languages.registerCodeLensProvider('*', this.codeLensProvider);
        
        // FoldingRangeProvider を登録
        const foldingDisposable = vscode.languages.registerFoldingRangeProvider('*', this.foldingProvider);

        // Disposableをコンテキストに追加
        context.subscriptions.push(codeLensDisposable, foldingDisposable);
    }

    /**
     * 全てのプロバイダーを更新
     */
    refresh(): void {
        this.treeProvider.refresh();
        this.codeLensProvider.refresh();
        this.foldingProvider.refresh();
    }

    /**
     * TreeProviderを取得
     */
    getTreeProvider(): PostItTreeProvider {
        return this.treeProvider;
    }

    /**
     * CodeLensProviderを取得
     */
    getCodeLensProvider(): PostItCodeLensProvider {
        return this.codeLensProvider;
    }

    /**
     * FoldingProviderを取得
     */
    getFoldingProvider(): PostItFoldingProvider {
        return this.foldingProvider;
    }
}

// 後方互換性のため、従来のPostItProviderもエクスポート
export const PostItProvider = PostItTreeProvider;