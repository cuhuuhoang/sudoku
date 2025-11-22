export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GeneratedSudoku {
  puzzle: number[][];
  solution: number[][];
}

import { getSudoku } from 'sudoku-gen';

const sequenceToGrid = (sequence: string): number[][] => {
  if (sequence.length !== 81) {
    throw new Error(`Invalid sudoku sequence length: expected 81, received ${sequence.length}`);
  }
  const values = sequence.split('').map((char) => {
    if (char === '-' || char === '0') {
      return 0;
    }
    const digit = Number(char);
    if (Number.isNaN(digit) || digit < 1 || digit > 9) {
      throw new Error(`Unexpected character in sudoku sequence: "${char}"`);
    }
    return digit;
  });
  return Array.from({ length: 9 }, (_row, row) => values.slice(row * 9, row * 9 + 9));
};

export function generateSudoku(difficulty: Difficulty): GeneratedSudoku {
  const generated = getSudoku(difficulty);
  const puzzle = sequenceToGrid(generated.puzzle);
  const solution = sequenceToGrid(generated.solution);
  return { puzzle, solution };
}
