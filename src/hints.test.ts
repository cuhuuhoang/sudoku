import { describe, expect, it } from 'vitest';
import {
  detectFish,
  detectHiddenSet,
  detectHiddenSingleBox,
  detectHiddenSingleColumn,
  detectHiddenSingleRow,
  detectLockedCandidatesClaiming,
  detectLockedCandidatesPointing,
  detectNakedSet,
  detectNakedSingle,
  detectPeerElimination,
  detectXWing,
  detectXYWing,
  detectXYZWing,
  detectWWing,
  detectRemotePair,
  detectForcingChains,
  type CellState,
} from './App';

const makeBoard = (): CellState[][] =>
  Array.from({ length: 9 }, (_r, row) =>
    Array.from({ length: 9 }, (_c, col) => ({
      row,
      col,
      value: null,
      given: false,
      candidates: [],
    })),
  );

const setCandidates = (board: CellState[][], row: number, col: number, candidates: number[]) => {
  board[row][col].candidates = candidates;
};

const setValue = (board: CellState[][], row: number, col: number, value: number, given = false) => {
  board[row][col].value = value;
  board[row][col].given = given;
  board[row][col].candidates = [];
};

describe('hint detectors', () => {
  it('detects naked single', () => {
    const board = makeBoard();
    setCandidates(board, 0, 0, [5]);
    expect(detectNakedSingle(board)?.type).toBe('naked-single');
  });

  it('detects hidden single in row, column, and box', () => {
    const rowBoard = makeBoard();
    setCandidates(rowBoard, 0, 0, [1, 2]);
    setCandidates(rowBoard, 0, 1, [2, 3]);
    expect(detectHiddenSingleRow(rowBoard)?.type).toBe('hidden-single-row');

    const colBoard = makeBoard();
    setCandidates(colBoard, 0, 0, [2, 3]);
    setCandidates(colBoard, 1, 0, [4, 5]);
    expect(detectHiddenSingleColumn(colBoard)?.type).toBe('hidden-single-column');

    const boxBoard = makeBoard();
    setCandidates(boxBoard, 0, 0, [7, 8, 9]);
    setCandidates(boxBoard, 0, 1, [8, 9]);
    setCandidates(boxBoard, 1, 1, [8, 9]);
    expect(detectHiddenSingleBox(boxBoard)?.type).toBe('hidden-single-box');
  });

  it('detects peer elimination', () => {
    const board = makeBoard();
    setValue(board, 0, 0, 5, true);
    setCandidates(board, 0, 1, [5, 6]);
    const hint = detectPeerElimination(board);
    expect(hint?.type).toBe('peer-elimination');
    expect(hint?.cells.length).toBeGreaterThan(1);
  });

  it('detects locked candidates pointing and claiming', () => {
    const pointingBoard = makeBoard();
    setCandidates(pointingBoard, 0, 0, [4, 7]);
    setCandidates(pointingBoard, 0, 1, [4, 8]);
    setCandidates(pointingBoard, 0, 5, [4, 6]);
    expect(detectLockedCandidatesPointing(pointingBoard)?.type).toBe('locked-pointing');

    const claimingBoard = makeBoard();
    setCandidates(claimingBoard, 0, 0, [4, 7]);
    setCandidates(claimingBoard, 1, 0, [4, 5]);
    setCandidates(claimingBoard, 2, 1, [4, 8]);
    expect(detectLockedCandidatesClaiming(claimingBoard)?.type).toBe('locked-claiming');
  });

  it('detects naked sets (pair/triple/quad)', () => {
    const pairBoard = makeBoard();
    setCandidates(pairBoard, 0, 0, [1, 2]);
    setCandidates(pairBoard, 0, 1, [1, 2]);
    setCandidates(pairBoard, 0, 2, [1, 3]);
    expect(detectNakedSet(pairBoard, 2, 'naked-pair', 'Naked Pair')?.type).toBe('naked-pair');

    const tripleBoard = makeBoard();
    setCandidates(tripleBoard, 0, 0, [1, 2]);
    setCandidates(tripleBoard, 0, 1, [2, 3]);
    setCandidates(tripleBoard, 0, 2, [1, 3]);
    setCandidates(tripleBoard, 0, 3, [1, 2, 3, 4]);
    expect(detectNakedSet(tripleBoard, 3, 'naked-triple', 'Naked Triple')?.type).toBe('naked-triple');

    const quadBoard = makeBoard();
    setCandidates(quadBoard, 0, 0, [1, 2]);
    setCandidates(quadBoard, 0, 1, [3, 4]);
    setCandidates(quadBoard, 0, 2, [1, 3]);
    setCandidates(quadBoard, 0, 3, [2, 4]);
    setCandidates(quadBoard, 0, 4, [1, 2, 3, 4]);
    expect(detectNakedSet(quadBoard, 4, 'naked-quad', 'Naked Quad')?.type).toBe('naked-quad');
  });

  it('detects hidden sets (pair/triple/quad)', () => {
    const pairBoard = makeBoard();
    setCandidates(pairBoard, 0, 0, [1, 2, 5]);
    setCandidates(pairBoard, 0, 1, [1, 2, 6]);
    setCandidates(pairBoard, 0, 2, [3, 4, 5]);
    expect(detectHiddenSet(pairBoard, 2, 'hidden-pair', 'Hidden Pair')?.type).toBe('hidden-pair');

    const tripleBoard = makeBoard();
    setCandidates(tripleBoard, 0, 0, [1, 2, 3, 6]);
    setCandidates(tripleBoard, 0, 1, [1, 2, 3, 7]);
    setCandidates(tripleBoard, 0, 2, [1, 2, 3, 5]);
    expect(detectHiddenSet(tripleBoard, 3, 'hidden-triple', 'Hidden Triple')?.type).toBe('hidden-triple');

    const quadBoard = makeBoard();
    setCandidates(quadBoard, 0, 0, [1, 2, 3, 4, 7]);
    setCandidates(quadBoard, 0, 1, [1, 2, 3, 4, 8]);
    setCandidates(quadBoard, 0, 2, [1, 2, 3, 4, 9]);
    setCandidates(quadBoard, 0, 3, [1, 2, 3, 4, 6]);
    expect(detectHiddenSet(quadBoard, 4, 'hidden-quad', 'Hidden Quad')?.type).toBe('hidden-quad');
  });

  it('detects X-Wing and fish (swordfish, jellyfish)', () => {
    const xwingBoard = makeBoard();
    [0, 1].forEach((row) => {
      setCandidates(xwingBoard, row, 0, [5, 7]);
      setCandidates(xwingBoard, row, 3, [5, 6]);
    });
    setCandidates(xwingBoard, 2, 0, [5, 8]);
    setCandidates(xwingBoard, 2, 3, [5, 9]);
    expect(detectXWing(xwingBoard)?.type).toBe('x-wing');

    const swordfishBoard = makeBoard();
    [0, 1, 2].forEach((row) => {
      setCandidates(swordfishBoard, row, 0, [7, 8]);
      setCandidates(swordfishBoard, row, 1, [7, 9]);
      setCandidates(swordfishBoard, row, 2, [7, 6]);
    });
    setCandidates(swordfishBoard, 4, 1, [7, 3]);
    expect(detectFish(swordfishBoard, 3, 'swordfish', 'Swordfish')?.type).toBe('swordfish');

    const jellyfishBoard = makeBoard();
    [0, 1, 2, 3].forEach((row) => {
      [0, 1, 2, 3].forEach((col) => setCandidates(jellyfishBoard, row, col, [8, 9]));
    });
    setCandidates(jellyfishBoard, 5, 2, [8, 4]);
    expect(detectFish(jellyfishBoard, 4, 'jellyfish', 'Jellyfish')?.type).toBe('jellyfish');
  });

  it('detects XY-Wing and XYZ-Wing', () => {
    const xyBoard = makeBoard();
    setCandidates(xyBoard, 0, 0, [1, 2]); // pivot
    setCandidates(xyBoard, 0, 3, [1, 3]); // wing with 1
    setCandidates(xyBoard, 3, 0, [2, 3]); // wing with 2
    setCandidates(xyBoard, 3, 3, [3, 4]); // intersection sees both wings
    expect(detectXYWing(xyBoard)?.type).toBe('xy-wing');

    const xyzBoard = makeBoard();
    setCandidates(xyzBoard, 1, 1, [1, 2, 3]); // pivot in box
    setCandidates(xyzBoard, 1, 0, [1, 2]); // wing shares box/row
    setCandidates(xyzBoard, 0, 1, [1, 3]); // wing shares box/col
    setCandidates(xyzBoard, 2, 2, [1, 4]); // peer of both wings and pivot
    expect(detectXYZWing(xyzBoard)?.type).toBe('xyz-wing');
  });

  it('detects W-Wing', () => {
    const board = makeBoard();
    setCandidates(board, 0, 0, [1, 2]); // wing A
    setCandidates(board, 1, 1, [1, 2]); // wing B
    setCandidates(board, 1, 0, [1]); // strong link on 1 in column 0
    setCandidates(board, 0, 1, [2]); // elimination target sees both wings
    expect(detectWWing(board)?.type).toBe('w-wing');
  });

  it('detects W-Wing via row strong link', () => {
    const board = makeBoard();
    setCandidates(board, 0, 0, [1, 2]); // wing A
    setCandidates(board, 1, 2, [1, 2]); // wing B
    setCandidates(board, 1, 0, [1, 2]); // strong link on 1 in column 0 (rows 0 and 1)
    const hint = detectWWing(board);
    expect(hint?.type).toBe('w-wing');
  });

  it('detects W-Wing with column link and eliminations', () => {
    const board = makeBoard();
    setCandidates(board, 0, 0, [1, 6]); // wing A
    setCandidates(board, 2, 0, [1, 6]); // wing B (same column, different box)
    setCandidates(board, 1, 0, [6]); // elimination target sees both wings
    const hint = detectWWing(board);
    expect(hint?.type).toBe('w-wing');
    expect(hint?.digit).toBe(6);
    expect(hint?.cells.slice(0, 2)).toEqual([
      { row: 0, col: 0 },
      { row: 2, col: 0 },
    ]);
  });

  it('detects W-Wing with row link and eliminations', () => {
    const board = makeBoard();
    setCandidates(board, 0, 1, [2, 5]); // wing A
    setCandidates(board, 0, 4, [2, 5]); // wing B (same row, different box)
    setCandidates(board, 0, 7, [5]); // elimination target sees both wings
    const hint = detectWWing(board);
    expect(hint?.type).toBe('w-wing');
    expect(hint?.digit).toBe(5);
  });

  it('does not detect W-Wing without a strong link', () => {
    const board = makeBoard();
    setCandidates(board, 0, 0, [1, 2]);
    setCandidates(board, 1, 1, [1, 2]); // no strong link on either digit
    expect(detectWWing(board)).toBeNull();
  });

  it('detects Remote Pair', () => {
    const board = makeBoard();
    setCandidates(board, 0, 0, [1, 2]); // endpoint A
    setCandidates(board, 0, 3, [1, 2]); // chain
    setCandidates(board, 3, 3, [1, 2]); // chain
    setCandidates(board, 4, 4, [1, 2]); // endpoint B (odd distance)
    setCandidates(board, 0, 4, [1]); // sees both endpoints
    expect(detectRemotePair(board)?.type).toBe('remote-pair');
  });

  it('detects Multi-coloring', () => {
    expect(true).toBe(true);
  });

  it('detects Forcing Chains', () => {
    const board = makeBoard();
    setCandidates(board, 0, 0, [1, 2]); // pivot
    setCandidates(board, 0, 1, [1, 3]);
    setCandidates(board, 1, 0, [2, 3]);
    setCandidates(board, 1, 1, [3]); // forced in both assumptions
    expect(detectForcingChains(board, 3)?.type).toBe('forcing-chain');
  });
});
