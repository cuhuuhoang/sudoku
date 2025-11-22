import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import './App.css';
import { Difficulty, generateSudoku } from './lib/sudoku';

type Screen = 'setup' | 'game';
type Theme = 'light' | 'dark';

interface CellState {
  row: number;
  col: number;
  value: number | null;
  given: boolean;
  candidates: number[];
}

interface CellPointer {
  row: number;
  col: number;
}

interface SavedGame {
  level: Difficulty;
  board: CellState[][];
  initialBoard: CellState[][];
  solution: number[][];
}

const STORAGE_KEY = 'sudoku-current-game-v1';
const THEME_KEY = 'sudoku-theme';
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const difficultyOptions: { id: Difficulty; title: string; subtitle: string }[] = [
  { id: 'easy', title: 'Easy', subtitle: 'Gentle starter – plenty of givens.' },
  { id: 'medium', title: 'Medium', subtitle: 'Balanced challenge with steady flow.' },
  { id: 'hard', title: 'Hard', subtitle: 'Sparse clues, focus and patience required.' },
];

const cloneBoard = (board: CellState[][]): CellState[][] =>
  board.map((row) =>
    row.map((cell) => ({
      ...cell,
      candidates: [...new Set(cell.candidates ?? [])],
    })),
  );

const createBoardFromPuzzle = (puzzle: number[][]): CellState[][] =>
  puzzle.map((row, rowIndex) =>
    row.map((value, colIndex) => ({
      row: rowIndex,
      col: colIndex,
      value: value === 0 ? null : value,
      given: value !== 0,
      candidates: value === 0 ? [...DIGITS] : [],
    })),
  );

const isBrowser = typeof window !== 'undefined';

const readSavedGame = (): SavedGame | null => {
  if (!isBrowser) {
    return null;
  }

  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as SavedGame;
    return {
      ...parsed,
      board: parsed.board ? cloneBoard(parsed.board) : [],
      initialBoard: parsed.initialBoard ? cloneBoard(parsed.initialBoard) : [],
      solution: parsed.solution ? parsed.solution.map((row) => [...row]) : [],
    };
  } catch (error) {
    console.warn('Unable to read saved game', error);
    return null;
  }
};

const persistGame = (payload: SavedGame) => {
  if (!isBrowser) {
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...payload,
      board: payload.board,
      initialBoard: payload.initialBoard,
    }),
  );
};

const autoCleanCandidates = (source: CellState[][]): CellState[][] => {
  const board = cloneBoard(source);
  board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.value === null) {
        cell.candidates = [...new Set(cell.candidates)].sort();
      } else {
        cell.candidates = [];
      }
    });
  });

  const removeFromPeers = (row: number, col: number, value: number) => {
    board[row].forEach((peer, idx) => {
      if (idx !== col && peer.value === null && peer.candidates.includes(value)) {
        peer.candidates = peer.candidates.filter((v) => v !== value);
      }
    });

    board.forEach((peerRow, idx) => {
      if (idx !== row) {
        const peer = peerRow[col];
        if (peer.value === null && peer.candidates.includes(value)) {
          peer.candidates = peer.candidates.filter((v) => v !== value);
        }
      }
    });

    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = startRow; r < startRow + 3; r += 1) {
      for (let c = startCol; c < startCol + 3; c += 1) {
        if ((r !== row || c !== col) && board[r][c].value === null) {
          const peer = board[r][c];
          if (peer.candidates.includes(value)) {
            peer.candidates = peer.candidates.filter((v) => v !== value);
          }
        }
      }
    }
  };

  board.forEach((row, rowIdx) => {
    row.forEach((cell, colIdx) => {
      if (cell.value !== null) {
        removeFromPeers(rowIdx, colIdx, cell.value);
      }
    });
  });

  return board;
};

const promoteSingles = (source: CellState[][]): { board: CellState[][]; promoted: number } => {
  const board = cloneBoard(source);
  let promoted = 0;
  board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.given && cell.value === null && cell.candidates.length === 1) {
        cell.value = cell.candidates[0];
        cell.candidates = [];
        promoted += 1;
      }
    });
  });
  return { board, promoted };
};

