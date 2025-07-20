# PostIt Module

VSCode拡張のPostIt機能を提供するモジュールです。コードの特定行にポストイットのようなメモを添付し、フォルダ構造で整理できます。

## アーキテクチャ

### ファイル構成

#### 統括管理
- **`postIt.ts`** - PostItManager（各プロバイダーの統括管理）

#### 各機能プロバイダー
- **`postItTreeProvider.ts`** - TreeView機能（サイドバー表示・ドラッグ&ドロップ）
- **`postItTreeItem.ts`** - TreeItemの実装
- **`postItCodeLens.ts`** - CodeLens機能（エディタ内表示）
- **`postItFoldingProvider.ts`** - 折りたたみ機能
- **`postItStorage.ts`** - データ管理・永続化

#### エクスポート管理
- **`index.ts`** - 外部向けエクスポート

### PostItManager（統括管理）
```typescript
// 全プロバイダーの一元管理
const postItManager = new PostItManager(storage);
postItManager.registerProviders(context);

// 統一的な更新
postItManager.refresh();

// 個別プロバイダーアクセス
postItManager.getTreeProvider().refresh();
postItManager.getCodeLensProvider().refresh();
postItManager.getFoldingProvider().refresh();
```

**責任:**
- 各プロバイダーの初期化・登録
- VS Code拡張への統合
- 全プロバイダーの同期更新
- 個別プロバイダーへのアクセス提供

## 実装ルール

### 1. フォルダ管理ルール
- **Default フォルダ**: 削除不可のルートフォルダ
- **階層構造**: `Projects/WebApp` 形式でサブフォルダ作成可能
- **空フォルダ自動削除**: PostItがなくなった場合、サブフォルダを持たないフォルダは自動削除
- **lastedFolder安全性**: 存在しないフォルダの場合、自動的にDefaultにフォールバック

### 2. lastedFolder安全性ルール
```typescript
// ❌ 従来: 単純なフォールバック
const targetFolder = config.lastedFolder || 'Default';

// ✅ 現在: 存在チェック付きフォールバック
const targetFolder = await storage.getValidLastedFolder();
```

**動作:**
- 設定されたフォルダが存在する → そのフォルダを使用
- 設定されたフォルダが存在しない → Defaultフォルダを使用し、設定も更新
- 未設定 → Defaultフォルダを使用

### 3. 命名規則
- プロバイダー系: `postItXxxProvider.ts`
- データ系: `postItStorage.ts`, `postItTreeItem.ts`
- 統括系: `postIt.ts`

### 4. 責任分離ルール
- **Tree機能**: TreeDataProvider + DragAndDropController
- **CodeLens機能**: CodeLensProvider
- **Folding機能**: FoldingRangeProvider
- **データ管理**: CRUD操作・永続化
- **統括管理**: 各プロバイダーの調整

## 主要機能

### PostIt作成
- エディタでの選択範囲またはカーソル行から作成
- 自動的にlastedFolderに保存（存在チェック付き）
- 末尾空白行の自動トリミング

### フォルダ管理
- 階層フォルダ作成（`Projects/WebApp`形式）
- サブフォルダ作成
- フォルダリネーム（サブフォルダも自動更新）
- ドラッグ&ドロップによるPostIt移動

### 表示機能
- **TreeView**: サイドバーでの階層表示
- **CodeLens**: エディタ内でのインライン表示
- **Gutter**: 行番号横のアイコン表示
- **Folding**: PostIt範囲の折りたたみ

### データ永続化
- SQLiteベースの永続化（StateController経由）
- フォルダ構造の保持
- 設定の永続化

## 使用例

### 基本的な初期化
```typescript
import { PostItManager, PostItStorage } from './postIt';

const storage = new PostItStorage(stateController);
const manager = new PostItManager(storage);
manager.registerProviders(context);
```

### 個別プロバイダーアクセス
```typescript
// TreeViewの更新
manager.getTreeProvider().refresh();

// CodeLensの更新
manager.getCodeLensProvider().refresh();

// Folding機能の更新
manager.getFoldingProvider().refresh();

// 全て同時更新
manager.refresh();
```

### 安全なフォルダ操作
```typescript
// フォルダ作成
await storage.createFolder('Projects/WebApp');

// 安全なフォルダ取得（存在チェック付き）
const targetFolder = await storage.getValidLastedFolder();

// PostIt作成
const note = await storage.addNoteToFolder(targetFolder, noteData);
```

## PostItStorage API

### フォルダ管理

