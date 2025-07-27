# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code extension project called "codereader" written in TypeScript. The extension provides code reading assistance tools including PostIt notes, QuickMemo, CodeCopy, and CodeMarker functionality. The project uses a unified BaseTreeProvider architecture for consistent tree view behavior across all features.

## Development Commands

### Build & Development
- `pnpm run compile` - Compile TypeScript to JavaScript using webpack
- `pnpm run watch` - Watch mode for development (auto-recompile on changes)
- `pnpm run package` - Create production build

### Testing
- `pnpm test` - Run all tests
- `pnpm run compile-tests` - Compile test files before running tests

### Code Quality
- `pnpm run lint` - Run ESLint on src directory

### VS Code Extension
- `pnpm run vscode:prepublish` - Pre-publish preparation
- Press `F5` in VS Code to launch a new Extension Development Host window for testing

## Architecture

### Entry Points
- `src/extension.ts` - Main extension entry point that exports `activate()` and `deactivate()` functions
- The extension registers commands under the "codereader" namespace (e.g., `codereader.createPostIt`)
- **Design Pattern**: Clean separation of concerns with CommandProvider pattern

### Command Architecture
Each feature module implements a CommandProvider pattern for clean separation:
- `src/postIt/postItCommandProvider.ts` - PostIt feature commands
- `src/quickMemo/quickMemoCommandProvider.ts` - QuickMemo feature commands
- `src/codeMarker/codeMarkerCommandProvider.ts` - CodeMarker feature commands
- `src/extension.ts` - Only handles initialization and command registration (no business logic)

### TreeView Architecture
All tree-based features use a unified BaseTreeProvider pattern:
- `src/modules/tree/baseTreeProvider.ts` - Abstract base class for all TreeDataProviders
- `src/postIt/postItTreeView.ts` - PostIt tree implementation extending BaseTreeProvider
- `src/quickMemo/quickMemoTreeView.ts` - QuickMemo tree implementation extending BaseTreeProvider
- `src/codeMarker/codeMarkerTreeView.ts` - CodeMarker tree implementation extending BaseTreeProvider
- **Design Pattern**: Inheritance-based code reuse with abstract methods for customization

#### Command Provider Pattern
```typescript
// Each feature has its own command provider
class FeatureCommandProvider {
    registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('command.name', this.handler.bind(this))
        ];
    }
    
    private async handler(): Promise<void> {
        // Command implementation
    }
}

// Extension only registers providers
const provider = new FeatureCommandProvider(dependencies);
const commands = provider.registerCommands();
context.subscriptions.push(...commands);
```

#### BaseTreeProvider Pattern
```typescript
// Abstract base class providing common TreeDataProvider functionality
export abstract class BaseTreeProvider<TData, TTreeItem extends vscode.TreeItem> 
    implements vscode.TreeDataProvider<TTreeItem>, vscode.TreeDragAndDropController<TTreeItem> {
    
    // Abstract methods that must be implemented by each feature
    protected abstract getRootFolders(): Promise<string[]>;
    protected abstract getItemsByFolder(folderPath: string): Promise<TData[]>;
    protected abstract createFolderItem(folderPath: string): TTreeItem;
    protected abstract createDataItem(data: TData): TTreeItem;
    protected abstract canDrag(item: TTreeItem): boolean;
    protected abstract canDrop(target: TTreeItem | undefined): boolean;
    
    // Common implementations provided by base class
    getTreeItem(element: TTreeItem): vscode.TreeItem { /* ... */ }
    getChildren(element?: TTreeItem): Promise<TTreeItem[]> { /* ... */ }
    handleDrag(source: TTreeItem[], treeDataTransfer: vscode.DataTransfer): Promise<void> { /* ... */ }
    handleDrop(target: TTreeItem | undefined, sources: vscode.DataTransfer): Promise<void> { /* ... */ }
}

// Feature-specific implementation
export class PostItTreeView extends BaseTreeProvider<PostItNote, PostItTreeItem> {
    protected async getRootFolders(): Promise<string[]> {
        return await this.storage.getFolders();
    }
    
    protected createDataItem(data: PostItNote): PostItTreeItem {
        return new PostItTreeItem(data.title, vscode.TreeItemCollapsibleState.None, 'note', undefined, data);
    }
    
    // ... other required abstract method implementations
}
```

