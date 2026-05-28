import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * activate() がエラーなく完走し、登録予定のコマンドが揃っていることを確認する
 * 配線レベルのスモークテスト。単体テストではカバーできない:
 *   - 依存注入の組み立て (storage / manager / providers)
 *   - context.subscriptions への Disposable 登録
 *   - リスナー初期化
 * を一度実行して、最近の変更で activate が壊れていないか担保する。
 */
suite('Extension activation smoke test', () => {
    test('extension activates without throwing', async function() {
        this.timeout(15000);

        // publisher 未設定なので `undefined_publisher.codereader` で引ける
        const ext = vscode.extensions.getExtension('undefined_publisher.codereader');
        assert.ok(ext, 'extension should be discoverable in test host');

        // ここで activate() が走る。例外が出れば test 失敗。
        await ext!.activate();
        assert.strictEqual(ext!.isActive, true, 'extension should report active after activate()');
    });

    test('activation does not produce console.error', async function() {
        this.timeout(10000);
        const ext = vscode.extensions.getExtension('undefined_publisher.codereader');
        assert.ok(ext);
        const errors: unknown[][] = [];
        const original = console.error;
        console.error = (...args: unknown[]) => { errors.push(args); };
        try {
            // 既に active な場合でも、await activate() は同じ Promise を返すだけで安全。
            // ただし async 失敗が伝播するのは初回 activate のみなので、副作用 (load 等) も
            // 落ち着くまで少し待つ。
            await ext!.activate();
            await new Promise(resolve => setTimeout(resolve, 200));
        } finally {
            console.error = original;
        }
        assert.deepStrictEqual(
            errors,
            [],
            `activation logged ${errors.length} error(s): ${errors.map(e => String(e[0])).join('\n')}`
        );
    });

    test('all declared commands are registered after activation', async () => {
        const registered = await vscode.commands.getCommands(true);
        const expected = [
            // PostIt
            'codereader.createPostIt',
            'codereader.createPostItWithTitle',
            'codereader.createPostItAtLine',
            'codereader.clearAllPostIts',
            'codereader.changePostItTitle',
            'codereader.deletePostIt',
            'codereader.createFolder',
            'codereader.createSubFolder',
            'codereader.renameFolder',
            'codereader.deleteFolder',
            // CodeCopy
            'codereader.codeCopy',
            // QuickMemo
            'codereader.quickMemoCreate',
            'codereader.quickMemoCreateAndLink',
            'codereader.quickMemoOpenLatest',
            'codereader.deleteQuickMemo',
            'codereader.createQuickMemoFolder',
            'codereader.createQuickMemoSubFolder',
            'codereader.renameQuickMemoFolder',
            'codereader.deleteQuickMemoFolder',
            // CodeMarker
            'codereader.addDiagnosticsHint',
            'codereader.addDiagnosticsInfo',
            'codereader.addDiagnosticsWarning',
            'codereader.addDiagnosticsError',
            'codereader.clearAllDiagnostics',
            'codereader.createCodeMarkerFolder',
            'codereader.createCodeMarkerSubFolder',
            'codereader.renameCodeMarkerFolder',
            'codereader.deleteCodeMarkerFolder',
            'codereader.addLineHighlight',
            'codereader.addSyntaxHighlight',
            'codereader.toggleSyntaxHighlightUp',
            'codereader.toggleSyntaxHighlightDown',
            // ReadTracker
            'codereader.readTracker.toggleReadMark',
            'codereader.readTracker.markSelection',
            'codereader.readTracker.unmarkSelection',
            'codereader.readTracker.clearFile',
            'codereader.readTracker.showStats',
            'codereader.readTracker.clearAll',
            'codereader.readTracker.toggleReadMarkUp',
            'codereader.readTracker.toggleReadMarkDown',
        ];
        const missing = expected.filter(cmd => !registered.includes(cmd));
        assert.deepStrictEqual(missing, [], `missing commands: ${missing.join(', ')}`);
    });
});