```typescript
// Create a folder
await postItStorage.createFolder('Work');
await postItStorage.createFolder('Work/Bugs');
await postItStorage.createFolder('Personal/Ideas');

// Get all folders
const folders = await postItStorage.getFolders();
// Returns: ['Default', 'Work', 'Work/Bugs', 'Personal', 'Personal/Ideas']

// Get subfolders
const subfolders = await postItStorage.getSubfolders('Work');
// Returns: ['Work/Bugs']

// Get valid lasted folder (with existence check)
const targetFolder = await postItStorage.getValidLastedFolder();

// Rename folder (updates subfolders automatically)
await postItStorage.renameFolder('Work/Bugs', 'Work/Issues');
```

### PostIt Note Operations

#### Creating Notes

```typescript
// Add to default folder
const note = await postItStorage.addNote({
    title: 'My First Note',
    color: 'yellow',
    Lines: [{
        file: '/src/main.ts',
        line: 42,
        endLine: 42,
        text: 'console.log("Important code");'
    }],
    ViewType: PostItViewType.Line
});

// Add to specific folder
const bugNote = await postItStorage.addNoteToFolder('Work/Bugs', {
    title: 'Fix null pointer',
    color: 'red',
    Lines: [{
        file: '/src/utils.ts',
        line: 15,
        endLine: 15,
        text: 'return obj.property; // Can be null'
    }],
    ViewType: PostItViewType.CodeLens
});
```

#### Reading Notes

```typescript
// Get all notes
const allNotes = await postItStorage.getAllNotes();

// Get notes by folder
const workNotes = await postItStorage.getNotesByFolder('Work');

// Get all notes grouped by folder
const grouped = await postItStorage.getAllNotesGroupedByFolder();

// Get note by ID
const note = await postItStorage.getNoteById('12345');

// Search notes by title
const searchResults = await postItStorage.searchNotesByTitle('bug');

// Get notes by file
const fileNotes = await postItStorage.getNotesByFile('/src/main.ts');
```

#### Updating and Moving Notes

```typescript
// Update note properties
const updated = await postItStorage.updateNote('12345', {
    title: 'Updated Title',
    color: 'green',
    ViewType: PostItViewType.CodeLens
});

// Move note to different folder
const moved = await postItStorage.moveNoteToFolder('12345', 'Archive');

// Delete a note
const deleted = await postItStorage.deleteNote('12345');
```

### Configuration Management

```typescript
// Update configuration
await postItStorage.updateConfig({
    debug: true,
    lastedFolder: 'Projects/WebApp'
});

// Get configuration
const config = await postItStorage.getConfig();

// Get valid lasted folder (with existence check)
const validFolder = await postItStorage.getValidLastedFolder();
```

## データ構造

### PostIt
```typescript
interface PostIt {
    PostIts: {
        [folder: string]: PostItNote[]  // Virtual folders/categories
    };
    Config: {
        debug: boolean;
        lastedFolder?: string;  // Last used folder
    }
    Version: string;
}
```

### PostItNote
```typescript
interface PostItNote {
    id: string;              // Auto-generated unique ID
    title: string;           // Note title
    color: string;           // Note color (e.g., 'yellow', 'red')
    Lines: PostItLine[];     // Code references
    ViewType: PostItViewType; // Display type
    createdAt: Date;         // Auto-set creation timestamp
    updatedAt: Date;         // Auto-updated modification timestamp
}
```

### PostItLine
```typescript
interface PostItLine {
    file: string;     // File path
    line: number;     // Start line number (1-based)
    endLine: number;  // End line number (1-based)
    text: string;     // Code snippet
}
```

### PostItViewType
```typescript
enum PostItViewType {
    Line = 'line',       // Line-based view
    CodeLens = 'codelens' // CodeLens-based view
}
```

## 重要な注意事項

1. **Default Folder**: 'Default' フォルダは自動作成され、削除不可
2. **Folder Nesting**: "/" を使用してネストフォルダ作成可能 (例: 'Work/Bugs/Critical')
3. **Auto-save**: 全ての変更は自動でJSONファイルに保存
4. **Empty Folder Cleanup**: 空フォルダは自動削除（Defaultとサブフォルダを持つフォルダ以外）
5. **ID Generation**: IDはタイムスタンプ + ランダム文字列で自動生成
6. **Timestamps**: createdAt と updatedAt は自動管理
7. **Folder Validation**: lastedFolderは存在チェック付きで安全に取得
8. **Line Trimming**: PostIt作成時に末尾空白行を自動トリミング

## 後方互換性

`PostItProvider` として `PostItTreeProvider` をエクスポートしているため、既存コードとの互換性を維持しています。

```typescript
// ✅ 従来のコードも動作
import { PostItProvider } from './postIt';
const provider = new PostItProvider(storage);
```

## Storage Location

PostIt data is stored using StateController (SQLite-based):
- Table: `postIt`
- Location: `ExtensionContext.storageUri/codereader.db`
- Format: SQLite database managed by StateController