import * as assert from 'assert';
import { BaseFolderStorage } from '../modules/storage/baseFolderStorage';
import { StateController } from '../stateController';

// In-memory shape: { Folders: Record<string, string[]>, Config: { lastedFolder?: string } }
interface TestData {
    Folders: Record<string, string[]>;
    Config: { lastedFolder?: string };
}

class TestFolderStorage extends BaseFolderStorage<TestData> {
    protected readonly TOOL_NAME = 'test';
    protected readonly DEFAULT_FOLDER = 'Default';

    private data: TestData;
    public beforeDeleteCalls: { folders: string[] }[] = [];

    constructor(initial?: TestData) {
        // BaseFolderStorage の constructor は StateController を要求するが、
        // このサブクラスは getData/saveData をオーバーライドして直接参照しないので
        // stub で OK。
        super({} as StateController);
        this.data = initial ?? {
            Folders: { Default: [] },
            Config: {}
        };
    }

    protected async getData(): Promise<TestData> {
        // 副作用ベースの再代入を許容するため deep clone はしない
        return this.data;
    }

    protected async saveData(data: TestData): Promise<void> {
        this.data = data;
    }

    protected getFolderObject(data: TestData): Record<string, any> {
        return data.Folders;
    }

    protected setFolderObject(data: TestData, folders: Record<string, any>): void {
        data.Folders = folders;
    }

    protected getLastedFolder(data: TestData): string | undefined {
        return data.Config.lastedFolder;
    }

    protected setLastedFolder(data: TestData, folder: string): void {
        data.Config.lastedFolder = folder;
    }

    async isFolderEmpty(folder: string): Promise<boolean> {
        const items = this.data.Folders[folder];
        return !items || items.length === 0;
    }

    protected async beforeDeleteFolders(foldersToDelete: string[], _data: TestData): Promise<void> {
        this.beforeDeleteCalls.push({ folders: [...foldersToDelete] });
    }

    // テスト都合: 現在の data を覗き見できるようにする
    snapshot(): TestData {
        return this.data;
    }
}

suite('BaseFolderStorage: createFolder', () => {
    test('creates a top-level folder', async () => {
        const storage = new TestFolderStorage();
        const ok = await storage.createFolder('Work');
        assert.strictEqual(ok, true);
        assert.deepStrictEqual(Object.keys(storage.snapshot().Folders).sort(), ['Default', 'Work']);
    });

    test('creates intermediate parents for nested folder', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Projects/2025/Q1');
        const keys = Object.keys(storage.snapshot().Folders).sort();
        // Should have Default + Projects + Projects/2025 + Projects/2025/Q1
        assert.deepStrictEqual(keys, ['Default', 'Projects', 'Projects/2025', 'Projects/2025/Q1']);
    });

    test('returns false when folder already exists', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Work');
        const ok = await storage.createFolder('Work');
        assert.strictEqual(ok, false);
    });
});

suite('BaseFolderStorage: getSubfolders', () => {
    test('returns only direct children', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Work/Bugs');
        await storage.createFolder('Work/Bugs/Critical');
        await storage.createFolder('Work/Features');
        const subs = (await storage.getSubfolders('Work')).sort();
        assert.deepStrictEqual(subs, ['Work/Bugs', 'Work/Features']);
    });

    test('does not match folders with shared prefix but no slash', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Work');
        await storage.createFolder('Workshop'); // shares 'Work' prefix without '/'
        const subs = await storage.getSubfolders('Work');
        assert.deepStrictEqual(subs, []);
    });
});

