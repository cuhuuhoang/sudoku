import { describe, expect, it } from 'vitest';
import { decodeGameState, encodeGameState, type CellState } from './App';

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

describe('state encoding', () => {
  it('roundtrips a populated board', () => {
    const board = makeBoard();
    board[0][0].value = 5;
    board[0][0].given = true;
    board[0][1].candidates = [1, 3, 9];
    board[4][4].value = 7;
    board[7][2].candidates = [2, 4, 6, 8];

    const initialBoard = makeBoard();
    initialBoard[0][0].value = 5;
    initialBoard[0][0].given = true;

    const solution = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 1));

    const encoded = encodeGameState({
      level: 'medium',
      board,
      initialBoard,
      solution,
    });

    expect(encoded.length).toBeLessThan(600);

    const decoded = decodeGameState(encoded);
    expect(decoded?.level).toBe('medium');
    expect(decoded?.board[0][0].value).toBe(5);
    expect(decoded?.board[0][0].given).toBe(true);
    expect(decoded?.board[0][1].candidates).toEqual([1, 3, 9]);
    expect(decoded?.board[7][2].candidates).toEqual([2, 4, 6, 8]);
    expect(decoded?.solution[0][0]).toBe(1);
  });

  it('returns null for invalid data', () => {
    expect(decodeGameState('')).toBeNull();
    expect(decodeGameState('@@@')).toBeNull();
  });
});
