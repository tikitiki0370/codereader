import * as assert from 'assert';
import { LineRangeUtils } from '../modules/line/lineRangeUtils';
import { LineRange, TimestampedLineRange } from '../modules/line/types';

// Clone helper used by removeLine/removeRange tests.
const clone = (orig: LineRange, startLine: number, endLine: number): LineRange => ({
    startLine,
    endLine
});

suite('LineRangeUtils: isLineInRanges', () => {
    test('returns true for boundary lines', () => {
        const ranges: LineRange[] = [{ startLine: 3, endLine: 5 }];
        assert.strictEqual(LineRangeUtils.isLineInRanges(ranges, 3), true);
        assert.strictEqual(LineRangeUtils.isLineInRanges(ranges, 5), true);
        assert.strictEqual(LineRangeUtils.isLineInRanges(ranges, 4), true);
    });

    test('returns false for lines outside ranges', () => {
        const ranges: LineRange[] = [{ startLine: 3, endLine: 5 }];
        assert.strictEqual(LineRangeUtils.isLineInRanges(ranges, 2), false);
        assert.strictEqual(LineRangeUtils.isLineInRanges(ranges, 6), false);
    });

    test('returns false for empty ranges', () => {
        assert.strictEqual(LineRangeUtils.isLineInRanges([], 1), false);
    });

    test('handles multiple ranges', () => {
        const ranges: LineRange[] = [
            { startLine: 1, endLine: 2 },
            { startLine: 10, endLine: 15 }
        ];
        assert.strictEqual(LineRangeUtils.isLineInRanges(ranges, 12), true);
        assert.strictEqual(LineRangeUtils.isLineInRanges(ranges, 5), false);
    });
});

suite('LineRangeUtils: countUniqueLines', () => {
    test('counts contiguous range correctly', () => {
        const ranges: LineRange[] = [{ startLine: 1, endLine: 5 }];
        assert.strictEqual(LineRangeUtils.countUniqueLines(ranges), 5);
    });

    test('deduplicates overlapping ranges', () => {
        const ranges: LineRange[] = [
            { startLine: 1, endLine: 5 },
            { startLine: 3, endLine: 7 }
        ];
        // Lines 1,2,3,4,5,6,7 = 7 unique lines
        assert.strictEqual(LineRangeUtils.countUniqueLines(ranges), 7);
    });

    test('counts single line range as 1', () => {
        assert.strictEqual(
            LineRangeUtils.countUniqueLines([{ startLine: 7, endLine: 7 }]),
            1
        );
    });

    test('returns 0 for empty input', () => {
        assert.strictEqual(LineRangeUtils.countUniqueLines([]), 0);
    });
});

suite('LineRangeUtils: removeLineFromRanges', () => {
    test('keeps range when line is outside', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeLineFromRanges(ranges, 1, clone);
        assert.deepStrictEqual(result, [{ startLine: 5, endLine: 10 }]);
    });

    test('removes single-line range entirely when it matches', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 5 }];
        const result = LineRangeUtils.removeLineFromRanges(ranges, 5, clone);
        assert.deepStrictEqual(result, []);
    });

    test('removes first line (shifts startLine)', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeLineFromRanges(ranges, 5, clone);
        assert.deepStrictEqual(result, [{ startLine: 6, endLine: 10 }]);
    });

    test('removes last line (shifts endLine)', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeLineFromRanges(ranges, 10, clone);
        assert.deepStrictEqual(result, [{ startLine: 5, endLine: 9 }]);
    });

    test('splits range when middle line is removed', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeLineFromRanges(ranges, 7, clone);
        assert.deepStrictEqual(result, [
            { startLine: 5, endLine: 6 },
            { startLine: 8, endLine: 10 }
        ]);
    });

    test('handles multiple ranges independently', () => {
        const ranges: LineRange[] = [
            { startLine: 1, endLine: 3 },
            { startLine: 10, endLine: 15 }
        ];
        const result = LineRangeUtils.removeLineFromRanges(ranges, 12, clone);
        assert.deepStrictEqual(result, [
            { startLine: 1, endLine: 3 },
            { startLine: 10, endLine: 11 },
            { startLine: 13, endLine: 15 }
        ]);
    });
});