### Build System
- **Webpack** is used for bundling (configured in `webpack.config.js`)
- TypeScript compilation targets ES2022 with strict mode enabled
- Output is generated in the `dist/` directory

### Testing
- Tests are located in `src/test/` directory
- Uses the VS Code test runner (`@vscode/test-cli` and `@vscode/test-electron`)
- Test files follow the pattern `*.test.ts`

## Development Environment

### Required Tools
- Node.js 24.3.0 (specified in `.tool-versions`)
- pnpm 10.13.1 (specified in `.tool-versions`)
- VS Code for extension development

### TypeScript Configuration
- Strict mode is enabled
- Target: ES2022
- Module resolution: bundler
- Source maps are generated for debugging

## Storage Architecture

### StateController
The extension uses JSON files for persistent storage via `StateController` class:

- **Location**: Data is stored in `ExtensionContext.storageUri` as tool-specific JSON files
- **Usage**: Singleton pattern - use `StateController.getInstance(context)` to get instance
- **Initialization**: Automatically creates storage directory and initializes tool data

### Storage Operations
```typescript
// Get instance
const stateController = StateController.getInstance(context);

// Tool-specific operations
stateController.set('toolName', data);
stateController.get('toolName');
stateController.delete('toolName');
```

### PostItStorage
The extension implements a type-safe wrapper for PostIt data via `PostItStorage` class:

- **Location**: Data is stored as `postIt.json` in the extension storage directory
- **Usage**: Create instance with StateController - `new PostItStorage(stateController)`
- **Features**: Virtual folder organization, nested folder support, type-safe operations

#### PostItStorage Operations
```typescript
// Get instance
const stateController = StateController.getInstance(context);
const postItStorage = new PostItStorage(stateController);

// Folder management
await postItStorage.createFolder('Work/Bugs');
await postItStorage.getFolders();
await postItStorage.getSubfolders('Work');

// Note operations
await postItStorage.addNote(noteData);
await postItStorage.addNoteToFolder('folderName', noteData);
await postItStorage.getNotesByFolder('folderName');
await postItStorage.updateNote(id, updates);
await postItStorage.deleteNote(id);
```

### Documentation Maintenance
**IMPORTANT**: When modifying PostItStorage logic or adding new features:
1. Update the README.md in `src/postIt/README.md` with the changes
2. Include new API methods, updated usage examples, and any behavioral changes
3. Ensure the README accurately reflects the current implementation

## Features

### PostIt Module
A note-taking system that allows attaching notes to specific code locations:
- **Folder Management**: Virtual folder structure with nested subfolder support
- **Note Features**: Create notes from selected text, attach to specific lines
- **Drag & Drop**: Reorganize notes between folders via tree view
- **CodeLens Integration**: Display PostIt indicators inline with code
- **Context Menu**: Right-click menu integration for quick access

### QuickMemo Module
A quick note-taking system for temporary thoughts and documentation:
- **Markdown Storage**: Notes stored as `.md` files in extension storage
- **Folder Organization**: Categorize memos into folders (General, TODO, Ideas, etc.)
- **File Linking**: Associate memos with workspace files
- **Quick Access**: Open latest memo, create new memos from context menu
- **Persistent Storage**: Memos persist across VS Code sessions

#### QuickMemoStorage Operations
```typescript
// Get instance
const quickMemoStorage = new QuickMemoStorage(stateController, context);

// Folder management
await quickMemoStorage.createFolder('Ideas');
await quickMemoStorage.getFolders();

// Memo operations
await quickMemoStorage.addMemoToFolder('Ideas', 'New Feature', ['src/index.ts']);
await quickMemoStorage.getLatestMemo();
await quickMemoStorage.openMemo(memo);
await quickMemoStorage.deleteMemo(memo);
```

### CodeCopy Module
A utility for copying code snippets with context information:
- **Format Customization**: Configure output format via settings
- **Context Preservation**: Includes file path and line numbers
- **Template Variables**: `{filepath}`, `{startLine}`, `{endLine}`, `{code}`
- **Default Format**: `` `{filepath}` {startLine}行目～{endLine}行目\n```\n{code}\n``` ``

