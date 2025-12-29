import * as vscode from 'vscode';
import { PostItStorage } from './postItStorage';
import { PostItTreeView } from './postItTreeView';
import { PostItCodeLensProvider } from './postItCodeLensProvider';
import { PostItFoldingProvider } from './postItFoldingProvider';
import { PostItLineTracker } from './postItLineTracker';

/**
 * PostIt機能の統括クラス
 * 各プロバイダーを管理し、統合的なインターフェースを提供
 */
export class PostItManager {
    private treeProvider: PostItTreeView;
    private codeLensProvider: PostItCodeLensProvider;
    private foldingProvider: PostItFoldingProvider;
    private lineTracker: PostItLineTracker;

    constructor(private storage: PostItStorage) {
        this.treeProvider = new PostItTreeView(storage);
        this.codeLensProvider = new PostItCodeLensProvider(storage);
        this.foldingProvider = new PostItFoldingProvider(storage);
        this.lineTracker = new PostItLineTracker(storage, () => this.refresh());
    }

    /**
     * VS Code拡張にプロバイダーを登録
     */
    registerProviders(context: vscode.ExtensionContext): void {
        // ドラッグ&ドロップ機能付きTreeViewを登録
        vscode.window.createTreeView('codeReaderPostIt', {
            treeDataProvider: this.treeProvider,
            dragAndDropController: this.treeProvider
        });

        // CodeLensProvider を登録
        const codeLensDisposable = vscode.languages.registerCodeLensProvider('*', this.codeLensProvider);

        // FoldingRangeProvider を登録
        const foldingDisposable = vscode.languages.registerFoldingRangeProvider('*', this.foldingProvider);

        // LineTracker を登録（コード変更時のPostIt位置自動追跡）
        const lineTrackerDisposable = this.lineTracker.register();

        // Disposableをコンテキストに追加
        context.subscriptions.push(codeLensDisposable, foldingDisposable, lineTrackerDisposable);
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
    getTreeProvider(): PostItTreeView {
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

// 後方互換性のため、従来のPostItProviderもエクスポート（PostItManagerを参照）
export const PostItProvider = PostItManager;