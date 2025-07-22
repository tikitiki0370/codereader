# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code extension project called "codereader" written in TypeScript. The extension provides code reading assistance tools including PostIt notes, QuickMemo, and CodeCopy functionality.

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
- The extension registers commands under the "codereader" namespace (e.g., `codereader.helloWorld`)

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

## Known Issues & Fixes

### View Registration
- Fixed issue where TreeDataProvider was registered with incorrect ID (`codeReaderPostIta` → `codeReaderPostIt`)
- View IDs must match exactly between `package.json` and registration code