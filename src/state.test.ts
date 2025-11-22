import { describe, expect, it } from 'vitest';
import { decodeGameState, encodeGameState, findHint, type CellState } from './App';

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

  it('detects W-Wing in provided snapshot', () => {
    const encoded =
      'AwAEAAoAJgAOABAADAAIABIAIgAQACgAMgUAACoFAAAsAA4ABCEAYABhAAAoADIAJAAKABAAJiQAACQAKgAQACIMAAASKAAALiQBJAEAKAAkJAAADgACAAoAEAAuACIAEAAKKAAAMgAmAAQoAAAKJAAjACUADgAAMAAOLAAAMgUBABAhACUBAC4dAAAELAA4AAAoZAFiACQBBgAUAAAwACIwAAAEAAoAJgAOABAADAgBCAEAIgAQACgAMgUAACoFAAAsAA4ABCEAYABhAAAoADIAJAAKABAAJiQBACQAKgAQACIMAAgBKAEALiQBpAEAKAAkJAAADgACMAGwAAAuACKgAAAKKAAAMgAmAASoADUAJAAjACUALgAAMAAOPAAAMjUBpAGhACUBAC4dAAAEPAA4AAAoZAFiACQBJgAUAAAwACIwACU3hkkYSTUWchdkklgzJYFJZ2lCNxWHGFaTJFYhSHOZgWcyRUN5JYFg';
    const decoded = decodeGameState(encoded);
    expect(decoded).not.toBeNull();
    const hint = decoded ? findHint(decoded.board) : null;
    expect(hint?.type).toBe('w-wing');
    if (!decoded || !hint) {
      return;
    }
    expect(hint.cells.length).toBeGreaterThanOrEqual(3);
    const [wingA, wingB, ...elims] = hint.cells;
    const a = decoded.board[wingA.row][wingA.col];
    const b = decoded.board[wingB.row][wingB.col];
    expect(a.candidates.sort()).toEqual(b.candidates.sort());
    expect(a.candidates.length).toBe(2);
    const [x, y] = a.candidates;

    const hasStrongLinkInCol = (col: number, rows: number[]) => {
      const positions = decoded.board
        .map((r, idx) => ({ row: idx, cell: r[col] }))
        .filter(({ cell }) => isEditable(cell) && cell.candidates.includes(x))
        .map(({ row }) => row);
      return positions.length === 2 && rows.every((r) => positions.includes(r));
    };
    const hasStrongLinkInRow = (row: number, cols: number[]) => {
      const positions = decoded.board[row]
        .map((cell, idx) => ({ col: idx, cell }))
        .filter(({ cell }) => isEditable(cell) && cell.candidates.includes(x))
        .map(({ col }) => col);
      return positions.length === 2 && cols.every((c) => positions.includes(c));
    };

    const strongLinkExists =
      hasStrongLinkInCol(wingA.col, [wingA.row, wingB.row]) ||
      hasStrongLinkInCol(wingB.col, [wingA.row, wingB.row]) ||
      hasStrongLinkInRow(wingA.row, [wingA.col, wingB.col]) ||
      hasStrongLinkInRow(wingB.row, [wingA.col, wingB.col]);
    expect(strongLinkExists).toBe(true);

    elims.forEach(({ row, col }) => {
      const cell = decoded.board[row][col];
      expect(isEditable(cell)).toBe(true);
      expect(cell.candidates.includes(y)).toBe(true);
    });
  });
});

const isEditable = (cell: CellState) => !cell.given && cell.value === null;
