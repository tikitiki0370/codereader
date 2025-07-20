import * as vscode from 'vscode';
import { PostItProvider } from './postIt/postIt';
import { StateController } from './stateController';
import { PostItStorage, PostItViewType } from './postIt/postItStorage';

export async function activate(context: vscode.ExtensionContext) {
	console.log('Extension activate called');
	console.log('Context storageUri:', context.storageUri?.toString());
	console.log('Workspace folders:', vscode.workspace.workspaceFolders?.map(f => f.uri.toString()));
	
	// データベースコントローラーを初期化
	let stateController: StateController;
	let postItStorage: PostItStorage;
	
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
		
		// PostItStorageを初期化
		postItStorage = new PostItStorage(stateController);
	} catch (error) {
		console.error('Failed to initialize StateController:', error);
		vscode.window.showErrorMessage('Failed to initialize database: ' + error);
		return;
	}

	// 各ビューにそれぞれ別のTreeDataProviderを登録
	const postItProvider = new PostItProvider(postItStorage);

	vscode.window.registerTreeDataProvider('codeReaderPostIt', postItProvider);
	vscode.window.registerTreeDataProvider('codeReaderPostIta', postItProvider);

	// PostIt gutter decoration機能
	async function updatePostItDecorations(editor?: vscode.TextEditor) {
		if (!editor) {
			editor = vscode.window.activeTextEditor;
		}
		
		if (!editor) {
			return;
		}

		try {
			// 現在のファイルに関連するPostItを取得
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
			const filePath = workspaceFolder 
				? vscode.workspace.asRelativePath(editor.document.uri)
				: editor.document.fileName;

			const postIts = await postItStorage.getNotesByFile(filePath);
			
			// PostItがある行のdecorationを作成
			const decorationRanges: vscode.Range[] = postIts.map(postIt => {
				const line = postIt.Lines.line - 1; // 1ベースから0ベースに変換
				return new vscode.Range(
					new vscode.Position(line, 0),
					new vscode.Position(line, 0)
				);
			});

			// decorationを適用
			editor.setDecorations(postItDecorationType, decorationRanges);
			
			console.log(`Updated PostIt decorations for ${filePath}: ${decorationRanges.length} PostIts`);
		} catch (error) {
			console.error('Failed to update PostIt decorations:', error);
		}
	}

	// エディタ変更時にdecorationを更新
	const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(updatePostItDecorations);
	
	// 初回のdecoration更新
	updatePostItDecorations();

	// テストコマンドを実装
	const addTestDataCommand = vscode.commands.registerCommand('codereader.addTestData', async () => {
		try {
			const newNote = await postItStorage.addNote({
				title: `Test Note ${Date.now()}`,
				corlor: ['yellow', 'red', 'blue', 'green', 'purple', 'orange'][Math.floor(Math.random() * 6)],
				Lines: {
					file: '/test/example.ts',
					line: Math.floor(Math.random() * 100) + 1,
					text: 'console.log("Hello World");'
				},
				ViewType: PostItViewType.Line
			});
			
			vscode.window.showInformationMessage(`PostIt note created: ${newNote.title} (ID: ${newNote.id})`);
		
		// サイドバーを更新
		postItProvider.refresh();
		
		// Gutter decorationを更新
		updatePostItDecorations();
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create PostIt note: ${error}`);
		}
	});
	
	const showTestDataCommand = vscode.commands.registerCommand('codereader.showTestData', async () => {
		try {
			const notes = await postItStorage.getAllNotes();
			
			if (notes.length === 0) {
				vscode.window.showInformationMessage('No PostIt notes found');
				return;
			}
			
			const message = notes.map(note => 
				`- ${note.title} (Color: ${note.corlor}, Line: ${note.Lines.line}, Type: ${note.ViewType})`
			).join('\n');
			
			vscode.window.showInformationMessage(`Found ${notes.length} PostIt notes:\n${message}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to load PostIt notes: ${error}`);
		}
	});

	// エディタでPostItを作成するコマンドを実装
	const createPostItCommand = vscode.commands.registerCommand('codereader.createPostIt', async () => {
		try {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage('No active editor found');
				return;
			}

			const document = editor.document;
			const selection = editor.selection;
			
			// ファイル名をタイトルとして使用（パスの最後の部分のみ）
			const fileName = document.fileName.split('/').pop() || document.fileName;
			
			// ワークスペース相対パスを取得
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
			const filePath = workspaceFolder 
				? vscode.workspace.asRelativePath(document.uri)
				: document.fileName;
			
			// カーソル位置または選択範囲の開始行を取得
			let targetLine: number;
			let lineText: string;
			
			if (!selection.isEmpty) {
				// 選択範囲がある場合は開始行を使用
				targetLine = selection.start.line;
				lineText = document.lineAt(targetLine).text;
			} else {
				// 選択範囲がない場合はカーソル位置の行
				const cursorPosition = selection.active;
				targetLine = cursorPosition.line;
				lineText = document.lineAt(targetLine).text;
				
				console.log(`Creating PostIt for cursor position:`, {
					file: filePath,
					vscodeLine: targetLine, // VSCode内部の行番号（0ベース）
					displayLine: targetLine + 1, // 表示用行番号（1ベース）
					text: lineText.substring(0, 50) + (lineText.length > 50 ? '...' : '')
				});
			}

			// PostItを作成
			const newNote = await postItStorage.addNote({
				title: fileName,
				corlor: 'yellow', // デフォルト色
				Lines: {
					file: filePath,
					line: targetLine + 1, // 1ベース行番号で保存
					text: lineText
				},
				ViewType: PostItViewType.Line
			});

			vscode.window.showInformationMessage(`PostIt created: ${newNote.title}`);
			
			// サイドバーを更新
			postItProvider.refresh();
			
			// Gutter decorationを更新
			updatePostItDecorations();

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create PostIt: ${error}`);
		}
	});

	// 行番号の右クリックからPostItを作成するコマンドを実装
	const createPostItAtLineCommand = vscode.commands.registerCommand('codereader.createPostItAtLine', async (uri: vscode.Uri, lineNumber: number) => {
		try {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.uri.toString() !== uri.toString()) {
				vscode.window.showWarningMessage('Active editor does not match the file');
				return;
			}

			const document = editor.document;
			
			// ファイル名をタイトルとして使用（パスの最後の部分のみ）
			const fileName = document.fileName.split('/').pop() || document.fileName;
			
			// ワークスペース相対パスを取得
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
			const filePath = workspaceFolder 
				? vscode.workspace.asRelativePath(document.uri)
				: document.fileName;
			
			// 指定された行番号（0ベース）のテキストを取得
			const lineText = document.lineAt(lineNumber).text;
			
			console.log(`Creating PostIt at specific line:`, {
				file: filePath,
				vscodeLineNumber: lineNumber, // VSCode内部の行番号（0ベース）
				displayLine: lineNumber + 1, // 表示用行番号（1ベース）
				text: lineText.substring(0, 50) + (lineText.length > 50 ? '...' : '')
			});

			// PostItを作成
			const newNote = await postItStorage.addNote({
				title: fileName,
				corlor: 'yellow', // デフォルト色
				Lines: {
					file: filePath,
					line: lineNumber + 1, // 1ベース行番号で保存
					text: lineText
				},
				ViewType: PostItViewType.Line
			});

			vscode.window.showInformationMessage(`PostIt created at line ${lineNumber + 1}: ${newNote.title}`);
			
			// サイドバーを更新
			postItProvider.refresh();
			
			// Gutter decorationを更新
			updatePostItDecorations();

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create PostIt: ${error}`);
		}
	});

	// PostItデータを全削除するコマンドを実装
	const clearAllPostItsCommand = vscode.commands.registerCommand('codereader.clearAllPostIts', async () => {
		try {
			// 確認ダイアログを表示
			const answer = await vscode.window.showWarningMessage(
				'すべてのPostItを削除しますか？この操作は元に戻せません。',
				{ modal: true },
				'削除',
				'キャンセル'
			);

			if (answer !== '削除') {
				return;
			}

			// PostItNoteのみ削除（フォルダ構造とConfigは保持）
			await postItStorage.clearAllNotes();
			
			vscode.window.showInformationMessage('すべてのPostItを削除しました');
			
			// サイドバーを更新
			postItProvider.refresh();
			
			// Gutter decorationを更新
			updatePostItDecorations();

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to clear PostIts: ${error}`);
		}
	});

	context.subscriptions.push(
		addTestDataCommand, 
		showTestDataCommand, 
		createPostItCommand, 
		createPostItAtLineCommand, 
		clearAllPostItsCommand,
		onDidChangeActiveEditor,
		postItDecorationType
	);
}

export function deactivate() {
	StateController.dispose();
}
