import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { StateController } from '../stateController';
import { QuickMemoStorage } from '../quickMemo/quickMemoStorage';
import { PostItStorage } from '../postIt/postItStorage';
import { CodeMarkerStorage } from '../codeMarker/codeMarkerStorage';

// activate() 経由ではなく、各 Storage に直接 fresh StateController を注入して
// ラウンドトリップを検証する。private constructor は as any で迂回する。
function makeIsolated(): { sc: StateController; ctx: vscode.ExtensionContext; tempDir: vscode.Uri } {
    const tempPath = path.join(os.tmpdir(), `codereader-int-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
    const tempDir = vscode.Uri.file(tempPath);
    const ctx = { storageUri: tempDir } as unknown as vscode.ExtensionContext;
    const sc = new (StateController as any)(ctx) as StateController;
    return { sc, ctx, tempDir };
}

async function cleanup(sc: StateController, tempDir: vscode.Uri): Promise<void> {
    try { await sc.close(); } catch { /* ignore */ }
    try { await vscode.workspace.fs.delete(tempDir, { recursive: true, useTrash: false }); } catch { /* ignore */ }
}

suite('Integration: QuickMemo round-trip (security regression)', () => {
    let sc: StateController;
    let ctx: vscode.ExtensionContext;
    let tempDir: vscode.Uri;
    let storage: QuickMemoStorage;
    setup(() => {
        ({ sc, ctx, tempDir } = makeIsolated());
        storage = new QuickMemoStorage(sc, ctx);
    });
    teardown(async () => { await cleanup(sc, tempDir); });

    test('addMemoToFolder → getMemoContent → openMemo → deleteMemo round-trip works (UUID files pass allowlist)', async function() {
        this.timeout(5000);
        // 'General' フォルダはデフォルト
        const memo = await storage.addMemoToFolder('General', 'Test memo');
        assert.ok(memo.id, 'memo should have an id');
        assert.match(memo.file, /^[0-9a-f-]+\.md$/i, 'memo.file should be UUID-based');

        // getMemoContent: ファイルを読めるはず (SAFE_FILE_PATTERN を通る)
        const content = await storage.getMemoContent(memo);
        assert.ok(content.includes('# Test memo'), `expected '# Test memo' in content; got: ${content}`);

        // openMemo: throw しないことを確認 (実際に表示はする必要なし)
        await storage.openMemo(memo);

        // updateMemoContent: 書き換えできる
        await storage.updateMemoContent(memo, '# Updated\n\nbody\n');
        const updated = await storage.getMemoContent(memo);
        assert.ok(updated.includes('# Updated'), 'content should be updated');

        // deleteMemo: ファイルもJSONも消える
        const deleted = await storage.deleteMemo(memo);
        assert.strictEqual(deleted, true);

        // 削除後の getMemoContent は '' (ファイル無しでも throw しない既存挙動)
        const after = await storage.getMemoContent(memo);
        assert.strictEqual(after, '');
    });

    test('updateMemoContent rejects path-traversal in memo.file', async () => {
        const evilMemo: any = {
            id: 'x',
            title: 'evil',
            file: '../../../tmp/evil-test-should-not-create.md',
            Lines: [],
            createAt: new Date(),
            updateAt: new Date()
        };
        await assert.rejects(
            () => storage.updateMemoContent(evilMemo, 'pwned'),
            /Unsafe quickMemo file name/,
            'updateMemoContent must reject path traversal'
        );
    });

    test('openMemo rejects path-traversal in memo.file', async () => {
        const evilMemo: any = {
            id: 'x',
            title: 'evil',
            file: '../../../etc/passwd',
            Lines: [],
            createAt: new Date(),
            updateAt: new Date()
        };
        await assert.rejects(
            () => storage.openMemo(evilMemo),
            /Unsafe quickMemo file name/,
            'openMemo must reject path traversal'
        );
    });

    test('getMemoContent returns empty string for unsafe file (no throw, no fs op)', async () => {
        const evilMemo: any = {
            id: 'x',
            title: 'evil',
            file: '../../foo.md',
            Lines: [],
            createAt: new Date(),
            updateAt: new Date()
        };
        // getMemoContent は read 系なので throw せず '' を返す (UX 優先)
        const content = await storage.getMemoContent(evilMemo);
        assert.strictEqual(content, '');
    });

    test('deleteMemo with unsafe file still cleans JSON (file step skipped safely)', async () => {
        // メモを 1 件作って、無理矢理 file を不正値に差し替えてから deleteMemo を呼ぶ
        const memo = await storage.addMemoToFolder('General', 'will-delete');
        // 元のファイルが消えないように、まずファイルを差し替えた偽メモを渡してテスト
        const evilCopy: any = { ...memo, file: '../../oops.md' };
        const result = await storage.deleteMemo(evilCopy);
        // JSON 検索は id で行うので削除自体は成功し、unsafe file は warn して継続
        assert.strictEqual(result, true);
        // 元の自動生成ファイルは残ったまま (id で見つかった memo を消したので)
        // — テスト隔離のために本物の memo もきれいにする
        await storage.deleteMemo(memo);
    });
});

suite('Integration: PostItStorage folder rename via real BaseFolderStorage', () => {
    let sc: StateController;
    let tempDir: vscode.Uri;
    let storage: PostItStorage;
    setup(() => {
        ({ sc, tempDir } = makeIsolated());
        storage = new PostItStorage(sc);
    });
    teardown(async () => { await cleanup(sc, tempDir); });

    test('nested folder rename works through real PostItStorage', async () => {
        await storage.createFolder('Work/Bugs/Critical');
        await storage.createFolder('Work/Features');

        const ok = await storage.renameFolder('Work', 'NewWork');
        assert.strictEqual(ok, true);

        const folders = await storage.getFolders();
        assert.ok(folders.includes('NewWork'));
        assert.ok(folders.includes('NewWork/Bugs'));
        assert.ok(folders.includes('NewWork/Bugs/Critical'));
        assert.ok(folders.includes('NewWork/Features'));
        assert.ok(!folders.some(f => f.startsWith('Work')));
    });

    test('paradox rename is rejected (newPath is subpath of oldPath)', async () => {
        await storage.createFolder('A');
        const ok = await storage.renameFolder('A', 'A/B');
        assert.strictEqual(ok, false);
    });

    test('default folder cannot be renamed', async () => {
        const ok = await storage.renameFolder('Default', 'X');
        assert.strictEqual(ok, false);
    });
});

suite('Integration: CodeMarkerStorage folder ops via real BaseFolderStorage', () => {
    let sc: StateController;
    let tempDir: vscode.Uri;
    let storage: CodeMarkerStorage;
    setup(() => {
        ({ sc, tempDir } = makeIsolated());
        storage = new CodeMarkerStorage(sc);
    });
    teardown(async () => { await cleanup(sc, tempDir); });

    test('createFolder / deleteFolder cascade through real CodeMarkerStorage', async () => {
        await storage.createFolder('Work/Bugs/Critical');
        let folders = await storage.getFolders();
        assert.ok(folders.includes('Work/Bugs/Critical'));

        const ok = await storage.deleteFolder('Work');
        assert.strictEqual(ok, true);
        folders = await storage.getFolders();
        assert.ok(!folders.some(f => f.startsWith('Work')));
    });
});
