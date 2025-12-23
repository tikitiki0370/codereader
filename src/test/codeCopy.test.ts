import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodeCopy } from '../codeCopy/codeCopy';

suite('CodeCopy Test Suite', () => {
    vscode.window.showInformationMessage('Start CodeCopy tests.');

    test('copySelectedLines should copy full lines even with partial selection', async () => {
        // Create a test document with multiple lines
        const testContent = 'Line 1: First line\nLine 2: Second line\nLine 3: Third line\nLine 4: Fourth line';
        const doc = await vscode.workspace.openTextDocument({ content: testContent, language: 'plaintext' });
        const editor = await vscode.window.showTextDocument(doc);

        try {
            // Test 1: Select partial text on line 2 (from middle to middle)
            // Select "econd" in "Second" (characters 8-13 on line 1, 0-indexed)
            const selection1 = new vscode.Selection(
                new vscode.Position(1, 8),
                new vscode.Position(1, 13)
            );
            editor.selection = selection1;

            await CodeCopy.copySelectedLines();
            const clipboard1 = await vscode.env.clipboard.readText();

            // Should contain the entire line 2, not just "econd"
            assert.ok(clipboard1.includes('Line 2: Second line'), 'Should copy the entire line, not just selected portion');
            assert.ok(!clipboard1.includes('Line 1:'), 'Should not include line 1');
            assert.ok(!clipboard1.includes('Line 3:'), 'Should not include line 3');

            // Test 2: Select across multiple lines (partial on both ends)
            // Select from middle of line 2 to middle of line 3
            const selection2 = new vscode.Selection(
                new vscode.Position(1, 10),  // Middle of line 2
                new vscode.Position(2, 10)   // Middle of line 3
            );
            editor.selection = selection2;

            await CodeCopy.copySelectedLines();
            const clipboard2 = await vscode.env.clipboard.readText();

            // Should contain both full lines
            assert.ok(clipboard2.includes('Line 2: Second line'), 'Should include entire line 2');
            assert.ok(clipboard2.includes('Line 3: Third line'), 'Should include entire line 3');
            assert.ok(!clipboard2.includes('Line 1:'), 'Should not include line 1');
            assert.ok(!clipboard2.includes('Line 4:'), 'Should not include line 4');

            // Test 3: Select from beginning of line (should still work)
            const selection3 = new vscode.Selection(
                new vscode.Position(0, 0),
                new vscode.Position(0, 5)
            );
            editor.selection = selection3;

            await CodeCopy.copySelectedLines();
            const clipboard3 = await vscode.env.clipboard.readText();

            assert.ok(clipboard3.includes('Line 1: First line'), 'Should copy entire line 1');

        } finally {
            // Clean up
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });

    test('copySelectedLines should handle single line selection', async () => {
        const testContent = 'Single line content';
        const doc = await vscode.workspace.openTextDocument({ content: testContent, language: 'plaintext' });
        const editor = await vscode.window.showTextDocument(doc);

        try {
            // Select partial text on the only line
            const selection = new vscode.Selection(
                new vscode.Position(0, 7),
                new vscode.Position(0, 11)
            );
            editor.selection = selection;

            await CodeCopy.copySelectedLines();
            const clipboard = await vscode.env.clipboard.readText();

            assert.ok(clipboard.includes('Single line content'), 'Should copy the entire single line');

        } finally {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });

    test('copySelectedLines should display correct line numbers', async () => {
        const testContent = 'Line 1\nLine 2\nLine 3';
        const doc = await vscode.workspace.openTextDocument({ content: testContent, language: 'plaintext' });
        const editor = await vscode.window.showTextDocument(doc);

        try {
            // Select line 2 (0-indexed as line 1)
            const selection = new vscode.Selection(
                new vscode.Position(1, 0),
                new vscode.Position(1, 6)
            );
            editor.selection = selection;

            await CodeCopy.copySelectedLines();
            const clipboard = await vscode.env.clipboard.readText();

            // Line numbers should be 1-based (line 2)
            assert.ok(clipboard.includes('2行目'), 'Should show line 2 in the format');

        } finally {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });
});
