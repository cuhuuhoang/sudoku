import { describe, expect, it } from 'vitest';
import { runAutomation, type CellState } from './App';

const makeBoard = (): CellState[][] =>
  Array.from({ length: 9 }, (_row, row) =>
    Array.from({ length: 9 }, (_col, col) => ({
      row,
      col,
      value: null,
      given: false,
      candidates: [],
    })),
  );

describe('runAutomation hidden singles', () => {
  it('promotes a hidden single in a row when enabled', () => {
    const board = makeBoard();
    board[0][0].candidates = [3, 5, 6, 7];
    board[0][1].candidates = [4, 5]; // only spot for 4 in row 0
    board[0][2].candidates = [3, 5, 6, 7];
    board[1][0].candidates = [3, 4, 5, 6, 7];
    board[1][1].candidates = [4, 5, 6, 7];
    board[1][2].candidates = [4, 5, 6, 7];
    board[2][0].candidates = [3, 4, 5, 6, 7];
    board[2][1].candidates = [3, 4, 5, 6, 7];
    board[2][2].candidates = [3, 4, 5, 6, 7];

    const { board: processed, promoted } = runAutomation(board, {
      cleanup: true,
      promote: false,
      hiddenSingles: true,
    });

    expect(promoted).toBeGreaterThanOrEqual(1);
    expect(processed[0][1].value).toBe(4);
    expect(processed[1][1].candidates.includes(4)).toBe(false);
  });

  it('respects the hidden single toggle', () => {
    const board = makeBoard();
    board[0][0].candidates = [3, 5];
    board[0][1].candidates = [4, 5]; // would be a hidden single if enabled

    const { board: processed, promoted } = runAutomation(board, {
      cleanup: false,
      promote: false,
      hiddenSingles: false,
    });

    expect(promoted).toBe(0);
    expect(processed[0][1].value).toBeNull();
  });

  it('promotes a hidden single inside a 3x3 box', () => {
    const board = makeBoard();
    board[0][0].candidates = [2, 7];
    board[0][1].candidates = [2, 3];
    board[1][0].candidates = [2, 3];
    board[1][1].candidates = [2, 3];
    // digit 7 only appears once in the top-left box and is not a naked single

    const { board: processed, promoted } = runAutomation(board, {
      cleanup: false,
      promote: false,
      hiddenSingles: true,
    });

    expect(promoted).toBeGreaterThanOrEqual(1);
    expect(processed[0][0].value).toBe(7);
  });
});