const runAutomation = (source: CellState[][]): { board: CellState[][]; promoted: number } => {
  let working = autoCleanCandidates(source);
  let totalPromoted = 0;
  while (true) {
    const { board: promotedBoard, promoted } = promoteSingles(working);
    if (promoted === 0) {
      return { board: working, promoted: totalPromoted };
    }
    totalPromoted += promoted;
    working = autoCleanCandidates(promotedBoard);
  }
};

function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [board, setBoard] = useState<CellState[][]>([]);
  const [initialBoard, setInitialBoard] = useState<CellState[][]>([]);
  const [solution, setSolution] = useState<number[][]>([]);
  const [level, setLevel] = useState<Difficulty>('easy');
  const [selectedCell, setSelectedCell] = useState<CellPointer | null>(null);
  const [status, setStatus] = useState('');
  const [hasSavedGame, setHasSavedGame] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const hasRestored = useRef(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [history, setHistory] = useState<CellState[][][]>([]);

  useEffect(() => {
    if (hasRestored.current) {
      return;
    }
    hasRestored.current = true;
    const saved = readSavedGame();
    setHasSavedGame(Boolean(saved));
    if (saved) {
      const { board: processedBoard, promoted } = runAutomation(saved.board);
      const { board: processedInitial } = runAutomation(saved.initialBoard);
      setBoard(processedBoard);
      setInitialBoard(processedInitial);
      setSolution(saved.solution);
      setLevel(saved.level);
      setScreen('game');
      setSelectedCell(null);
      setStatus(
        promoted
          ? `Resumed & auto promoted ${promoted} single${promoted > 1 ? 's' : ''}.`
          : 'Resumed your saved puzzle.',
      );
    } else {
      setStatus('Pick a level to play.');
    }
  }, []);

  useEffect(() => {
    if (!isBrowser) {
      return;
    }
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    if (!isBrowser) {
      return;
    }
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const recordSnapshot = () => {
    if (!board.length) {
      return;
    }
    setHistory((prev) => {
      const next = [...prev, cloneBoard(board)];
      if (next.length > 3) {
        next.shift();
      }
      return next;
    });
  };

  const handleUndo = () => {
    if (!history.length) {
      setStatus('Nothing to undo.');
      return;
    }
    const previous = history[history.length - 1];
    setBoard(cloneBoard(previous));
    setHistory((prev) => prev.slice(0, -1));
    setSelectedCell(null);
    setStatus('Reverted last manual change.');
  };

  const selectedCellData = selectedCell ? board[selectedCell.row]?.[selectedCell.col] ?? null : null;
  const canUndo = history.length > 0;

  const commitBoardChange = (mutator: (draft: CellState[][]) => void, fallbackMessage?: string) => {
    let promotions = 0;
    setBoard((prev) => {
      const next = cloneBoard(prev);
      mutator(next);
      const { board: processed, promoted } = runAutomation(next);
      promotions = promoted;
      return processed;
    });
    if (promotions > 0) {
      setStatus(`Auto promoted ${promotions} single${promotions > 1 ? 's' : ''}.`);
    } else if (fallbackMessage) {
      setStatus(fallbackMessage);
    } else {
      setStatus('');
    }
  };

  const startGame = (difficulty: Difficulty) => {
    setIsGenerating(true);
    setStatus('Generating puzzle...');
    setSelectedCell(null);

    try {
      const { puzzle, solution } = generateSudoku(difficulty);
      const seededBoard = createBoardFromPuzzle(puzzle);
      const { board: processedBoard, promoted } = runAutomation(seededBoard);
      setBoard(processedBoard);
      setInitialBoard(cloneBoard(processedBoard));
      setSolution(solution);
      setLevel(difficulty);
      setScreen('game');
      setHistory([]);
      setStatus(promoted ? `Auto promoted ${promoted} starter single${promoted > 1 ? 's' : ''}.` : '');
    } catch (error) {
      console.error(error);
      setStatus('Unable to generate a puzzle right now.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLoadSaved = () => {
    const saved = readSavedGame();
    if (!saved) {
      setStatus('No saved game found.');
      return;
    }

    const { board: processedBoard, promoted } = runAutomation(saved.board);
    const { board: processedInitial } = runAutomation(saved.initialBoard);
    setBoard(processedBoard);
    setInitialBoard(processedInitial);
    setSolution(saved.solution);
    setLevel(saved.level);
    setScreen('game');
    setSelectedCell(null);
    setHistory([]);
    setStatus(
      promoted ? `Loaded & auto promoted ${promoted} single${promoted > 1 ? 's' : ''}.` : 'Loaded saved puzzle.',
    );
    setHasSavedGame(true);
  };

  const handleResetBoard = () => {
    if (!initialBoard.length) {
      return;
    }

    if (isBrowser && !window.confirm('Reset the puzzle to its starting state? Your progress will be lost.')) {
      setStatus('Reset canceled.');
      return;
    }

    const { board: refreshedBoard, promoted } = runAutomation(cloneBoard(initialBoard));
    setBoard(refreshedBoard);
    setSelectedCell(null);
    setHistory([]);
    setStatus(
      promoted ? `Board reset with ${promoted} auto single${promoted > 1 ? 's' : ''}.` : 'Board reset to start.',
    );
  };

  const handleNewSameLevel = () => {
    if (isBrowser && !window.confirm(`Start a new ${level} puzzle? Current progress will be lost.`)) {
      setStatus('New puzzle canceled.');
      return;
    }
    startGame(level);
  };

  const handleSaveBoard = () => {
    if (!board.length) {
      return;
    }

    persistGame({
      board,
      initialBoard,
      solution,
      level,
    });
    setHasSavedGame(true);
    setStatus('Progress saved locally.');
  };

  const handleSetValue = (value: number | null) => {
    if (!selectedCellData || selectedCellData.given || !selectedCell) {
      return;
    }
    recordSnapshot();
    commitBoardChange(
      (draft) => {
        const cell = draft[selectedCell.row][selectedCell.col];
        cell.value = value;
        if (value !== null) {
          cell.candidates = [];
        }
      },
      value === null ? 'Value cleared.' : 'Value updated.',
    );
  };

  const handleToggleCandidate = (value: number) => {
    if (!selectedCellData || selectedCellData.given || selectedCellData.value !== null || !selectedCell) {
      return;
    }

    recordSnapshot();
    commitBoardChange(
      (draft) => {
        const cell = draft[selectedCell.row][selectedCell.col];
        const exists = cell.candidates.includes(value);
        cell.candidates = exists
          ? cell.candidates.filter((candidate) => candidate !== value)
          : [...cell.candidates, value].sort();
      },
      'Candidate updated.',
    );
  };

  const handleBackToLevels = () => {
    setScreen('setup');
    setStatus('Pick a level to play.');
    setSelectedCell(null);
  };

  const solved = useMemo(() => {
    if (!solution.length || !board.length) {
      return false;
    }

    return board.every((row, rowIdx) => row.every((cell, colIdx) => cell.value === solution[rowIdx][colIdx]));
  }, [board, solution]);

  useEffect(() => {
    if (solved) {
      setStatus('Puzzle solved! Great job.');
    }
  }, [solved]);

  return (
    <div className="app-shell">
      {screen === 'setup' && (
        <div className="card">
          <h1>Sudoku Trainer</h1>
          <p className="lead">Choose a difficulty to spin up a fresh puzzle or reload what you were working on.</p>
          <div className="levels">
            {difficultyOptions.map((option) => (
              <button
                key={option.id}
                className="level-option"
                disabled={isGenerating}
                onClick={() => startGame(option.id)}
              >
                <span className="level-title">{option.title}</span>
                <span className="level-subtitle">{option.subtitle}</span>
              </button>
            ))}
          </div>
          <button className="ghost" onClick={handleLoadSaved} disabled={!hasSavedGame}>
            Load Saved Game
          </button>
          {isGenerating && <p className="muted">{status}</p>}
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? 'Switch to Night Mode' : 'Switch to Day Mode'}
          </button>
        </div>
      )}

      {screen === 'game' && (
        <div className="game-layout">
          <div className="toolbar">
            <button className="ghost" onClick={handleBackToLevels}>
              ← Levels
            </button>
            <span className="badge">{level.toUpperCase()}</span>
          </div>

          <div className="play-area">
            <div className="board-stack">
              <div className="board-grid">
                {board.flatMap((row, rowIdx) =>
                  row.map((cell, colIdx) => {
                    const isSelected = selectedCell?.row === rowIdx && selectedCell?.col === colIdx;
                    const classes = ['cell'];
                    if (cell.given) {
                      classes.push('given');
                    }
                    if (isSelected) {
                      classes.push('selected');
                    }
                    if (cell.value && !cell.given && solution.length && cell.value !== solution[rowIdx][colIdx]) {
                      classes.push('warning');
                    }

                    const customBorder = {
                      borderTopWidth: rowIdx % 3 === 0 ? 3 : 1,
                      borderLeftWidth: colIdx % 3 === 0 ? 3 : 1,
                      borderRightWidth: (colIdx + 1) % 3 === 0 ? 3 : 1,
                      borderBottomWidth: (rowIdx + 1) % 3 === 0 ? 3 : 1,
                    } as CSSProperties;

                    return (
                      <button
                        type="button"
                        key={`cell-${rowIdx}-${colIdx}`}
                        className={classes.join(' ')}
                        style={customBorder}
                        onClick={() => setSelectedCell({ row: rowIdx, col: colIdx })}
                      >
                        {cell.value ? (
                          <span className="cell-value">{cell.value}</span>
                        ) : (
                          <div className="candidates">
                            {DIGITS.map((digit) => (
                              <span key={digit} className={cell.candidates.includes(digit) ? 'candidate active' : 'candidate'}>
                                {cell.candidates.includes(digit) ? digit : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
            <div className="pad">
              <div className="pad-row">
                <div className="pad-column">
                  <p className="section-title">Set Value</p>
                  <div className="digit-matrix">
                    {DIGITS.map((digit) => (
                      <button
                        key={`value-${digit}`}
                        className={selectedCellData?.value === digit ? 'digit active' : 'digit'}
                        onClick={() => handleSetValue(digit)}
                        disabled={!selectedCellData || selectedCellData.given}
                      >
                        {digit}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pad-column">
                  <p className="section-title">Candidates</p>
                  <div className="digit-matrix">
                    {DIGITS.map((digit) => {
                      const isOn = selectedCellData?.candidates.includes(digit);
                      return (
                        <button
                          key={`cand-${digit}`}
                          className={isOn ? 'digit active' : 'digit'}
                          onClick={() => handleToggleCandidate(digit)}
                          disabled={!selectedCellData || selectedCellData.given || selectedCellData.value !== null}
                        >
                          {digit}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                className="ghost clear-button"
                onClick={() => handleSetValue(null)}
                disabled={!selectedCellData || selectedCellData.given || selectedCellData.value === null}
              >
                Clear Value
              </button>
            </div>

          <div className="controls">
            <button onClick={handleResetBoard}>Reset</button>
            <button onClick={handleNewSameLevel}>New {level}</button>
            <button onClick={handleSaveBoard}>Save</button>
            <button onClick={handleUndo} disabled={!canUndo}>
              Undo
            </button>
            <div className="control-note muted">Candidates clean up & singles promote automatically.</div>
          </div>
          </div>

          <p className="status">{status || (solved ? 'Puzzle solved! Great job.' : 'Stay focused and have fun!')}</p>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? 'Switch to Night Mode' : 'Switch to Day Mode'}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
