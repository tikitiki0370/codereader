import * as assert from 'assert';
import { PostItLineTracker } from '../postIt/postItLineTracker';
import { PostItStorage, PostItNote, PostItViewType } from '../postIt/postItStorage';

// adjustLineNumbers / handleOverlappingDeletion はクラスの private。
// 内部分岐網羅のため as any で直接呼ぶ。 vscode.workspace.onDidChangeTextDocument
// を経由した E2E ではなく、ピュアロジックの境界条件確認が目的。
function newTracker(): any {
    // storage はメソッド側で参照されないので {} で十分 (型は as any で抜ける)
    const tracker = new PostItLineTracker({} as PostItStorage, () => {});
    return tracker as any;
}

function note(line: number, endLine: number, file = 'a.ts', id = 'n'): PostItNote {
    return {
        id,
        title: id,
        color: 'yellow',
        Lines: [{ file, line, endLine, text: '' }],
        ViewType: PostItViewType.Line,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

// vscode.TextDocumentContentChangeEvent 互換の最小オブジェクト
function change(startLine: number, endLine: number, text: string): any {
    return {
        range: {
            start: { line: startLine, character: 0 },
            end: { line: endLine, character: 0 }
        },
        text
    };
}

suite('PostItLineTracker: adjustLineNumbers (additions)', () => {
    test('shifts PostIt down when lines added before it', () => {
        const tracker = newTracker();
        const n = note(10, 12);
        // 2行追加 (change is at line 5, removes nothing, adds "x\ny\n")
        const changeEvent = change(5, 5, 'x\ny\n');
        const changed = tracker.adjustLineNumbers([n], 'a.ts', changeEvent);
        assert.deepStrictEqual(changed, ['n']);
        // PostIt 全体が下にシフト
        assert.deepStrictEqual({ line: n.Lines[0].line, end: n.Lines[0].endLine }, { line: 12, end: 14 });
    });

    test('expands endLine only when lines added inside PostIt', () => {
        const tracker = newTracker();
        const n = note(10, 15); // PostIt は 0-based 9..14
        const changeEvent = change(12, 12, 'x\n'); // 1 行追加 (PostIt 内)
        tracker.adjustLineNumbers([n], 'a.ts', changeEvent);
        // line そのまま, endLine +1
        assert.deepStrictEqual({ line: n.Lines[0].line, end: n.Lines[0].endLine }, { line: 10, end: 16 });
    });

    test('does not change PostIt when addition is after it', () => {
        const tracker = newTracker();
        const n = note(5, 7);
        const changeEvent = change(20, 20, 'x\n');
        const changed = tracker.adjustLineNumbers([n], 'a.ts', changeEvent);
        assert.deepStrictEqual(changed, []);
        assert.deepStrictEqual({ line: n.Lines[0].line, end: n.Lines[0].endLine }, { line: 5, end: 7 });
    });
});

suite('PostItLineTracker: adjustLineNumbers (deletions)', () => {
    test('shifts PostIt up when deletion is fully before it', () => {
        const tracker = newTracker();
        const n = note(10, 12);
        // delete 2 lines at line 2..4 (range covers lines 2,3 -> deletes 2)
        const changeEvent = change(2, 4, '');
        tracker.adjustLineNumbers([n], 'a.ts', changeEvent);
        // changeEndLine=4 < postItStartLine0=9 → shift by lineDelta=-2
        assert.deepStrictEqual({ line: n.Lines[0].line, end: n.Lines[0].endLine }, { line: 8, end: 10 });
    });

    test('does not change PostIt when deletion is fully after it', () => {
        const tracker = newTracker();
        const n = note(5, 7);
        const changeEvent = change(20, 22, '');
        const changed = tracker.adjustLineNumbers([n], 'a.ts', changeEvent);
        assert.deepStrictEqual(changed, []);
        assert.deepStrictEqual({ line: n.Lines[0].line, end: n.Lines[0].endLine }, { line: 5, end: 7 });
    });
});

suite('PostItLineTracker: handleOverlappingDeletion (private)', () => {
    test('collapses PostIt to deletion start when fully contained in deletion', () => {
        const tracker = newTracker();
        const line = { line: 10, endLine: 15 };
        // changeStart=5(0-based)=6行目, changeEnd=20(0-based)=21行目 → PostIt 完全包含
        // postItStartLine0 = 9, postItEndLine0 = 14
        const changed = tracker.handleOverlappingDeletion(line, 5, 20, 9, 14);
        assert.strictEqual(changed, true);
        // 期待: line = max(1, changeStart+1) = max(1, 6) = 6, endLine = line
        assert.deepStrictEqual(line, { line: 6, endLine: 6 });
    });

    test('clamps to line 1 when deletion starts before file head', () => {
        const tracker = newTracker();
        const line = { line: 1, endLine: 3 };
        // changeStart=-1 (hypothetical), changeEnd=10, PostIt 0..2
        // Max(1, -1+1)=1
        tracker.handleOverlappingDeletion(line, -1, 10, 0, 2);
        assert.deepStrictEqual(line, { line: 1, endLine: 1 });
    });

    test('handles deletion that overlaps PostIt start', () => {
        const tracker = newTracker();
        const line = { line: 10, endLine: 15 };
        // changeStart=5(0)=6行目, changeEnd=11(0)=12行目 → PostIt 先頭部分を削除
        // postItStartLine0=9, postItEndLine0=14
        const changed = tracker.handleOverlappingDeletion(line, 5, 11, 9, 14);
        assert.strictEqual(changed, true);
        // newStartLine = max(1, 6) = 6, remainingLines = postItEndLine0 - changeEndLine = 14 - 11 = 3
        // endLine = max(6, 6 + 3 - 1) = max(6, 8) = 8
        assert.deepStrictEqual(line, { line: 6, endLine: 8 });
    });

    test('handles deletion that overlaps PostIt end', () => {
        const tracker = newTracker();
        const line = { line: 10, endLine: 15 };
        // changeStart=12(0)=13行目, changeEnd=20(0)=21行目 → PostIt 末尾部分を削除
        // postItStartLine0=9, postItEndLine0=14
        const changed = tracker.handleOverlappingDeletion(line, 12, 20, 9, 14);
        assert.strictEqual(changed, true);
        // endLine = max(10, 12) = 12
        assert.deepStrictEqual(line, { line: 10, endLine: 12 });
    });

    test('handles deletion strictly inside PostIt', () => {
        const tracker = newTracker();
        const line = { line: 10, endLine: 20 };
        // changeStart=12(0), changeEnd=14(0) → PostIt 中間を 2 行削除
        // postItStartLine0=9, postItEndLine0=19
        const changed = tracker.handleOverlappingDeletion(line, 12, 14, 9, 19);
        assert.strictEqual(changed, true);
        // deletedLines = 14 - 12 = 2, endLine = max(10, 20-2) = 18
        assert.deepStrictEqual(line, { line: 10, endLine: 18 });
    });
});

suite('PostItLineTracker: adjustLineNumbers (multi-postit)', () => {
    test('updates multiple PostIts independently', () => {
        const tracker = newTracker();
        const a = note(3, 4, 'a.ts', 'A');
        const b = note(20, 22, 'a.ts', 'B');
        const c = note(50, 50, 'a.ts', 'C');

        // 10行目に 1 行追加 (0-based change at 9)
        const changeEvent = change(9, 9, 'x\n');
        const changed = tracker.adjustLineNumbers([a, b, c], 'a.ts', changeEvent);
        // A: 変更より上 → 不変
        // B, C: 変更より下 → +1
        assert.deepStrictEqual(changed.sort(), ['B', 'C']);
        assert.deepStrictEqual({ line: a.Lines[0].line, end: a.Lines[0].endLine }, { line: 3, end: 4 });
        assert.deepStrictEqual({ line: b.Lines[0].line, end: b.Lines[0].endLine }, { line: 21, end: 23 });
        assert.deepStrictEqual({ line: c.Lines[0].line, end: c.Lines[0].endLine }, { line: 51, end: 51 });
    });

    test('skips lines from other files', () => {
        const tracker = newTracker();
        const n = note(10, 12, 'other.ts');
        const changeEvent = change(2, 2, 'x\n');
        const changed = tracker.adjustLineNumbers([n], 'a.ts', changeEvent);
        // file mismatch → no change
        assert.deepStrictEqual(changed, []);
        assert.deepStrictEqual({ line: n.Lines[0].line, end: n.Lines[0].endLine }, { line: 10, end: 12 });
    });
});