### CodeMarker Module
A diagnostics management system for tracking code issues and notes:
- **Diagnostics Types**: Hint, Info, Warning, Error levels
- **Folder Organization**: Categorize diagnostics into folders
- **VS Code Integration**: Displays diagnostics in Problems panel
- **Location Tracking**: Precise line and column position tracking
- **Context Menu**: Right-click integration for quick diagnostics creation
- **Code Navigation**: Click on diagnostics items to jump directly to the source location

## Development Guidelines

### Adding New Commands
When adding new commands to any feature:
1. Add the command implementation to the appropriate CommandProvider class
2. Register the command in the `registerCommands()` method
3. Update `package.json` to declare the command in `contributes.commands`
4. Add menu items to `contributes.menus` if needed
5. **DO NOT** add command logic to `extension.ts` - it should only handle registration

### Command Provider Structure
```typescript
export class FeatureCommandProvider {
    constructor(
        private storage: FeatureStorage,
        private manager: FeatureManager,
        private context: vscode.ExtensionContext
    ) {}

    registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('codereader.featureAction', this.featureAction.bind(this)),
            // Add more commands here
        ];
    }

    private async featureAction(): Promise<void> {
        // Command implementation
    }
}
```

### Adding New TreeViews
When adding new tree-based features:
1. Create a new TreeView class extending `BaseTreeProvider<TData, TTreeItem>`
2. Implement all required abstract methods:
   - `getRootFolders()`: Return list of root folders
   - `getItemsByFolder(folderPath)`: Return data items for a folder
   - `createFolderItem(folderPath)`: Create TreeItem for folders
   - `createDataItem(data)`: Create TreeItem for data items
   - Drag & drop methods: `canDrag()`, `canDrop()`, etc.
3. Register using `vscode.window.createTreeView()` with both `treeDataProvider` and `dragAndDropController`
4. Update `package.json` to declare the view in `contributes.views`

#### TreeView Registration Pattern
```typescript
// In extension.ts
const featureTreeView = new FeatureTreeView(storage);
vscode.window.createTreeView('viewId', {
    treeDataProvider: featureTreeView,
    dragAndDropController: featureTreeView  // Enable drag & drop if supported
});
```

**IMPORTANT**: Always use `createTreeView()` instead of `registerTreeDataProvider()` to ensure drag & drop functionality works correctly.

## Known Issues & Fixes

### View Registration
- Fixed issue where TreeDataProvider was registered with incorrect ID (`codeReaderPostIta` → `codeReaderPostIt`)
- View IDs must match exactly between `package.json` and registration code

### TreeProvider Registration Issues (Fixed)
- **Issue**: Duplicate registration of TreeDataProviders causing "No data provider registered for view" errors
- **Root Cause**: Using both `registerTreeDataProvider()` and `createTreeView()` for the same view ID
- **Solution**: Standardized on `createTreeView()` only for all TreeViews to properly support drag & drop
- **Impact**: All tree views now display correctly with full drag & drop functionality

### BaseTreeProvider Implementation (Completed)
- **Issue**: Code duplication across PostIt, QuickMemo, and CodeMarker TreeProviders
- **Solution**: Created abstract `BaseTreeProvider` class with common TreeDataProvider and drag & drop logic
- **Benefits**: 
  - Reduced code duplication by ~70%
  - Unified drag & drop behavior across all features
  - Easier maintenance and consistent UX
  - Type-safe abstract method contracts

### CodeMarker Code Navigation (Fixed)
- **Issue**: Clicking CodeMarker diagnostics items did not navigate to source code
- **Root Cause**: File path information was not being passed to TreeItem commands
- **Solution**: Modified `createDataItem()` to properly include file path in TreeItem construction
- **Result**: CodeMarker diagnostics now support click-to-navigate functionality

### Architecture Refactoring (Completed)
- **Issue**: All command logic was previously centralized in `extension.ts` (1200+ lines)
- **Solution**: Implemented CommandProvider pattern with feature-specific command classes
- **Result**: `extension.ts` reduced to ~128 lines, improved maintainability and testability