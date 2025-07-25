import * as vscode from 'vscode';
import { PostItManager, PostItStorage, PostItViewType } from './postIt';
import { QuickMemoStorage, QuickMemoFile } from './quickMemo/quickMemoStorage';
import { QuickMemoTreeProvider } from './quickMemo/quickMemoTreeProvider';
import { StateController } from './stateController';
import { CodeCopy } from './codeCopy';
import { CodeMarkerStorage, DiagnosticsManager, DiagnosticsTypes, CodeMarkerTreeProvider } from './codeMarker';

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
	let codeMarkerTreeProvider: CodeMarkerTreeProvider;
	
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
		
		// QuickMemoStorageを初期化
		quickMemoStorage = new QuickMemoStorage(stateController, context);
		await quickMemoStorage.initialize();
		console.log('QuickMemoStorage initialized successfully');
		
		// CodeMarkerStorageを初期化
		codeMarkerStorage = new CodeMarkerStorage(stateController);
		
		// DiagnosticsManagerを初期化
		diagnosticsManager = new DiagnosticsManager(codeMarkerStorage, context);
		
		// CodeMarkerTreeProviderを初期化
		codeMarkerTreeProvider = new CodeMarkerTreeProvider(codeMarkerStorage);
		console.log('CodeMarker initialized successfully');
	} catch (error) {
		console.error('Failed to initialize StateController:', error);
		vscode.window.showErrorMessage('Failed to initialize database: ' + error);
		return;
	}

	// PostIt統括マネージャーを作成・登録
	const postItManager = new PostItManager(postItStorage);
	postItManager.registerProviders(context);

	// QuickMemoTreeProviderを作成・登録
	const quickMemoTreeProvider = new QuickMemoTreeProvider(quickMemoStorage);
	vscode.window.registerTreeDataProvider('codeReaderQuickMemo', quickMemoTreeProvider);

	// CodeMarkerTreeProviderを登録
	vscode.window.registerTreeDataProvider('codeReaderCodeMarker', codeMarkerTreeProvider);

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
				const line = postIt.Lines[0].line - 1; // 1ベースから0ベースに変換（最初の行を使用）
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

	// CodeLensと折りたたみ範囲を更新する関数
	function updateCodeLens() {
		postItManager.getCodeLensProvider().refresh();
		postItManager.getFoldingProvider().refresh();
	}

	// エディタ変更時にdecorationとCodeLensを更新
	const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
		updatePostItDecorations(editor);
		updateCodeLens();
	});
	
	// 初回のdecoration更新
	updatePostItDecorations();
	updateCodeLens();

	// 折りたたみ状態を追跡するMap
	const foldedPostIts = new Map<string, boolean>();

	// PostIt専用折りたたみ関数
	async function foldSpecificRange(
		editor: vscode.TextEditor, 
		startLine: number, 
		endLine: number, 
		postItId: string
	): Promise<boolean> {
		try {
			console.log(`Folding PostIt ${postItId}: lines ${startLine + 1}-${endLine + 1}`);
			
			// 方法1: 選択範囲を作成してからカスタム折りたたみ範囲を作成
			const startPos = new vscode.Position(startLine, 0);
			const endPos = new vscode.Position(endLine, editor.document.lineAt(endLine).text.length);
			editor.selection = new vscode.Selection(startPos, endPos);
			
			// カスタム折りたたみ範囲を作成（任意の範囲を折りたたみ可能にする）
			await vscode.commands.executeCommand('editor.createFoldingRangeFromSelection');
			
			// 少し待機してから折りたたみ実行
			await new Promise(resolve => setTimeout(resolve, 50));
			
			// カーソルを開始行に戻してから折りたたみ
			editor.selection = new vscode.Selection(startPos, startPos);
			await vscode.commands.executeCommand('editor.fold');
			
			return true;
		} catch (error) {
			console.error(`Failed to fold PostIt ${postItId}:`, error);
			return false;
		}
	}

	// PostIt専用展開関数
	async function unfoldSpecificRange(
		editor: vscode.TextEditor, 
		startLine: number, 
		endLine: number
	): Promise<boolean> {
		try {
			console.log(`Unfolding range: lines ${startLine + 1}-${endLine + 1}`);
			
			// カーソルを開始行に配置
			const startPosition = new vscode.Position(startLine, 0);
			editor.selection = new vscode.Selection(startPosition, startPosition);
			
			// 展開実行
			await vscode.commands.executeCommand('editor.unfold');
			
			return true;
		} catch (error) {
			console.error(`Failed to unfold range ${startLine + 1}-${endLine + 1}:`, error);
			return false;
		}
	}

	// CodeLensクリック時のトグルコマンド
	const togglePostItFoldCommand = vscode.commands.registerCommand('codereader.togglePostItFold', async (postIt: any, documentUri: vscode.Uri) => {
		try {
			const firstLine = postIt.Lines[0];
			const foldKey = `${documentUri.toString()}:${postIt.id}`;
			const isFolded = foldedPostIts.get(foldKey) || false;
			
			// アクティブエディタが対象ファイルと一致するかチェック
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor || activeEditor.document.uri.toString() !== documentUri.toString()) {
				// ファイルを開く
				const document = await vscode.workspace.openTextDocument(documentUri);
				await vscode.window.showTextDocument(document);
			}
			
			const editor = vscode.window.activeTextEditor!;
			
			// PostItの正確な範囲を設定（1ベースから0ベースに変換）
			const startLine = firstLine.line - 1;
			const endLine = firstLine.endLine - 1;
			
			console.log(`Toggle fold for PostIt "${postIt.title}":`, {
				storedLine: firstLine.line, // 保存値（1ベース）
				storedEndLine: firstLine.endLine, // 保存値（1ベース）
				commandStartLine: startLine, // コマンド用（0ベース）
				commandEndLine: endLine, // コマンド用（0ベース）
				documentLineCount: editor.document.lineCount,
				currentFoldState: isFolded
			});
			
			// 有効な範囲かチェック
			if (startLine < 0 || endLine >= editor.document.lineCount || startLine >= endLine) {
				console.error(`Invalid PostIt range:`, {
					startLine,
					endLine,
					documentLineCount: editor.document.lineCount
				});
				vscode.window.showErrorMessage(`Invalid PostIt range: lines ${firstLine.line}-${firstLine.endLine}`);
				return;
			}
			
			// 末尾空白行の自動調整: 内容のある最後の行まで調整
			let adjustedEndLine = endLine;
			while (adjustedEndLine > startLine && editor.document.lineAt(adjustedEndLine).text.trim() === '') {
				adjustedEndLine--;
			}
			
			console.log(`PostIt fold: ${postIt.title}, lines ${firstLine.line}-${adjustedEndLine + 1}`);
			
			if (isFolded) {
				// 展開: 調整済み範囲で展開
				await unfoldSpecificRange(editor, startLine, adjustedEndLine);
				foldedPostIts.set(foldKey, false);
				vscode.window.showInformationMessage(`Unfolded PostIt: ${postIt.title} (lines ${firstLine.line}-${adjustedEndLine + 1})`);
			} else {
				// 折りたたみ: 調整済み範囲で折りたたみ
				const success = await foldSpecificRange(editor, startLine, adjustedEndLine, postIt.id);
				if (success) {
					foldedPostIts.set(foldKey, true);
					vscode.window.showInformationMessage(`Folded PostIt: ${postIt.title} (lines ${firstLine.line}-${adjustedEndLine + 1})`);
				} else {
					vscode.window.showErrorMessage(`Failed to fold PostIt: ${postIt.title}`);
				}
			}
			
			// カーソルを開始行に移動（折りたたみ処理後にリセット）
			const resetPos = new vscode.Position(startLine, 0);
			editor.selection = new vscode.Selection(resetPos, resetPos);
			editor.revealRange(new vscode.Range(resetPos, resetPos), vscode.TextEditorRevealType.InCenter);
			
		} catch (error) {
			console.error('Failed to toggle PostIt fold:', error);
			vscode.window.showErrorMessage(`Failed to toggle PostIt fold: ${error}`);
		}
	});

	// 旧コマンドも残しておく（互換性のため）
	const openPostItLocationCommand = vscode.commands.registerCommand('codereader.openPostItLocation', async (postIt: any) => {
		try {
			const firstLine = postIt.Lines[0];
			vscode.window.showInformationMessage(`PostIt: ${postIt.title} at line ${firstLine.line}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open PostIt location: ${error}`);
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
			
			// カーソル位置または選択範囲を取得
			let startLine: number;
			let endLine: number;
			let lines: Array<{file: string, line: number, endLine: number, text: string}> = [];
			
			if (!selection.isEmpty) {
				// 選択範囲がある場合
				startLine = selection.start.line;
				endLine = selection.end.line;
				
				console.log(`Original selection:`, {
					start: { line: selection.start.line, character: selection.start.character },
					end: { line: selection.end.line, character: selection.end.character }
				});
				
				// 選択範囲の最後が行の先頭の場合、前の行までにする
				if (selection.end.character === 0 && endLine > startLine) {
					console.log(`Adjusting endLine from ${endLine} to ${endLine - 1} (end character is 0)`);
					endLine--;
				}
				
				// 末尾空白行の自動調整: 内容のある最後の行まで調整
				while (endLine > startLine && document.lineAt(endLine).text.trim() === '') {
					endLine--;
				}
				
				// 選択範囲のテキストを結合
				const selectedLines: string[] = [];
				for (let i = startLine; i <= endLine; i++) {
					selectedLines.push(document.lineAt(i).text);
				}
				const combinedText = selectedLines.join('\n');
				
				console.log(`Creating PostIt: ${fileName}, lines ${startLine + 1}-${endLine + 1}`);
				
				lines.push({
					file: filePath,
					line: startLine + 1, // 1ベース
					endLine: endLine + 1, // 1ベース
					text: combinedText
				});
			} else {
				// 選択範囲がない場合はカーソル位置の行
				const cursorPosition = selection.active;
				startLine = endLine = cursorPosition.line;
				const lineText = document.lineAt(startLine).text;
				
				console.log(`Creating PostIt: ${fileName}, line ${startLine + 1}`);
				
				lines.push({
					file: filePath,
					line: startLine + 1, // 1ベース
					endLine: endLine + 1, // 1ベース
					text: lineText
				});
			}

			// 最後に使用したフォルダを取得（存在しない場合はDefaultを返す）
			const targetFolder = await postItStorage.getValidLastedFolder();

			// PostItを指定フォルダに作成
			const newNote = await postItStorage.addNoteToFolder(targetFolder, {
				title: fileName,
				color: 'yellow', // デフォルト色
				Lines: lines,
				ViewType: PostItViewType.Line // デフォルトはLine
			});

			// 最後に使用したフォルダとして更新
			await postItStorage.updateConfig({ lastedFolder: targetFolder });

			vscode.window.showInformationMessage(`PostIt created: ${newNote.title}`);
			
			// サイドバーを更新
			postItManager.getTreeProvider().refresh();
			
			// Gutter decorationを更新
			updatePostItDecorations();
			
			// CodeLensを更新
			updateCodeLens();

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create PostIt: ${error}`);
		}
	});

	// タイトル付きでPostItを作成するコマンドを実装
	const createPostItWithTitleCommand = vscode.commands.registerCommand('codereader.createPostItWithTitle', async () => {
		try {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage('No active editor found');
				return;
			}

			// タイトルの入力を求める
			const title = await vscode.window.showInputBox({
				prompt: 'Enter PostIt title',
				placeHolder: 'e.g., TODO: Fix this bug',
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Title cannot be empty';
					}
					return null;
				}
			});

			if (!title) {
				return; // キャンセルされた場合
			}

			const document = editor.document;
			const selection = editor.selection;
			
			// ワークスペース相対パスを取得
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
			const filePath = workspaceFolder 
				? vscode.workspace.asRelativePath(document.uri)
				: document.fileName;
			
			// カーソル位置または選択範囲を取得
			let startLine: number;
			let endLine: number;
			let lines: Array<{file: string, line: number, endLine: number, text: string}> = [];
			
			if (!selection.isEmpty) {
				// 選択範囲がある場合
				startLine = selection.start.line;
				endLine = selection.end.line;
				
				// 選択範囲の最後が行の先頭の場合、前の行までにする
				if (selection.end.character === 0 && endLine > startLine) {
					endLine--;
				}
				
				// 末尾空白行の自動調整
				while (endLine > startLine && document.lineAt(endLine).text.trim() === '') {
					endLine--;
				}
				
				// 選択範囲のテキストを結合
				const selectedLines: string[] = [];
				for (let i = startLine; i <= endLine; i++) {
					selectedLines.push(document.lineAt(i).text);
				}
				const combinedText = selectedLines.join('\n');
				
				lines.push({
					file: filePath,
					line: startLine + 1, // 1ベース
					endLine: endLine + 1, // 1ベース
					text: combinedText
				});
			} else {
				// 選択範囲がない場合はカーソル位置の行
				const cursorPosition = selection.active;
				startLine = endLine = cursorPosition.line;
				const lineText = document.lineAt(startLine).text;
				
				lines.push({
					file: filePath,
					line: startLine + 1, // 1ベース
					endLine: endLine + 1, // 1ベース
					text: lineText
				});
			}

			// 最後に使用したフォルダを取得（存在しない場合はDefaultを返す）
			const targetFolder = await postItStorage.getValidLastedFolder();

			// PostItを指定フォルダに作成（ユーザー指定のタイトル使用）
			const newNote = await postItStorage.addNoteToFolder(targetFolder, {
				title: title.trim(),
				color: 'yellow', // デフォルト色
				Lines: lines,
				ViewType: PostItViewType.CodeLens // タイトル指定時はCodeLensビュー
			});

			// 最後に使用したフォルダとして更新
			await postItStorage.updateConfig({ lastedFolder: targetFolder });

			vscode.window.showInformationMessage(`PostIt created: ${newNote.title}`);
			
			// サイドバーを更新
			postItManager.getTreeProvider().refresh();
			
			// Gutter decorationを更新
			updatePostItDecorations();
			
			// CodeLensを更新
			updateCodeLens();

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

			// 最後に使用したフォルダを取得（存在しない場合はDefaultを返す）
			const targetFolder = await postItStorage.getValidLastedFolder();

			// PostItを指定フォルダに作成
			const newNote = await postItStorage.addNoteToFolder(targetFolder, {
				title: fileName,
				color: 'yellow', // デフォルト色
				Lines: [{
					file: filePath,
					line: lineNumber + 1, // 1ベース行番号で保存
					endLine: lineNumber + 1, // 単一行の場合は同じ行番号
					text: lineText
				}],
				ViewType: PostItViewType.Line // デフォルトはLine
			});

			// 最後に使用したフォルダとして更新
			await postItStorage.updateConfig({ lastedFolder: targetFolder });

			vscode.window.showInformationMessage(`PostIt created at line ${lineNumber + 1}: ${newNote.title}`);
			
			// サイドバーを更新
			postItManager.getTreeProvider().refresh();
			
			// Gutter decorationを更新
			updatePostItDecorations();
			
			// CodeLensを更新
			updateCodeLens();

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
			postItManager.getTreeProvider().refresh();
			
			// Gutter decorationを更新
			updatePostItDecorations();
			
			// CodeLensを更新
			updateCodeLens();

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to clear PostIts: ${error}`);
		}
	});

	// PostItのタイトル変更コマンドを実装
	const changePostItTitleCommand = vscode.commands.registerCommand('codereader.changePostItTitle', async (item: any) => {
		try {
			if (!item || !item.note) {
				vscode.window.showErrorMessage('Invalid PostIt item');
				return;
			}

			const currentTitle = item.note.title;
			const newTitle = await vscode.window.showInputBox({
				prompt: 'Enter new title for PostIt',
				value: currentTitle,
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Title cannot be empty';
					}
					return null;
				}
			});

			if (newTitle && newTitle !== currentTitle) {
				await postItStorage.updateNote(item.note.id, { 
					title: newTitle.trim(),
					ViewType: PostItViewType.CodeLens // タイトル変更時はCodeLensに変更
				});
				vscode.window.showInformationMessage(`PostIt title updated to: ${newTitle.trim()}`);
				
				// サイドバー、ガター表示、CodeLensを更新
				postItManager.getTreeProvider().refresh();
				updatePostItDecorations();
				updateCodeLens();
			}

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to change PostIt title: ${error}`);
		}
	});


	// フォルダ作成コマンドを実装（従来版）
	const createFolderCommand = vscode.commands.registerCommand('codereader.createFolder', async () => {
		try {
			const folderPath = await vscode.window.showInputBox({
				prompt: 'Enter folder path (use / for subfolders)',
				placeHolder: 'e.g., TODO, Projects/WebApp, Archive/2024',
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Folder path cannot be empty';
					}
					if (value.includes('//') || value.startsWith('/') || value.endsWith('/')) {
						return 'Invalid folder path format';
					}
					return null;
				}
			});

			if (folderPath) {
				const trimmedPath = folderPath.trim();
				const success = await postItStorage.createFolder(trimmedPath);
				
				if (success) {
					// 最後に使用したフォルダとして記録
					await postItStorage.updateConfig({ lastedFolder: trimmedPath });
					vscode.window.showInformationMessage(`Created folder: ${trimmedPath}`);
					
					// サイドバーを更新
					postItManager.getTreeProvider().refresh();
				} else {
					vscode.window.showWarningMessage(`Folder "${trimmedPath}" already exists`);
				}
			}

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
		}
	});

	// サブフォルダ作成コマンドを実装
	const createSubFolderCommand = vscode.commands.registerCommand('codereader.createSubFolder', async (item: any) => {
		try {
			if (!item || !item.folderPath) {
				vscode.window.showErrorMessage('Invalid folder item');
				return;
			}

			const parentPath = item.folderPath;
			const subFolderName = await vscode.window.showInputBox({
				prompt: `Create subfolder in "${parentPath}"`,
				placeHolder: 'e.g., Completed, Archive, Sprint1',
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Subfolder name cannot be empty';
					}
					if (value.includes('/')) {
						return 'Subfolder name cannot contain "/"';
					}
					return null;
				}
			});

			if (subFolderName) {
				const trimmedName = subFolderName.trim();
				const fullPath = `${parentPath}/${trimmedName}`;
				const success = await postItStorage.createFolder(fullPath);
				
				if (success) {
					// 最後に使用したフォルダとして記録
					await postItStorage.updateConfig({ lastedFolder: fullPath });
					vscode.window.showInformationMessage(`Created subfolder: ${fullPath}`);
					
					// サイドバーを更新
					postItManager.getTreeProvider().refresh();
				} else {
					vscode.window.showWarningMessage(`Subfolder "${fullPath}" already exists`);
				}
			}

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create subfolder: ${error}`);
		}
	});

	// フォルダリネームコマンドを実装
	const renameFolderCommand = vscode.commands.registerCommand('codereader.renameFolder', async (item: any) => {
		try {
			if (!item || !item.folderPath) {
				vscode.window.showErrorMessage('Invalid folder item');
				return;
			}

			const oldPath = item.folderPath;
			
			// デフォルトフォルダはリネーム不可
			if (oldPath === 'Default') {
				vscode.window.showWarningMessage('Cannot rename the Default folder');
				return;
			}

			const currentName = oldPath.split('/').pop() || oldPath;
			const newName = await vscode.window.showInputBox({
				prompt: `Rename folder "${oldPath}"`,
				value: currentName,
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Folder name cannot be empty';
					}
					if (value.includes('/')) {
						return 'Folder name cannot contain "/"';
					}
					return null;
				}
			});

			if (newName && newName.trim() !== currentName) {
				const trimmedName = newName.trim();
				// 親パスを保持して新しいパスを構築
				const pathParts = oldPath.split('/');
				pathParts[pathParts.length - 1] = trimmedName;
				const newPath = pathParts.join('/');
				
				const success = await postItStorage.renameFolder(oldPath, newPath);
				
				if (success) {
					vscode.window.showInformationMessage(`Renamed folder: ${oldPath} → ${newPath}`);
					
					// サイドバーを更新
					postItManager.getTreeProvider().refresh();
				} else {
					vscode.window.showWarningMessage(`Failed to rename folder: "${newPath}" already exists or operation not allowed`);
				}
			}

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to rename folder: ${error}`);
		}
	});

	// PostIt削除コマンドを実装
	const deletePostItCommand = vscode.commands.registerCommand('codereader.deletePostIt', async (item: any) => {
		try {
			if (!item || !item.note) {
				vscode.window.showErrorMessage('Invalid PostIt item');
				return;
			}

			const answer = await vscode.window.showWarningMessage(
				`Delete PostIt "${item.note.title}"?`,
				{ modal: true },
				'Delete',
				'Cancel'
			);

			if (answer === 'Delete') {
				await postItStorage.deleteNote(item.note.id);
				vscode.window.showInformationMessage(`PostIt "${item.note.title}" deleted`);
				
				// サイドバー、ガター表示、CodeLensを更新
				postItManager.getTreeProvider().refresh();
				updatePostItDecorations();
				updateCodeLens();
			}

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to delete PostIt: ${error}`);
		}
	});

	// Register CodeCopy commands
	CodeCopy.registerCommands(context);

	// CodeMarker Diagnostics コマンド実装
	const createDiagnosticsCommand = (type: DiagnosticsTypes) => {
		return async () => {
			try {
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					vscode.window.showWarningMessage('No active editor found');
					return;
				}

				const document = editor.document;
				const selection = editor.selection;
				
				// メッセージの入力を求める
				const message = await vscode.window.showInputBox({
					prompt: `Enter ${type} message`,
					placeHolder: `e.g., This code needs attention`,
					validateInput: (value) => {
						if (!value || value.trim().length === 0) {
							return 'Message cannot be empty';
						}
						return null;
					}
				});

				if (!message) {
					return; // キャンセルされた場合
				}

				// ファイルパスを取得
				const filePath = document.uri.fsPath;
				
				let startLine: number;
				let endLine: number;
				let startColumn: number;
				let endColumn: number;
				let selectedText: string;
				
				if (!selection.isEmpty) {
					// 選択範囲がある場合
					startLine = selection.start.line + 1; // 1ベース
					endLine = selection.end.line + 1;
					startColumn = selection.start.character;
					endColumn = selection.end.character;
					selectedText = document.getText(selection);
					
					// 選択範囲の最後が行の先頭の場合、前の行までにする
					if (selection.end.character === 0 && endLine > startLine) {
						endLine--;
						endColumn = document.lineAt(endLine - 1).text.length; // 0ベースで取得して1ベースに調整
					}
				} else {
					// 選択範囲がない場合はカーソル位置の行
					const cursorPosition = selection.active;
					startLine = endLine = cursorPosition.line + 1; // 1ベース
					startColumn = 0;
					endColumn = document.lineAt(cursorPosition.line).text.length;
					selectedText = document.lineAt(cursorPosition.line).text;
				}

				// 最後に使用したフォルダを取得
				const targetFolder = await codeMarkerStorage.getValidLastedFolder();

				// Diagnosticsを追加
				await diagnosticsManager.addDiagnosticsToFolder(
					targetFolder,
					filePath,
					type,
					message.trim(),
					startLine,
					endLine,
					startColumn,
					endColumn,
					selectedText
				);

				// 最後に使用したフォルダとして更新
				await codeMarkerStorage.updateConfig({ lastedFolder: targetFolder });

				// ツリーを更新
				codeMarkerTreeProvider.refresh();

				vscode.window.showInformationMessage(`${type} added: ${message.trim()}`);

			} catch (error) {
				vscode.window.showErrorMessage(`Failed to add ${type}: ${error}`);
			}
		};
	};

	// 各種Diagnosticsコマンドを作成
	const addDiagnosticsHintCommand = vscode.commands.registerCommand(
		'codereader.addDiagnosticsHint',
		createDiagnosticsCommand(DiagnosticsTypes.Hint)
	);

	const addDiagnosticsInfoCommand = vscode.commands.registerCommand(
		'codereader.addDiagnosticsInfo',
		createDiagnosticsCommand(DiagnosticsTypes.Info)
	);

	const addDiagnosticsWarningCommand = vscode.commands.registerCommand(
		'codereader.addDiagnosticsWarning',
		createDiagnosticsCommand(DiagnosticsTypes.Warning)
	);

	const addDiagnosticsErrorCommand = vscode.commands.registerCommand(
		'codereader.addDiagnosticsError',
		createDiagnosticsCommand(DiagnosticsTypes.Error)
	);

	// 全てのDiagnosticsをクリアするコマンド
	const clearAllDiagnosticsCommand = vscode.commands.registerCommand('codereader.clearAllDiagnostics', async () => {
		try {
			// 確認ダイアログを表示
			const answer = await vscode.window.showWarningMessage(
				'すべてのCodeMarker Diagnosticsを削除しますか？この操作は元に戻せません。',
				{ modal: true },
				'削除',
				'キャンセル'
			);

			if (answer !== '削除') {
				return;
			}

			await diagnosticsManager.clearAllDiagnostics();
			codeMarkerTreeProvider.refresh();
			vscode.window.showInformationMessage('すべてのCodeMarker Diagnosticsを削除しました');

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to clear Diagnostics: ${error}`);
		}
	});

	// CodeMarker フォルダ作成コマンド
	const createCodeMarkerFolderCommand = vscode.commands.registerCommand('codereader.createCodeMarkerFolder', async () => {
		try {
			const folderPath = await vscode.window.showInputBox({
				prompt: 'Enter folder path (use / for subfolders)',
				placeHolder: 'e.g., Issues, TODOs, Bugs/Critical',
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Folder path cannot be empty';
					}
					if (value.includes('//') || value.startsWith('/') || value.endsWith('/')) {
						return 'Invalid folder path format';
					}
					return null;
				}
			});

			if (folderPath) {
				const trimmedPath = folderPath.trim();
				const success = await codeMarkerStorage.createFolder(trimmedPath);
				
				if (success) {
					await codeMarkerStorage.updateConfig({ lastedFolder: trimmedPath });
					vscode.window.showInformationMessage(`Created folder: ${trimmedPath}`);
					codeMarkerTreeProvider.refresh();
				} else {
					vscode.window.showWarningMessage(`Folder "${trimmedPath}" already exists`);
				}
			}

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
		}
	});

	// CodeMarker サブフォルダ作成コマンド
	const createCodeMarkerSubFolderCommand = vscode.commands.registerCommand('codereader.createCodeMarkerSubFolder', async (item: any) => {
		try {
			if (!item || !item.folderPath) {
				vscode.window.showErrorMessage('Invalid folder item');
				return;
			}

			const parentPath = item.folderPath;
			const subFolderName = await vscode.window.showInputBox({
				prompt: `Create subfolder in "${parentPath}"`,
				placeHolder: 'e.g., Completed, Archive, Sprint1',
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Subfolder name cannot be empty';
					}
					if (value.includes('/')) {
						return 'Subfolder name cannot contain "/"';
					}
					return null;
				}
			});

			if (subFolderName) {
				const trimmedName = subFolderName.trim();
				const fullPath = `${parentPath}/${trimmedName}`;
				const success = await codeMarkerStorage.createFolder(fullPath);
				
				if (success) {
					await codeMarkerStorage.updateConfig({ lastedFolder: fullPath });
					vscode.window.showInformationMessage(`Created subfolder: ${fullPath}`);
					codeMarkerTreeProvider.refresh();
				} else {
					vscode.window.showWarningMessage(`Subfolder "${fullPath}" already exists`);
				}
			}

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create subfolder: ${error}`);
		}
	});

	// CodeMarker フォルダリネームコマンド
	const renameCodeMarkerFolderCommand = vscode.commands.registerCommand('codereader.renameCodeMarkerFolder', async (item: any) => {
		try {
			if (!item || !item.folderPath) {
				vscode.window.showErrorMessage('Invalid folder item');
				return;
			}

			const oldPath = item.folderPath;
			
			// デフォルトフォルダはリネーム不可
			if (oldPath === 'Default') {
				vscode.window.showWarningMessage('Cannot rename the Default folder');
				return;
			}

			const currentName = oldPath.split('/').pop() || oldPath;
			const newName = await vscode.window.showInputBox({
				prompt: `Rename folder "${oldPath}"`,
				value: currentName,
				validateInput: (value) => {
					if (!value || value.trim().length === 0) {
						return 'Folder name cannot be empty';
					}
					if (value.includes('/')) {
						return 'Folder name cannot contain "/"';
					}
					return null;
				}
			});

			if (newName && newName.trim() !== currentName) {
				const trimmedName = newName.trim();
				const pathParts = oldPath.split('/');
				pathParts[pathParts.length - 1] = trimmedName;
				const newPath = pathParts.join('/');
				
				const success = await codeMarkerStorage.renameFolder(oldPath, newPath);
				
				if (success) {
					vscode.window.showInformationMessage(`Renamed folder: ${oldPath} → ${newPath}`);
					codeMarkerTreeProvider.refresh();
				} else {
					vscode.window.showWarningMessage(`Failed to rename folder: "${newPath}" already exists or operation not allowed`);
				}
			}

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to rename folder: ${error}`);
		}
	});

	// CodeMarker フォルダ削除コマンド
	const deleteCodeMarkerFolderCommand = vscode.commands.registerCommand('codereader.deleteCodeMarkerFolder', async (item: any) => {
		try {
			if (!item || !item.folderPath) {
				vscode.window.showErrorMessage('Invalid folder item');
				return;
			}

			const folderPath = item.folderPath;
			
			// デフォルトフォルダは削除不可
			if (folderPath === 'Default') {
				vscode.window.showWarningMessage('Cannot delete the Default folder');
				return;
			}

			// 確認ダイアログを表示
			const answer = await vscode.window.showWarningMessage(
				`Delete folder "${folderPath}" and all its diagnostics?`,
				{ modal: true },
				'Delete',
				'Cancel'
			);

			if (answer === 'Delete') {
				const success = await codeMarkerStorage.deleteFolder(folderPath);
				
				if (success) {
					vscode.window.showInformationMessage(`Deleted folder: ${folderPath}`);
					codeMarkerTreeProvider.refresh();
				} else {
					vscode.window.showWarningMessage(`Failed to delete folder: ${folderPath}`);
				}
			}

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to delete folder: ${error}`);
		}
	});

	// CodeMarker Diagnostics削除コマンド
	const deleteCodeMarkerDiagnosticsCommand = vscode.commands.registerCommand('codereader.deleteCodeMarkerDiagnostics', async (item: any) => {
		try {
			if (!item || !item.diagnostics || !item.folder || !item.filePath) {
				vscode.window.showErrorMessage('Invalid diagnostics item');
				return;
			}

			const answer = await vscode.window.showWarningMessage(
				`Delete diagnostics "${item.diagnostics.text}"?`,
				{ modal: true },
				'Delete',
				'Cancel'
			);

			if (answer === 'Delete') {
				await diagnosticsManager.deleteDiagnostics(item.folder, item.filePath, item.diagnostics.id);
				vscode.window.showInformationMessage(`Diagnostics "${item.diagnostics.text}" deleted`);
				codeMarkerTreeProvider.refresh();
			}

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to delete diagnostics: ${error}`);
		}
	});

	// Diagnostics位置を開くコマンド
	const openDiagnosticsLocationCommand = vscode.commands.registerCommand('codereader.openDiagnosticsLocation', async (diagnostics: any, filePath: string) => {
		try {
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
			const editor = await vscode.window.showTextDocument(document);
			
			const startPosition = new vscode.Position(diagnostics.Lines.startLine - 1, diagnostics.Lines.startColumn);
			const endPosition = new vscode.Position(diagnostics.Lines.endLine - 1, diagnostics.Lines.endColumn);
			
			editor.selection = new vscode.Selection(startPosition, endPosition);
			editor.revealRange(new vscode.Range(startPosition, endPosition), vscode.TextEditorRevealType.InCenter);
			
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open diagnostics location: ${error}`);
		}
	});

	// QuickMemo コマンド
	const quickMemoCreateCommand = vscode.commands.registerCommand('codereader.quickMemoCreate', async () => {
		try {
			const title = await vscode.window.showInputBox({
				prompt: 'Enter memo title',
				placeHolder: 'Quick memo title'
			});

			if (!title) {
				return;
			}

			const targetFolder = await quickMemoStorage.getValidLastedFolder();
			const newMemo = await quickMemoStorage.addMemoToFolder(targetFolder, title);
			await quickMemoStorage.updateConfig({ lastedFolder: targetFolder });
			
			quickMemoTreeProvider.refresh();
			vscode.window.showInformationMessage(`QuickMemo created: ${newMemo.title}`);
			await quickMemoStorage.openMemo(newMemo);
		} catch (error) {
			console.error('Error creating QuickMemo:', error);
			vscode.window.showErrorMessage('Failed to create QuickMemo: ' + error);
		}
	});

	const quickMemoCreateAndLinkCommand = vscode.commands.registerCommand('codereader.quickMemoCreateAndLink', async () => {
		try {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showWarningMessage('No active editor');
				return;
			}

			const title = await vscode.window.showInputBox({
				prompt: 'Enter memo title',
				placeHolder: 'Quick memo with file link'
			});

			if (!title) {
				return;
			}

			const filePath = activeEditor.document.uri.fsPath;
			const targetFolder = await quickMemoStorage.getValidLastedFolder();
			const newMemo = await quickMemoStorage.addMemoToFolder(targetFolder, title, [filePath]);
			await quickMemoStorage.updateConfig({ lastedFolder: targetFolder });
			
			quickMemoTreeProvider.refresh();
			vscode.window.showInformationMessage(`QuickMemo created with link: ${newMemo.title}`);
			await quickMemoStorage.openMemo(newMemo);
		} catch (error) {
			console.error('Error creating QuickMemo with link:', error);
			vscode.window.showErrorMessage('Failed to create QuickMemo with link: ' + error);
		}
	});

	const quickMemoOpenLatestCommand = vscode.commands.registerCommand('codereader.quickMemoOpenLatest', async () => {
		try {
			const latest = await quickMemoStorage.getLatestMemo();
			if (!latest) {
				vscode.window.showInformationMessage('No memos found');
				return;
			}

			await quickMemoStorage.openMemo(latest.memo);
		} catch (error) {
			console.error('Error opening latest QuickMemo:', error);
			vscode.window.showErrorMessage('Failed to open latest QuickMemo: ' + error);
		}
	});

	const openQuickMemoCommand = vscode.commands.registerCommand('codereader.openQuickMemo', async (memo: QuickMemoFile) => {
		try {
			await quickMemoStorage.openMemo(memo);
		} catch (error) {
			console.error('Error opening QuickMemo:', error);
			vscode.window.showErrorMessage('Failed to open QuickMemo: ' + error);
		}
	});

	const deleteQuickMemoCommand = vscode.commands.registerCommand('codereader.deleteQuickMemo', async (treeItem: any) => {
		try {
			if (!treeItem || !treeItem.memo) {
				vscode.window.showErrorMessage('Invalid memo selection');
				return;
			}

			const memo = treeItem.memo as QuickMemoFile;
			const result = await vscode.window.showWarningMessage(
				`Delete memo "${memo.title}"?`,
				{ modal: true },
				'Delete'
			);

			if (result !== 'Delete') {
				return;
			}

			const success = await quickMemoStorage.deleteMemo(memo);
			if (success) {
				quickMemoTreeProvider.refresh();
				vscode.window.showInformationMessage(`Memo "${memo.title}" deleted`);
			} else {
				vscode.window.showErrorMessage('Failed to delete memo');
			}
		} catch (error) {
			console.error('Error deleting QuickMemo:', error);
			vscode.window.showErrorMessage('Failed to delete QuickMemo: ' + error);
		}
	});

	context.subscriptions.push(
		createPostItCommand,
		createPostItWithTitleCommand,
		createPostItAtLineCommand, 
		clearAllPostItsCommand,
		changePostItTitleCommand,
		createFolderCommand,
		createSubFolderCommand,
		renameFolderCommand,
		deletePostItCommand,
		togglePostItFoldCommand,
		openPostItLocationCommand,
		quickMemoCreateCommand,
		quickMemoCreateAndLinkCommand,
		quickMemoOpenLatestCommand,
		openQuickMemoCommand,
		deleteQuickMemoCommand,
		addDiagnosticsHintCommand,
		addDiagnosticsInfoCommand,
		addDiagnosticsWarningCommand,
		addDiagnosticsErrorCommand,
		clearAllDiagnosticsCommand,
		createCodeMarkerFolderCommand,
		createCodeMarkerSubFolderCommand,
		renameCodeMarkerFolderCommand,
		deleteCodeMarkerFolderCommand,
		deleteCodeMarkerDiagnosticsCommand,
		openDiagnosticsLocationCommand,
		onDidChangeActiveEditor,
		postItDecorationType
	);
}

export function deactivate() {
	StateController.dispose();
}
