import { describe, expect, it } from 'vitest';
import { generateSudoku, type Difficulty } from './sudoku';

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const isValidGroup = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.every((value, index) => value === index + 1);
};

describe('generateSudoku', () => {
  it('produces a solved grid with valid rows, columns, and boxes', () => {
    const { solution } = generateSudoku('easy');

    solution.forEach((row) => {
      expect(isValidGroup(row)).toBe(true);
    });

    for (let col = 0; col < 9; col += 1) {
      const column = solution.map((row) => row[col]);
      expect(isValidGroup(column)).toBe(true);
    }

    for (let blockRow = 0; blockRow < 3; blockRow += 1) {
      for (let blockCol = 0; blockCol < 3; blockCol += 1) {
        const values: number[] = [];
        for (let r = 0; r < 3; r += 1) {
          for (let c = 0; c < 3; c += 1) {
            values.push(solution[blockRow * 3 + r][blockCol * 3 + c]);
          }
        }
        expect(isValidGroup(values)).toBe(true);
      }
    }
  });

  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

  difficulties.forEach((difficulty) => {
    it(`respects givens for ${difficulty} puzzles`, () => {
      const { puzzle, solution } = generateSudoku(difficulty);

      puzzle.forEach((row, rowIdx) => {
        row.forEach((value, colIdx) => {
          if (value !== 0) {
            expect(value).toBe(solution[rowIdx][colIdx]);
          }
        });
      });

      const zeroCount = puzzle.flat().filter((value) => value === 0).length;
      expect(zeroCount).toBeGreaterThan(0);
      expect(zeroCount).toBeLessThan(81);
    });
  });

  it('produces varied puzzles for the same difficulty', () => {
    const first = generateSudoku('medium');
    const second = generateSudoku('medium');

    const firstSignature = first.puzzle.flat().join('');
    const secondSignature = second.puzzle.flat().join('');

    expect(firstSignature).not.toBe(secondSignature);
  });

  it('never exposes any digits outside 0-9', () => {
    const { puzzle, solution } = generateSudoku('hard');
    const combined = [...puzzle.flat(), ...solution.flat()];

    combined.forEach((value) => {
      expect(DIGITS.includes(value) || value === 0).toBe(true);
    });
  });
});
