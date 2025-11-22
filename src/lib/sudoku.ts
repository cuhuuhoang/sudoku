export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GeneratedSudoku {
  puzzle: number[][];
  solution: number[][];
}

import * as sudokuLib from 'sudoku';

type ExternalSudoku = {
  makepuzzle: () => (number | null)[];
  solvepuzzle: (puzzle: (number | null)[]) => (number | null)[];
} | null;

// Vite bundles the library; if missing, surface a clear error immediately.
const externalSudoku: ExternalSudoku =
  sudokuLib && typeof sudokuLib.makepuzzle === 'function' && typeof sudokuLib.solvepuzzle === 'function'
    ? sudokuLib
    : null;

export const DIFFICULTY_EMPTY_CELLS: Record<Difficulty, number> = {
  easy: 32,
  medium: 45,
  hard: 55,
};

export function generateSudoku(difficulty: Difficulty): GeneratedSudoku {
  const holes = DIFFICULTY_EMPTY_CELLS[difficulty];

  if (!externalSudoku) {
    throw new Error('Sudoku generator library "sudoku" is not installed.');
  }

  const rawPuzzle = externalSudoku.makepuzzle();
  const rawSolution = externalSudoku.solvepuzzle(rawPuzzle);
  const solution = Array.from({ length: 9 }, (_, row) =>
    Array.from({ length: 9 }, (__ , col) => {
      const value = rawSolution[row * 9 + col];
      return value === null ? 0 : (value as number) + 1;
    }),
  );
  const puzzle = solution.map((row) => [...row]);
  let removed = 0;
  while (removed < holes) {
    const idx = Math.floor(Math.random() * 81);
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    if (puzzle[r][c] !== 0) {
      puzzle[r][c] = 0;
      removed += 1;
    }
  }
  return { puzzle, solution };
}
