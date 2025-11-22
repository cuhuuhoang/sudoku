export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GeneratedSudoku {
  puzzle: number[][];
  solution: number[][];
}

export const DIFFICULTY_EMPTY_CELLS: Record<Difficulty, number> = {
  easy: 32,
  medium: 45,
  hard: 55,
};

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function createEmptyGrid(): number[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function shuffle<T>(source: T[]): T[] {
  const arr = [...source];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isSafe(grid: number[][], row: number, col: number, candidate: number): boolean {
  for (let i = 0; i < 9; i += 1) {
    if (grid[row][i] === candidate || grid[i][col] === candidate) {
      return false;
    }
  }

  const startRow = Math.floor(row / 3) * 3;
  const startCol = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      if (grid[startRow + r][startCol + c] === candidate) {
        return false;
      }
    }
  }

  return true;
}

function fillGrid(grid: number[][], cellIndex = 0): boolean {
  if (cellIndex === 81) {
    return true;
  }

  const row = Math.floor(cellIndex / 9);
  const col = cellIndex % 9;

  if (grid[row][col] !== 0) {
    return fillGrid(grid, cellIndex + 1);
  }

  const choices = shuffle(DIGITS);
  for (const value of choices) {
    if (isSafe(grid, row, col, value)) {
      grid[row][col] = value;
      if (fillGrid(grid, cellIndex + 1)) {
        return true;
      }
    }
  }

  grid[row][col] = 0;
  return false;
}

function findEmptyCell(grid: number[][]): [number, number] | null {
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      if (grid[row][col] === 0) {
        return [row, col];
      }
    }
  }

  return null;
}

function countSolutions(grid: number[][], limit = 2): number {
  const empty = findEmptyCell(grid);
  if (!empty) {
    return 1;
  }

  const [row, col] = empty;
  let solutions = 0;
  for (const value of DIGITS) {
    if (isSafe(grid, row, col, value)) {
      grid[row][col] = value;
      solutions += countSolutions(grid, limit);
      grid[row][col] = 0;
      if (solutions >= limit) {
        return solutions;
      }
    }
  }

  return solutions;
}

function carveHoles(source: number[][], emptyCells: number): number[][] {
  const grid = source.map((row) => [...row]);
  let removed = 0;
  let attempts = 0;
  const maxAttempts = 4000;

  while (removed < emptyCells && attempts < maxAttempts) {
    attempts += 1;
    const row = Math.floor(Math.random() * 9);
    const col = Math.floor(Math.random() * 9);

    if (grid[row][col] === 0) {
      continue;
    }

    const backup = grid[row][col];
    grid[row][col] = 0;

    const snapshot = grid.map((r) => [...r]);
    if (countSolutions(snapshot, 2) !== 1) {
      grid[row][col] = backup;
    } else {
      removed += 1;
    }
  }

  return grid;
}

export function generateSudoku(difficulty: Difficulty): GeneratedSudoku {
  const solution = createEmptyGrid();
  fillGrid(solution);
  const holes = DIFFICULTY_EMPTY_CELLS[difficulty];
  const puzzle = carveHoles(solution, holes);
  return {
    puzzle,
    solution: solution.map((row) => [...row]),
  };
}
