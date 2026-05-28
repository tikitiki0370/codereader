import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { StateController } from '../stateController';

// テスト環境では拡張機能が activate されていないので singleton も無い。
// private constructor を as any で迂回し、テスト専用のインスタンスを作る。
// extensionStorageUri に tmpdir を割り当て、各テストは個別の StateController で動かす。
function makeIsolatedController(): { sc: StateController; tempDir: vscode.Uri } {
    const tempPath = path.join(os.tmpdir(), `codereader-sc-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
    const tempDir = vscode.Uri.file(tempPath);
    const fakeContext = { storageUri: tempDir } as unknown as vscode.ExtensionContext;
    const sc = new (StateController as any)(fakeContext) as StateController;
    return { sc, tempDir };
}

async function cleanup(sc: StateController, tempDir: vscode.Uri): Promise<void> {
    try {
        await sc.close();
    } catch { /* ignore */ }
    try {
        await vscode.workspace.fs.delete(tempDir, { recursive: true, useTrash: false });
    } catch { /* ignore (may not exist) */ }
}

function uniqueTool(label: string): string {
    return `test_${label}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

async function waitMs(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * onExternalChange の次回発火を Promise で待つ。
 * タイムアウト時は null を返す (発火しなかったことの確認用)。
 */
async function waitForExternalChange(
    sc: StateController,
    toolName: string,
    timeoutMs: number
): Promise<string | null> {
    return await new Promise<string | null>(resolve => {
        const timer = setTimeout(() => {
            sub.dispose();
            resolve(null);
        }, timeoutMs);
        const sub = sc.onExternalChange(name => {
            if (name === toolName) {
                clearTimeout(timer);
                sub.dispose();
                resolve(name);
            }
        });
    });
}

suite('StateController: basic round-trip', () => {
    let sc: StateController;
    let tempDir: vscode.Uri;
    setup(() => { ({ sc, tempDir } = makeIsolatedController()); });
    teardown(async () => { await cleanup(sc, tempDir); });

    test('set then get returns the same data after forceSave', async () => {
        const tool = uniqueTool('roundtrip');
        const data = { hello: 'world', n: 42 };
        sc.set(tool, data);
        await sc.forceSave(tool);
        const loaded = await sc.get(tool);
        assert.deepStrictEqual(loaded, data);
    });

    test('multiple set() before forceSave keeps the latest', async () => {
        const tool = uniqueTool('coalesce');
        sc.set(tool, { v: 1 });
        sc.set(tool, { v: 2 });
        sc.set(tool, { v: 3 });
        await sc.forceSave(tool);
        const loaded = await sc.get(tool);
        assert.deepStrictEqual(loaded, { v: 3 });
    });

    test('delete removes the file and get returns null', async () => {
        const tool = uniqueTool('delete');
        sc.set(tool, { x: 1 });
        await sc.forceSave(tool);
        await sc.delete(tool);
        const loaded = await sc.get(tool);
        assert.strictEqual(loaded, null);
    });

    test('get returns null when the file does not exist', async () => {
        const tool = uniqueTool('missing');
        const loaded = await sc.get(tool);
        assert.strictEqual(loaded, null);
    });
});

suite('StateController: self-write suppression', () => {
    let sc: StateController;
    let tempDir: vscode.Uri;
    setup(() => { ({ sc, tempDir } = makeIsolatedController()); });
    teardown(async () => { await cleanup(sc, tempDir); });

    test('forceSave does not fire onExternalChange for own writes', async function() {
        this.timeout(5000);
        const tool = uniqueTool('selfwrite');
        // ファイルを生成して watcher が live になるのを担保
        sc.set(tool, { initial: true });
        await sc.forceSave(tool);
        await waitMs(50);

        // 続けて forceSave しても自分の書き込みエコーは抑制される
        sc.set(tool, { updated: true });
        await sc.forceSave(tool);
        const event = await waitForExternalChange(sc, tool, 800);
        assert.strictEqual(event, null, 'self-write should not fire onExternalChange');
    });

    test('external write fires onExternalChange after the suppress window', async function() {
        this.timeout(8000);
        const storageUri = sc.getStorageUri();
        assert.ok(storageUri, 'storageUri should be available');
        const tool = uniqueTool('extwrite');
        sc.set(tool, { initial: true });
        await sc.forceSave(tool);
        // self-write 抑制窓 (1500ms) を確実に超えてから外部編集を発火させる
        await waitMs(1700);

        const filePath = vscode.Uri.joinPath(storageUri!, `${tool}.json`);
        const externalContent = JSON.stringify({ external: true }, null, 2);
        await vscode.workspace.fs.writeFile(filePath, new TextEncoder().encode(externalContent));

        const event = await waitForExternalChange(sc, tool, 2500);
        assert.strictEqual(event, tool, 'external write should fire onExternalChange');

        // 再ロード後は外部の内容が見える
        const loaded = await sc.get(tool);
        assert.deepStrictEqual(loaded, { external: true });
    });
});

suite('StateController: load error handling', () => {
    let sc: StateController;
    let tempDir: vscode.Uri;
    setup(() => { ({ sc, tempDir } = makeIsolatedController()); });
    teardown(async () => { await cleanup(sc, tempDir); });

    test('throws when JSON is corrupted (no silent fallback)', async function() {
        this.timeout(5000);
        const storageUri = sc.getStorageUri();
        assert.ok(storageUri, 'storageUri should be available');
        const tool = uniqueTool('corrupt');
        // ディレクトリを作ってから直接ファイルを書き込む
        try {
            await vscode.workspace.fs.createDirectory(storageUri!);
        } catch { /* already exists */ }
        const filePath = vscode.Uri.joinPath(storageUri!, `${tool}.json`);
        await vscode.workspace.fs.writeFile(
            filePath,
            new TextEncoder().encode('{not valid json')
        );

        // 破損 JSON の場合 throw する (旧実装は null を返してしまい、後続の
        // 保存で初期データに上書きされる可能性があった)
        await assert.rejects(
            sc.get(tool),
            /corrupted/,
            'corrupted JSON should throw, not silently return null'
        );
    });
});