suite('LineRangeUtils: removeRangeFromRanges', () => {
    test('keeps range when removal does not overlap', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeRangeFromRanges(ranges, 1, 3, clone);
        assert.deepStrictEqual(result, [{ startLine: 5, endLine: 10 }]);
    });

    test('keeps range when removal is fully after', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeRangeFromRanges(ranges, 20, 25, clone);
        assert.deepStrictEqual(result, [{ startLine: 5, endLine: 10 }]);
    });

    test('removes range when fully contained in removal', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeRangeFromRanges(ranges, 3, 12, clone);
        assert.deepStrictEqual(result, []);
    });

    test('removes range when exactly matching removal', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeRangeFromRanges(ranges, 5, 10, clone);
        assert.deepStrictEqual(result, []);
    });

    test('trims start when removal overlaps start', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeRangeFromRanges(ranges, 3, 7, clone);
        assert.deepStrictEqual(result, [{ startLine: 8, endLine: 10 }]);
    });

    test('trims end when removal overlaps end (endLine == range.endLine)', () => {
        // 旧レビューで「endLine == range.endLine の境界が出る」と疑われたケース。
        // 実コードでは startLine > range.startLine 分岐が拾うので問題なく動く。
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeRangeFromRanges(ranges, 8, 10, clone);
        assert.deepStrictEqual(result, [{ startLine: 5, endLine: 7 }]);
    });

    test('trims end when removal extends past end', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 10 }];
        const result = LineRangeUtils.removeRangeFromRanges(ranges, 8, 15, clone);
        assert.deepStrictEqual(result, [{ startLine: 5, endLine: 7 }]);
    });

    test('splits range when removal is in the middle', () => {
        const ranges: LineRange[] = [{ startLine: 5, endLine: 15 }];
        const result = LineRangeUtils.removeRangeFromRanges(ranges, 8, 10, clone);
        assert.deepStrictEqual(result, [
            { startLine: 5, endLine: 7 },
            { startLine: 11, endLine: 15 }
        ]);
    });

    test('handles multiple ranges with mixed overlap', () => {
        const ranges: LineRange[] = [
            { startLine: 1, endLine: 3 },     // before removal
            { startLine: 5, endLine: 15 },    // middle split
            { startLine: 20, endLine: 25 }    // after removal
        ];
        const result = LineRangeUtils.removeRangeFromRanges(ranges, 8, 10, clone);
        assert.deepStrictEqual(result, [
            { startLine: 1, endLine: 3 },
            { startLine: 5, endLine: 7 },
            { startLine: 11, endLine: 15 },
            { startLine: 20, endLine: 25 }
        ]);
    });

    test('handles single-line range exactly matching removal', () => {
        const ranges: LineRange[] = [{ startLine: 7, endLine: 7 }];
        const result = LineRangeUtils.removeRangeFromRanges(ranges, 7, 7, clone);
        assert.deepStrictEqual(result, []);
    });
});

suite('LineRangeUtils: getUniqueLines', () => {
    test('returns sorted unique lines', () => {
        const ranges: LineRange[] = [
            { startLine: 5, endLine: 7 },
            { startLine: 1, endLine: 3 },
            { startLine: 6, endLine: 8 }
        ];
        assert.deepStrictEqual(
            LineRangeUtils.getUniqueLines(ranges),
            [1, 2, 3, 5, 6, 7, 8]
        );
    });

    test('returns empty array for empty input', () => {
        assert.deepStrictEqual(LineRangeUtils.getUniqueLines([]), []);
    });
});

suite('LineRangeUtils: countLinesByDate', () => {
    test('filters by markedAt and counts unique lines', () => {
        const ranges: TimestampedLineRange[] = [
            { startLine: 1, endLine: 3, markedAt: '2025-01-01T00:00:00.000Z' },
            { startLine: 5, endLine: 7, markedAt: '2025-06-01T00:00:00.000Z' },
            { startLine: 10, endLine: 12, markedAt: '2025-12-01T00:00:00.000Z' }
        ];
        const since = new Date('2025-05-01T00:00:00.000Z');
        // Only the second and third ranges qualify: lines 5,6,7,10,11,12 = 6 unique
        assert.strictEqual(LineRangeUtils.countLinesByDate(ranges, since), 6);
    });
});
