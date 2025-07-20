# PostItStorage Usage Guide

PostItStorage is a type-safe wrapper for managing PostIt notes with virtual folder organization in the VS Code extension.

## Overview

PostItStorage provides a comprehensive API for managing PostIt notes organized in virtual folders (categories). The data is persisted as JSON files in the extension's storage directory.

## Basic Usage

```typescript
import { StateController } from '../stateController';
import { PostItStorage, CreatePostItNote, PostItViewType } from './postItStorage';

// Initialize PostItStorage
const stateController = StateController.getInstance(context);
const postItStorage = new PostItStorage(stateController);
```

## Core Features

### 1. Folder Management

Folders are virtual categories for organizing PostIt notes. They support nesting using "/" as a separator.

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

// Get folder tree structure
const tree = await postItStorage.getFolderTree();
```

### 2. PostIt Note Operations

#### Creating Notes

```typescript
// Add to default folder
const note = await postItStorage.addNote({
    title: 'My First Note',
    corlor: 'yellow',
    Lines: [{
        file: '/src/main.ts',
        line: 42,
        text: 'console.log("Important code");'
    }],
    ViewType: PostItViewType.Line
});

// Add to specific folder
const bugNote = await postItStorage.addNoteToFolder('Work/Bugs', {
    title: 'Fix null pointer',
    corlor: 'red',
    Lines: [{
        file: '/src/utils.ts',
        line: 15,
        text: 'return obj.property; // Can be null'
    }],
    ViewType: PostItViewType.Comment
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
// Returns: [{ folder: 'Default', notes: [...] }, { folder: 'Work', notes: [...] }]

// Get note by ID
const note = await postItStorage.getNoteById('12345');

// Search notes by title
const searchResults = await postItStorage.searchNotesByTitle('bug');

// Get notes by file
const fileNotes = await postItStorage.getNotesByFile('/src/main.ts');
```

#### Updating Notes

```typescript
// Update note properties
const updated = await postItStorage.updateNote('12345', {
    title: 'Updated Title',
    corlor: 'green',
    Lines: [{
        file: '/src/new-file.ts',
        line: 100,
        text: 'Updated code reference'
    }]
});
```

#### Moving Notes Between Folders

```typescript
// Move note to different folder
const moved = await postItStorage.moveNoteToFolder('12345', 'Archive');
```

#### Deleting Notes

```typescript
// Delete a note
const deleted = await postItStorage.deleteNote('12345');
```

### 3. Configuration Management

```typescript
// Update configuration
await postItStorage.updateConfig({
    debug: true
});

// Get configuration
const config = await postItStorage.getConfig();
```

## Data Structure

### PostIt
The root data structure containing all PostIt notes organized by folders.

```typescript
interface PostIt {
    PostIts: {
        [folder: string]: PostItNote[]  // Virtual folders/categories
    };
    Config: {
        debug: boolean;
    }
    Version: string;
}
```

### PostItNote
Individual PostIt note structure.

```typescript
interface PostItNote {
    id: string;              // Auto-generated unique ID
    title: string;           // Note title
    corlor: string;          // Note color (e.g., 'yellow', 'red')
    Lines: PostItLine[];     // Code references
    ViewType: PostItViewType; // Display type
    createdAt: Date;         // Auto-set creation timestamp
    updatedAt: Date;         // Auto-updated modification timestamp
}
```

### PostItLine
Code reference within a note.

```typescript
interface PostItLine {
    file: string;  // File path
    line: number;  // Line number
    text: string;  // Code snippet
}
```

### PostItViewType
Display mode for the note.

```typescript
enum PostItViewType {
    Line = 'line',       // Line-based view
    Comment = 'comment'  // Comment-based view
}
```

## Important Notes

1. **Default Folder**: A 'Default' folder is automatically created and cannot be deleted
2. **Folder Nesting**: Use "/" to create nested folders (e.g., 'Work/Bugs/Critical')
3. **Auto-save**: All changes are automatically saved to JSON files
4. **Empty Folder Cleanup**: Empty folders are automatically removed (except Default and folders with subfolders)
5. **ID Generation**: IDs are automatically generated using timestamp + random string
6. **Timestamps**: createdAt and updatedAt are automatically managed

## Storage Location

PostIt data is stored as JSON files in the extension's storage directory:
- File: `postIt.json`
- Location: `ExtensionContext.storageUri`
- Format: Human-readable JSON for manual editing if needed