suite('BaseFolderStorage: renameFolder', () => {
    test('renames a top-level folder', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Old');
        const ok = await storage.renameFolder('Old', 'New');
        assert.strictEqual(ok, true);
        const keys = Object.keys(storage.snapshot().Folders).sort();
        assert.deepStrictEqual(keys, ['Default', 'New']);
    });

    test('renames nested subfolders along with parent', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Old/Sub');
        await storage.createFolder('Old/Sub/Deep');
        await storage.renameFolder('Old', 'New');
        const keys = Object.keys(storage.snapshot().Folders).sort();
        assert.deepStrictEqual(keys, ['Default', 'New', 'New/Sub', 'New/Sub/Deep']);
    });

    test('handles folder names containing characters that would be regex-special', async () => {
        // 旧実装は subfolder.replace(oldPath, newPath) を使っていた。
        // 文字列 replace に正規表現解釈はないが、`.` を含む名前で挙動を確認しておく。
        const storage = new TestFolderStorage();
        await storage.createFolder('a.b');
        await storage.createFolder('a.b/child');
        await storage.renameFolder('a.b', 'x.y');
        const keys = Object.keys(storage.snapshot().Folders).sort();
        assert.deepStrictEqual(keys, ['Default', 'x.y', 'x.y/child']);
    });

    test('rejects renaming the default folder', async () => {
        const storage = new TestFolderStorage();
        const ok = await storage.renameFolder('Default', 'Other');
        assert.strictEqual(ok, false);
    });

    test('rejects when target name already exists', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('A');
        await storage.createFolder('B');
        const ok = await storage.renameFolder('A', 'B');
        assert.strictEqual(ok, false);
    });

    test('rejects renaming to self or own subpath (paradox)', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('A');
        assert.strictEqual(await storage.renameFolder('A', 'A'), false);
        assert.strictEqual(await storage.renameFolder('A', 'A/sub'), false);
    });

    test('updates lastedFolder when it points to renamed folder', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Old');
        const data = storage.snapshot();
        data.Config.lastedFolder = 'Old';
        await storage.renameFolder('Old', 'New');
        assert.strictEqual(storage.snapshot().Config.lastedFolder, 'New');
    });

    test('updates lastedFolder when it points to a subfolder of renamed folder', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Old/Sub/Deep');
        const data = storage.snapshot();
        data.Config.lastedFolder = 'Old/Sub/Deep';
        await storage.renameFolder('Old', 'New');
        assert.strictEqual(storage.snapshot().Config.lastedFolder, 'New/Sub/Deep');
    });

    test('preserves lastedFolder when it is unrelated', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Old');
        await storage.createFolder('Other');
        const data = storage.snapshot();
        data.Config.lastedFolder = 'Other';
        await storage.renameFolder('Old', 'New');
        assert.strictEqual(storage.snapshot().Config.lastedFolder, 'Other');
    });
});

suite('BaseFolderStorage: deleteFolder', () => {
    test('deletes folder and its subfolders', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Work/Bugs');
        await storage.createFolder('Work/Bugs/Critical');
        await storage.createFolder('Other');
        await storage.deleteFolder('Work');
        const keys = Object.keys(storage.snapshot().Folders).sort();
        assert.deepStrictEqual(keys, ['Default', 'Other']);
    });

    test('rejects deleting the default folder', async () => {
        const storage = new TestFolderStorage();
        const ok = await storage.deleteFolder('Default');
        assert.strictEqual(ok, false);
    });

    test('returns false when folder does not exist', async () => {
        const storage = new TestFolderStorage();
        const ok = await storage.deleteFolder('NotThere');
        assert.strictEqual(ok, false);
    });

    test('resets lastedFolder to default when deleted folder was lasted', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Work');
        storage.snapshot().Config.lastedFolder = 'Work';
        await storage.deleteFolder('Work');
        assert.strictEqual(storage.snapshot().Config.lastedFolder, 'Default');
    });

    test('resets lastedFolder when a deleted subfolder was lasted', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Work/Sub');
        storage.snapshot().Config.lastedFolder = 'Work/Sub';
        await storage.deleteFolder('Work');
        assert.strictEqual(storage.snapshot().Config.lastedFolder, 'Default');
    });

    test('invokes beforeDeleteFolders with all affected folders', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Work/Bugs');
        await storage.createFolder('Work/Bugs/Critical');
        await storage.deleteFolder('Work');
        assert.strictEqual(storage.beforeDeleteCalls.length, 1);
        assert.deepStrictEqual(
            storage.beforeDeleteCalls[0].folders.sort(),
            ['Work', 'Work/Bugs', 'Work/Bugs/Critical']
        );
    });
});

suite('BaseFolderStorage: getValidLastedFolder', () => {
    test('returns lastedFolder when it still exists', async () => {
        const storage = new TestFolderStorage();
        await storage.createFolder('Work');
        storage.snapshot().Config.lastedFolder = 'Work';
        assert.strictEqual(await storage.getValidLastedFolder(), 'Work');
    });

    test('returns default and resets when lastedFolder is gone', async () => {
        const storage = new TestFolderStorage();
        storage.snapshot().Config.lastedFolder = 'Ghost';
        assert.strictEqual(await storage.getValidLastedFolder(), 'Default');
        assert.strictEqual(storage.snapshot().Config.lastedFolder, 'Default');
    });

    test('returns default when no lastedFolder is set', async () => {
        const storage = new TestFolderStorage();
        assert.strictEqual(await storage.getValidLastedFolder(), 'Default');
    });
});
