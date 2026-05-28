import * as vscode from 'vscode';
import { PostItManager, PostItStorage, PostItCommandProvider, PostItTreeView } from './postIt';
import { QuickMemoStorage, QuickMemoTreeView, QuickMemoCommandProvider, QuickMemoDecorationManager } from './quickMemo';
import { StateController } from './stateController';
import { CodeCopy } from './codeCopy';
import { CodeMarkerStorage, DiagnosticsManager, LineHighlightManager, SyntaxHighlightManager, CodeMarkerTreeView, CodeMarkerCommandProvider } from './codeMarker';
import { ReadTrackerStorage, ReadTrackerManager, ReadTrackerStatusBar, ReadTrackerCommandProvider } from './readTracker';
import { AgentDocsGenerator } from './modules';

export async function activate(context: vscode.ExtensionContext) {
	// データベースコントローラーを初期化
	let stateController: StateController;
	let postItStorage: PostItStorage;
	let quickMemoStorage: QuickMemoStorage;
	let codeMarkerStorage: CodeMarkerStorage;
	let diagnosticsManager: DiagnosticsManager;
	let lineHighlightManager: LineHighlightManager;
	let syntaxHighlightManager: SyntaxHighlightManager;
	let quickMemoDecorationManager: QuickMemoDecorationManager;
	let readTrackerStorage: ReadTrackerStorage;
	let readTrackerStatusBar: ReadTrackerStatusBar;
	let readTrackerManager: ReadTrackerManager;
	
	// PostIt用のGutter Decorationを作成
	const postItDecorationType = vscode.window.createTextEditorDecorationType({
		gutterIconPath: context.asAbsolutePath('resources/postit-icon.svg'),
		gutterIconSize: 'contain',
		rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen
	});

	
	try {
		stateController = StateController.getInstance(context);

		// PostItStorageを初期化
		postItStorage = new PostItStorage(stateController);

		// QuickMemoStorageを初期化
		quickMemoStorage = new QuickMemoStorage(stateController, context);

		// QuickMemoDecorationManagerを初期化
		quickMemoDecorationManager = new QuickMemoDecorationManager(quickMemoStorage);

		// CodeMarkerStorageを初期化
		codeMarkerStorage = new CodeMarkerStorage(stateController);

		// DiagnosticsManagerを初期化
		diagnosticsManager = new DiagnosticsManager(codeMarkerStorage, context);

		// LineHighlightManagerを初期化
		lineHighlightManager = new LineHighlightManager(codeMarkerStorage, context);

		// SyntaxHighlightManagerを初期化
		syntaxHighlightManager = new SyntaxHighlightManager(codeMarkerStorage, context);

		// ReadTrackerを初期化
		readTrackerStorage = new ReadTrackerStorage(stateController, context);
		readTrackerStatusBar = new ReadTrackerStatusBar(readTrackerStorage);
		readTrackerManager = new ReadTrackerManager(readTrackerStorage, readTrackerStatusBar);

		// LineHighlight連携を設定
		readTrackerManager.setLineHighlightIntegration(lineHighlightManager, codeMarkerStorage);

		// ステータスバーを初期化
		await readTrackerStatusBar.initialize();
	} catch (error) {
		console.error('Failed to initialize StateController:', error);
		vscode.window.showErrorMessage('Failed to initialize database: ' + error);
		return;
	}

	// AIエージェント向けドキュメント生成（非ブロッキング）
	// activate 時には .codereader/ が未作成のことが多いので、初回 save 時の
	// ディレクトリ作成イベントでも再試行する。
	// 「skip」(正常スキップ) は generateIfNeeded 内で return しているので、
	// ここの catch に来るのは実際の失敗 (権限・I/O エラー等) のみ。
	const extensionVersion = context.extension.packageJSON.version;
	const docsGenerator = new AgentDocsGenerator(stateController, extensionVersion);
	docsGenerator.generateIfNeeded().catch(err =>
		console.error('Agent docs generation failed:', err)
	);
	const docsOnDirCreated = stateController.onStorageDirectoryCreated(() => {
		docsGenerator.generateIfNeeded().catch(err =>
			console.error('Agent docs generation failed:', err)
		);
	});

	// PostIt統括マネージャーを作成・登録
	const postItManager = new PostItManager(postItStorage);
	postItManager.registerProviders(context);

	// QuickMemoTreeViewを作成・登録（新しいBaseTreeProvider使用版）
	const quickMemoTreeView = new QuickMemoTreeView(quickMemoStorage);
	const quickMemoTreeViewInstance = vscode.window.createTreeView('codeReaderQuickMemo', {
		treeDataProvider: quickMemoTreeView,
		dragAndDropController: quickMemoTreeView
	});

	// CodeMarkerTreeViewを登録（新しいBaseTreeProvider使用版）
	const codeMarkerTreeView = new CodeMarkerTreeView(codeMarkerStorage);
	const codeMarkerTreeViewInstance = vscode.window.createTreeView('codeReaderCodeMarker', {
		treeDataProvider: codeMarkerTreeView,
		dragAndDropController: codeMarkerTreeView
	});

	// CommandProviderを作成
	const postItCommandProvider = new PostItCommandProvider(
		postItStorage,
		postItManager,
		postItDecorationType,
		context,
		postItManager.getTreeProvider()
	);

	const quickMemoCommandProvider = new QuickMemoCommandProvider(
		quickMemoStorage,
		quickMemoTreeView,
		context
	);
	quickMemoCommandProvider.setTreeView(quickMemoTreeViewInstance);

	const codeMarkerCommandProvider = new CodeMarkerCommandProvider(
		codeMarkerStorage,
		diagnosticsManager,
		lineHighlightManager,
		syntaxHighlightManager,
		codeMarkerTreeView,
		context
	);

	const readTrackerCommandProvider = new ReadTrackerCommandProvider(
		readTrackerManager,
		readTrackerStorage,
		context,
		lineHighlightManager
	);

	// コマンドを登録
	const postItCommands = postItCommandProvider.registerCommands();
	const quickMemoCommands = quickMemoCommandProvider.registerCommands();
	const codeMarkerCommands = codeMarkerCommandProvider.registerCommands();
	const readTrackerCommands = readTrackerCommandProvider.registerCommands();

	// CodeCopyコマンドを登録（既存）
	CodeCopy.registerCommands(context);

	// PostIt gutter decorationとCodeLensの更新
	async function updatePostItDecorations(editor?: vscode.TextEditor) {
		await postItCommandProvider.updatePostItDecorations(editor);
		if (editor) {
			await quickMemoDecorationManager.updateDecorations(editor);
		}
	}

	function updateCodeLens() {
		postItCommandProvider.updateCodeLens();
	}

	// エディタ変更時にdecorationとCodeLensを更新
	// async コールバックの reject を握り潰さないため try/catch で囲む
	const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
		try {
			await updatePostItDecorations(editor);
		} catch (err) {
			console.error('Failed to update PostIt decorations on editor change:', err);
		}
		try {
			updateCodeLens();
		} catch (err) {
			console.error('Failed to update CodeLens on editor change:', err);
		}
	});

	// 外部編集 (AI agentやエディタによる .codereader/*.json の直接編集) を検知して
	// 関連する全UIを再描画する
	const externalChangeDisposable = stateController.onExternalChange(async (toolName) => {
		try {
			if (toolName === 'postIt') {
				postItManager.refresh();
				await updatePostItDecorations(vscode.window.activeTextEditor);
			} else if (toolName === 'quickMemo') {
				quickMemoTreeView.refresh();
				for (const editor of vscode.window.visibleTextEditors) {
					await quickMemoDecorationManager.updateDecorations(editor);
				}
			} else if (toolName === 'codeMarker') {
				codeMarkerTreeView.refresh();
				await diagnosticsManager.loadAllDiagnostics();
				await lineHighlightManager.refresh();
				await syntaxHighlightManager.refresh();
			} else if (toolName === 'readTracker') {
				await readTrackerStatusBar.update();
				const syncEnabled = vscode.workspace
					.getConfiguration('codereader.readTracker')
					.get<boolean>('syncToLineHighlight', false);
				if (syncEnabled) {
					// syncAllToLineHighlight writes to codeMarker.json. The watcher echo is
					// suppressed by StateController's self-write window, so the resulting
					// codeMarker branch above does not fire. If a future refresh path
					// starts writing back, audit this for a potential feedback loop.
					await readTrackerManager.syncAllToLineHighlight();
					await lineHighlightManager.refresh();
				}
			}
		} catch (err) {
			console.error(`Failed to refresh UI after external change to ${toolName}:`, err);
		}
	});

	// 初回のdecoration更新 (失敗してもactivate全体は継続)
	updatePostItDecorations().catch(err =>
		console.error('Initial PostIt decoration update failed:', err)
	);
	try {
		updateCodeLens();
	} catch (err) {
		console.error('Initial CodeLens update failed:', err);
	}

	// 全てのsubscriptionsに追加
	context.subscriptions.push(
		...postItCommands,
		...quickMemoCommands,
		...codeMarkerCommands,
		...readTrackerCommands,
		onDidChangeActiveEditor,
		externalChangeDisposable,
		docsOnDirCreated,
		postItDecorationType,
		quickMemoTreeViewInstance, // TreeView Disposable
		codeMarkerTreeViewInstance, // TreeView Disposable
		quickMemoDecorationManager, // Disposable
		readTrackerStatusBar // Disposable
	);
}

export function deactivate() {
	StateController.dispose();
}