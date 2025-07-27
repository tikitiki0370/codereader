import * as vscode from 'vscode';
import { PostItManager, PostItStorage, PostItCommandProvider, PostItTreeView } from './postIt';
import { QuickMemoStorage, QuickMemoTreeView, QuickMemoCommandProvider } from './quickMemo';
import { StateController } from './stateController';
import { CodeCopy } from './codeCopy';
import { CodeMarkerStorage, DiagnosticsManager, LineHighlightManager, SyntaxHighlightManager, CodeMarkerTreeView, CodeMarkerCommandProvider } from './codeMarker';

export async function activate(context: vscode.ExtensionContext) {
	console.log('Extension activate called');
	console.log('Context storageUri:', context.storageUri?.toString());
	console.log('Workspace folders:', vscode.workspace.workspaceFolders?.map(f => f.uri.toString()));
	
	// データベースコントローラーを初期化
	let stateController: StateController;
	let postItStorage: PostItStorage;
	let quickMemoStorage: QuickMemoStorage;
	let codeMarkerStorage: CodeMarkerStorage;
	let diagnosticsManager: DiagnosticsManager;
	let lineHighlightManager: LineHighlightManager;
	let syntaxHighlightManager: SyntaxHighlightManager;
	
	// PostIt用のGutter Decorationを作成
	const postItDecorationType = vscode.window.createTextEditorDecorationType({
		gutterIconPath: context.asAbsolutePath('resources/postit-icon.svg'),
		gutterIconSize: 'contain',
		rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen
	});

	
	try {
		stateController = StateController.getInstance(context);
		await stateController.initialize();
		console.log('StateController initialized successfully');
		console.log('Storage location:', context.storageUri?.toString());
		
		// PostItStorageを初期化
		postItStorage = new PostItStorage(stateController);
		
		// QuickMemoStorageを初期化
		quickMemoStorage = new QuickMemoStorage(stateController, context);
		await quickMemoStorage.initialize();
		console.log('QuickMemoStorage initialized successfully');
		
		// CodeMarkerStorageを初期化
		codeMarkerStorage = new CodeMarkerStorage(stateController);
		
		// DiagnosticsManagerを初期化
		diagnosticsManager = new DiagnosticsManager(codeMarkerStorage, context);
		
		// LineHighlightManagerを初期化
		lineHighlightManager = new LineHighlightManager(codeMarkerStorage, context);
		
		// SyntaxHighlightManagerを初期化
		syntaxHighlightManager = new SyntaxHighlightManager(codeMarkerStorage, context);
		
		console.log('CodeMarker initialized successfully');
	} catch (error) {
		console.error('Failed to initialize StateController:', error);
		vscode.window.showErrorMessage('Failed to initialize database: ' + error);
		return;
	}

	// PostIt統括マネージャーを作成・登録
	const postItManager = new PostItManager(postItStorage);
	postItManager.registerProviders(context);

	// QuickMemoTreeViewを作成・登録（新しいBaseTreeProvider使用版）
	const quickMemoTreeView = new QuickMemoTreeView(quickMemoStorage);
	vscode.window.createTreeView('codeReaderQuickMemo', {
		treeDataProvider: quickMemoTreeView,
		dragAndDropController: quickMemoTreeView
	});

	// CodeMarkerTreeViewを登録（新しいBaseTreeProvider使用版）
	const codeMarkerTreeView = new CodeMarkerTreeView(codeMarkerStorage);
	vscode.window.createTreeView('codeReaderCodeMarker', {
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

	const codeMarkerCommandProvider = new CodeMarkerCommandProvider(
		codeMarkerStorage,
		diagnosticsManager,
		lineHighlightManager,
		syntaxHighlightManager,
		codeMarkerTreeView,
		context
	);

	// コマンドを登録
	const postItCommands = postItCommandProvider.registerCommands();
	const quickMemoCommands = quickMemoCommandProvider.registerCommands();
	const codeMarkerCommands = codeMarkerCommandProvider.registerCommands();

	// CodeCopyコマンドを登録（既存）
	CodeCopy.registerCommands(context);

	// PostIt gutter decorationとCodeLensの更新
	async function updatePostItDecorations(editor?: vscode.TextEditor) {
		await postItCommandProvider.updatePostItDecorations(editor);
	}

	function updateCodeLens() {
		postItCommandProvider.updateCodeLens();
	}

	// エディタ変更時にdecorationとCodeLensを更新
	const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
		updatePostItDecorations(editor);
		updateCodeLens();
	});
	
	// 初回のdecoration更新
	updatePostItDecorations();
	updateCodeLens();

	// 全てのsubscriptionsに追加
	context.subscriptions.push(
		...postItCommands,
		...quickMemoCommands,
		...codeMarkerCommands,
		onDidChangeActiveEditor,
		postItDecorationType
	);
}

export function deactivate() {
	StateController.dispose();
}