declare module 'sudoku' {
  export function makepuzzle(): (number | null)[];
  export function solvepuzzle(puzzle: (number | null)[]): (number | null)[];
}
