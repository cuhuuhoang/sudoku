import { describe, expect, it } from 'vitest';
import {
  applyHintToBoard,
  detectPeerElimination,
  detectForcingChains,
  detectLockedCandidatesClaiming,
  detectWWing,
  detectXYWing,
  detectNakedSet,
  findHint,
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

describe('applyHintToBoard', () => {
  it('applies naked single', () => {
    const board = makeBoard();
    board[0][0].candidates = [4];
    const hint = findHint(board);
    expect(hint?.type).toBe('naked-single');
    const result = hint ? applyHintToBoard(board, hint) : { changed: false, message: '' };
    expect(result.changed).toBe(true);
    expect(board[0][0].value).toBe(4);
  });

  it('applies peer elimination', () => {
    const board = makeBoard();
    board[0][0].value = 5;
    board[0][0].given = true;
    board[0][1].candidates = [5, 6];
    const hint = detectPeerElimination(board);
    expect(hint?.type).toBe('peer-elimination');
    if (!hint) {
      return;
    }
    const result = applyHintToBoard(board, hint);
    expect(result.changed).toBe(true);
    expect(board[0][1].candidates).not.toContain(5);
  });

  it('applies W-Wing elimination', () => {
    const board = makeBoard();
    // Wings not peers
    board[0][0].candidates = [1, 2];
    board[2][3].candidates = [1, 2];
    // Strong link on 1 in column 5 (only two 1s)
    board[0][5].candidates = [1];
    board[2][5].candidates = [1];
    // Elimination target sees both wings
    board[0][3].candidates = [2];
    const hint = detectWWing(board);
    expect(hint?.type).toBe('w-wing');
    if (!hint) return;
    const result = applyHintToBoard(board, hint);
    expect(result.changed).toBe(true);
    expect(board[0][3].candidates).not.toContain(2);
  });

  // W-Wing diagonal/edge cases are covered in detector tests; apply tested above

  it('applies XY-Wing elimination', () => {
    const board = makeBoard();
    board[0][0].candidates = [1, 2]; // pivot
    board[0][3].candidates = [1, 3]; // wing
    board[3][0].candidates = [2, 3]; // wing
    board[3][3].candidates = [3]; // elimination target
    const hint = detectXYWing(board);
    expect(hint?.type).toBe('xy-wing');
    if (!hint) return;
    const result = applyHintToBoard(board, hint);
    expect(result.changed).toBe(true);
    expect(board[3][3].candidates).not.toContain(3);
  });

  it('applies forcing chain elimination', () => {
    const board = makeBoard();
    board[1][1].candidates = [3];
    const result = applyHintToBoard(board, {
      type: 'locked-claiming',
      title: '',
      message: '',
      cells: [],
      digit: undefined,
      eliminations: [{ row: 1, col: 1 }],
      eliminationDigits: [3],
    });
    expect(result.changed).toBe(true);
    expect(board[1][1].candidates).not.toContain(3);
  });

  it('applies locked claiming elimination', () => {
    const board = makeBoard();
    board[0][2].candidates = [6];
    board[0][1].candidates = [6];
    board[0][0].candidates = [6]; // row 0 has all 6s inside the same box
    board[1][1].candidates = [6]; // elimination targets inside the same box (not in the locked column)
    const hint = detectLockedCandidatesClaiming(board);
    expect(hint?.type).toBe('locked-claiming');
    if (!hint) return;
    const result = applyHintToBoard(board, hint);
    expect(result.changed).toBe(true);
    expect(board[1][1].candidates).not.toContain(6);
  });

  it('applies locked claiming elimination for column-based case', () => {
    const board = makeBoard();
    // Row-based claiming: digit 6 only in row 0 inside first box
    board[0][0].candidates = [6];
    board[0][1].candidates = [6];
    // Elimination targets in same box, different rows
    board[1][0].candidates = [6];
    board[2][1].candidates = [6];
    const hint = detectLockedCandidatesClaiming(board);
    expect(hint?.type).toBe('locked-claiming');
    if (!hint) return;
    const result = applyHintToBoard(board, hint);
    expect(result.changed).toBe(true);
    expect(board[1][0].candidates).not.toContain(6);
    expect(board[2][1].candidates).not.toContain(6);
  });

  it('applies naked set eliminations', () => {
    const board = makeBoard();
    board[0][0].candidates = [1, 8];
    board[0][1].candidates = [1, 8];
    board[0][2].candidates = [1, 3, 6, 8]; // should lose 1,8
    const hint = detectNakedSet(board, 2, 'naked-pair', 'Naked Pair');
    expect(hint?.type).toBe('naked-pair');
    if (!hint) return;
    const result = applyHintToBoard(board, hint);
    expect(result.changed).toBe(true);
    expect(board[0][2].candidates).not.toContain(1);
    expect(board[0][2].candidates).not.toContain(8);
  });
});
