import { describe, expect, it } from 'vitest';
import {
  applyHintToBoard,
  detectPeerElimination,
  detectForcingChains,
  detectLockedCandidatesClaiming,
  detectWWing,
  detectXYWing,
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
    board[0][0].candidates = [1, 2];
    board[1][2].candidates = [1, 2];
    board[1][0].candidates = [1, 2]; // strong link on 1 in column 0
    board[2][2].candidates = [2]; // elimination target sees both wings
    const hint = detectWWing(board);
    expect(hint?.type).toBe('w-wing');
    if (!hint) return;
    const result = applyHintToBoard(board, hint);
    expect(result.changed).toBe(true);
    expect(board[2][2].candidates).not.toContain(2);
  });

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
    const hint = {
      type: 'forcing-chain' as const,
      title: 'Forcing Chain',
      message: 'Sample chain',
      cells: [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
      ],
      digit: 3,
      eliminationStartIndex: 1,
    };
    const result = applyHintToBoard(board, hint);
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
    // Simulate a column-claiming hint manually
    const hint = {
      type: 'locked-claiming' as const,
      title: 'Locked Candidates (Claiming)',
      message: '',
      digit: 6,
      cells: [
        { row: 3, col: 2 },
        { row: 4, col: 2 },
        { row: 5, col: 2 },
        { row: 3, col: 0 },
        { row: 4, col: 0 },
        { row: 5, col: 1 },
      ],
      eliminationStartIndex: 3,
    };
    board[3][0].candidates = [6];
    board[4][0].candidates = [6];
    board[5][1].candidates = [6];
    const result = applyHintToBoard(board, hint);
    expect(result.changed).toBe(true);
    expect(board[3][0].candidates).not.toContain(6);
    expect(board[4][0].candidates).not.toContain(6);
    expect(board[5][1].candidates).not.toContain(6);
  });
});
