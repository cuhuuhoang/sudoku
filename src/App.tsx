import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import './App.css';
import { Difficulty, generateSudoku } from './lib/sudoku';

type Screen = 'setup' | 'game';
type Theme = 'light' | 'dark';
type FallbackMessage = string | (() => string | undefined);

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
const createCellKey = (row: number, col: number) => `${row}-${col}`;
const parseCellKey = (key: string): CellPointer => {
  const [row, col] = key.split('-').map(Number);
  return { row, col };
};

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
  const [multiSelectedKeys, setMultiSelectedKeys] = useState<Set<string>>(() => new Set<string>());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const padRef = useRef<HTMLDivElement | null>(null);
  const isPointerSelecting = useRef(false);
  const dragSelectedKeys = useRef<Set<string>>(new Set<string>());
  const dragMovedRef = useRef(false);

  const resetSelectionState = () => {
    setSelectedCell(null);
    setIsMultiSelectMode(false);
    setMultiSelectedKeys(new Set<string>());
  };

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
      resetSelectionState();
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

  useEffect(() => {
    const endPointerSelection = (event: PointerEvent) => {
      isPointerSelecting.current = false;
      dragSelectedKeys.current.clear();
      if (boardRef.current && !boardRef.current.contains(event.target as Node)) {
        dragMovedRef.current = false;
      }
    };
    document.addEventListener('pointerup', endPointerSelection);
    document.addEventListener('pointercancel', endPointerSelection);
    return () => {
      document.removeEventListener('pointerup', endPointerSelection);
      document.removeEventListener('pointercancel', endPointerSelection);
    };
  }, []);

  useEffect(() => {
    if (!isMultiSelectMode) {
      return;
    }
    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      const insideBoard = boardRef.current?.contains(target);
      const insidePad = padRef.current?.contains(target);
      if (insideBoard || insidePad) {
        return;
      }
      resetSelectionState();
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [isMultiSelectMode]);

  useEffect(() => {
    if (!isMultiSelectMode) {
      return;
    }
    setMultiSelectedKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((key) => {
        const { row, col } = parseCellKey(key);
        const cell = board[row]?.[col];
        if (cell && !cell.given && cell.value === null) {
          next.add(key);
        } else {
          changed = true;
        }
      });
      if (!changed && next.size === prev.size) {
        return prev;
      }
      if (next.size === 0) {
        setIsMultiSelectMode(false);
        setSelectedCell(null);
        return next;
      }
      return next;
    });
  }, [board, isMultiSelectMode]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode((prev) => {
      const next = !prev;
      if (next) {
        setSelectedCell(null);
        setMultiSelectedKeys(new Set<string>());
      } else {
        setMultiSelectedKeys(new Set<string>());
      }
      return next;
    });
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
    resetSelectionState();
    setStatus('Reverted last manual change.');
  };

  const selectedCellData =
    selectedCell && !isMultiSelectMode ? board[selectedCell.row]?.[selectedCell.col] ?? null : null;
  const canUndo = history.length > 0;
  const multiSelectionHasEditableCells = isMultiSelectMode && multiSelectedKeys.size > 0;

  const commitBoardChange = (mutator: (draft: CellState[][]) => void, fallbackMessage?: FallbackMessage) => {
    let promotions = 0;
    let resolvedFallback: string | undefined;
    setBoard((prev) => {
      const next = cloneBoard(prev);
      mutator(next);
      const { board: processed, promoted } = runAutomation(next);
      promotions = promoted;
      resolvedFallback =
        typeof fallbackMessage === 'function' ? fallbackMessage() : fallbackMessage ?? undefined;
      return processed;
    });
    if (promotions > 0) {
      setStatus(`Auto promoted ${promotions} single${promotions > 1 ? 's' : ''}.`);
    } else if (resolvedFallback) {
      setStatus(resolvedFallback);
    } else {
      setStatus('');
    }
  };

  const startGame = (difficulty: Difficulty) => {
    setIsGenerating(true);
    setStatus('Generating puzzle...');
    resetSelectionState();

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
    resetSelectionState();
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
    resetSelectionState();
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
    if (isMultiSelectMode || !selectedCellData || selectedCellData.given || !selectedCell) {
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
    if (isMultiSelectMode) {
      if (!multiSelectionHasEditableCells) {
        setStatus('Select editable tiles to remove candidates.');
        return;
      }
      recordSnapshot();
      let removedAny = false;
      commitBoardChange(
        (draft) => {
          multiSelectedKeys.forEach((key) => {
            const { row, col } = parseCellKey(key);
            const cell = draft[row]?.[col];
            if (!cell || cell.given || cell.value !== null) {
              return;
            }
            if (cell.candidates.includes(value)) {
              cell.candidates = cell.candidates.filter((candidate) => candidate !== value);
              removedAny = true;
            }
          });
        },
        () => (removedAny ? `Removed ${value} from selection.` : 'No matching candidates to remove.'),
      );
      return;
    }

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
    resetSelectionState();
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
              <div className="board-grid" ref={boardRef}>
                {board.flatMap((row, rowIdx) =>
                  row.map((cell, colIdx) => {
                    const key = createCellKey(rowIdx, colIdx);
                    const isEditableCell = !cell.given && cell.value === null;
                    const isMultiSelected = isMultiSelectMode && isEditableCell && multiSelectedKeys.has(key);
                    const isSelected =
                      isMultiSelected ||
                      (!isMultiSelectMode && selectedCell?.row === rowIdx && selectedCell?.col === colIdx);
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
                        onPointerDown={() => {
                          isPointerSelecting.current = true;
                          dragMovedRef.current = false;
                          dragSelectedKeys.current = isEditableCell ? new Set<string>([key]) : new Set<string>();
                          if (!isMultiSelectMode) {
                            setSelectedCell({ row: rowIdx, col: colIdx });
                          }
                          if (isMultiSelectMode && isEditableCell) {
                            setMultiSelectedKeys((prev) => {
                              const next = new Set(prev);
                              next.add(key);
                              return next;
                            });
                          }
                        }}
                        onPointerEnter={() => {
                          if (!isPointerSelecting.current) {
                            return;
                          }
                          if (!isEditableCell || dragSelectedKeys.current.has(key)) {
                            return;
                          }
                          dragMovedRef.current = true;
                          dragSelectedKeys.current.add(key);
                          if (dragSelectedKeys.current.size > 1 && !isMultiSelectMode) {
                            setIsMultiSelectMode(true);
                            setSelectedCell(null);
                            setMultiSelectedKeys(new Set(dragSelectedKeys.current));
                          } else if (isMultiSelectMode) {
                            setMultiSelectedKeys((prev) => {
                              const next = new Set(prev);
                              dragSelectedKeys.current.forEach((cellKey) => next.add(cellKey));
                              return next;
                            });
                          }
                        }}
                        onClick={() => {
                          if (dragMovedRef.current) {
                            dragMovedRef.current = false;
                            return;
                          }
                          if (isMultiSelectMode) {
                            if (!isEditableCell) {
                              return;
                            }
                            setMultiSelectedKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) {
                                next.delete(key);
                              } else {
                                next.add(key);
                              }
                              if (next.size === 0) {
                                setIsMultiSelectMode(false);
                                setSelectedCell(null);
                              }
                              return next;
                            });
                          } else {
                            setSelectedCell({ row: rowIdx, col: colIdx });
                          }
                        }}
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
            <div className="pad" ref={padRef}>
              <button
                type="button"
                className={isMultiSelectMode ? 'digit active multi-toggle' : 'digit multi-toggle'}
                onClick={toggleMultiSelectMode}
              >
                {isMultiSelectMode ? 'Done selecting' : 'Select multiple'}
              </button>
              <div className="pad-row">
                <div className="pad-column">
                  <p className="section-title">Set Value</p>
                  <div className="digit-matrix">
                    {DIGITS.map((digit) => (
                      <button
                        key={`value-${digit}`}
                        className={selectedCellData?.value === digit ? 'digit active' : 'digit'}
                        onClick={() => handleSetValue(digit)}
                        disabled={isMultiSelectMode || !selectedCellData || selectedCellData.given}
                      >
                        {digit}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pad-column">
                  <p className="section-title">
                    Candidates
                    {isMultiSelectMode && (
                      <>
                        {' '}
                        <span className="muted">(remove)</span>
                      </>
                    )}
                  </p>
                  <div className="digit-matrix">
                    {DIGITS.map((digit) => {
                      const isOn = !isMultiSelectMode && selectedCellData?.candidates.includes(digit);
                      return (
                        <button
                          key={`cand-${digit}`}
                          className={isOn ? 'digit active' : 'digit'}
                          onClick={() => handleToggleCandidate(digit)}
                          disabled={
                            isMultiSelectMode
                              ? !multiSelectionHasEditableCells
                              : !selectedCellData || selectedCellData.given || selectedCellData.value !== null
                          }
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
                disabled={
                  isMultiSelectMode || !selectedCellData || selectedCellData.given || selectedCellData.value === null
                }
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
