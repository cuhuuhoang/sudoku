import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import './App.css';
import { Difficulty, generateSudoku } from './lib/sudoku';

type Screen = 'setup' | 'game';
type Theme = 'light' | 'dark';
type FallbackMessage = string | (() => string | undefined);
type HintType =
  | 'naked-single'
  | 'hidden-single-row'
  | 'hidden-single-column'
  | 'hidden-single-box'
  | 'peer-elimination'
  | 'locked-pointing'
  | 'locked-claiming'
  | 'naked-pair'
  | 'naked-triple'
  | 'naked-quad'
  | 'hidden-pair'
  | 'hidden-triple'
  | 'hidden-quad'
  | 'x-wing'
  | 'swordfish'
  | 'jellyfish'
  | 'xy-wing'
  | 'xyz-wing'
  | 'w-wing'
  | 'remote-pair'
  | 'coloring'
  | 'multi-coloring'
  | 'forcing-chain';

interface Hint {
  type: HintType;
  title: string;
  message: string;
  cells: CellPointer[];
}

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

interface AutomationSettings {
  cleanup: boolean;
  promote: boolean;
  hiddenSingles: boolean;
}

const STORAGE_KEY = 'sudoku-current-game-v1';
const THEME_KEY = 'sudoku-theme';
const AUTO_SETTINGS_KEY = 'sudoku-auto-settings-v1';
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

const readAutomationSettings = (): AutomationSettings => {
  if (!isBrowser) {
    return { cleanup: true, promote: true, hiddenSingles: true };
  }

  try {
    const cached = localStorage.getItem(AUTO_SETTINGS_KEY);
    if (!cached) {
      return { cleanup: true, promote: true, hiddenSingles: true };
    }
    const parsed = JSON.parse(cached) as Partial<AutomationSettings>;
    return {
      cleanup: parsed.cleanup !== undefined ? parsed.cleanup : true,
      promote: parsed.promote !== undefined ? parsed.promote : true,
      hiddenSingles: parsed.hiddenSingles !== undefined ? parsed.hiddenSingles : true,
    };
  } catch (error) {
    console.warn('Unable to read automation settings', error);
    return { cleanup: true, promote: true, hiddenSingles: true };
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

const bytesToBase64 = (bytes: Uint8Array): string => {
  if (typeof btoa !== 'undefined') {
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
};

const base64ToBytes = (encoded: string): Uint8Array => {
  try {
    if (typeof atob !== 'undefined') {
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    return Uint8Array.from(Buffer.from(encoded, 'base64'));
  } catch (error) {
    return new Uint8Array();
  }
};

const LEVEL_CODES: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
const LEVEL_FROM_CODE: Record<number, Difficulty> = { 1: 'easy', 2: 'medium', 3: 'hard' };

const packBoard = (board: CellState[][]): Uint8Array => {
  const bytes = new Uint8Array(board.length * board[0].length * 2);
  let idx = 0;
  board.forEach((row) => {
    row.forEach((cell) => {
      let mask = 0;
      cell.candidates.forEach((digit) => {
        if (digit >= 1 && digit <= 9) {
          mask |= 1 << (digit - 1);
        }
      });
      const valueBits = (cell.value ?? 0) & 0xf;
      const givenBit = cell.given ? 1 : 0;
      const packed = mask | (valueBits << 9) | (givenBit << 13);
      bytes[idx] = packed & 0xff;
      bytes[idx + 1] = (packed >> 8) & 0xff;
      idx += 2;
    });
  });
  return bytes;
};

const unpackBoard = (bytes: Uint8Array): CellState[][] => {
  const board: CellState[][] = Array.from({ length: 9 }, (_row, row) =>
    Array.from({ length: 9 }, (_col, col) => ({
      row,
      col,
      value: null as number | null,
      given: false,
      candidates: [] as number[],
    })),
  );
  let idx = 0;
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const packed = bytes[idx] | (bytes[idx + 1] << 8);
      const candidates: number[] = [];
      for (let bit = 0; bit < 9; bit += 1) {
        if (packed & (1 << bit)) {
          candidates.push(bit + 1);
        }
      }
      const value = (packed >> 9) & 0xf;
      const given = ((packed >> 13) & 1) === 1;
      board[row][col] = {
        row,
        col,
        value: value === 0 ? null : value,
        given,
        candidates,
      };
      idx += 2;
    }
  }
  return board;
};

const packNibbles = (values: number[]): Uint8Array => {
  const bytes = new Uint8Array(Math.ceil(values.length / 2));
  let idx = 0;
  for (let i = 0; i < values.length; i += 2) {
    const first = values[i] & 0xf;
    const second = values[i + 1] !== undefined ? values[i + 1] & 0xf : 0;
    bytes[idx] = (first << 4) | second;
    idx += 1;
  }
  return bytes;
};

const unpackNibbles = (bytes: Uint8Array, expected: number): number[] => {
  const values: number[] = [];
  bytes.forEach((byte) => {
    values.push((byte >> 4) & 0xf);
    if (values.length < expected) {
      values.push(byte & 0xf);
    }
  });
  return values.slice(0, expected);
};

const encodeGameState = (payload: SavedGame): string => {
  if (!payload.board?.length || !payload.initialBoard?.length || !payload.solution?.length) {
    return '';
  }
  const boardBytes = packBoard(payload.board);
  const initialBytes = packBoard(payload.initialBoard);
  const solutionBytes = packNibbles(payload.solution.flat());
  const result = new Uint8Array(1 + boardBytes.length + initialBytes.length + solutionBytes.length);
  result[0] = LEVEL_CODES[payload.level] ?? 0;
  result.set(boardBytes, 1);
  result.set(initialBytes, 1 + boardBytes.length);
  result.set(solutionBytes, 1 + boardBytes.length + initialBytes.length);
  return bytesToBase64(result);
};

const decodeGameState = (encoded: string): SavedGame | null => {
  try {
    const bytes = base64ToBytes(encoded);
    if (bytes.length < 1 + 162 + 162 + 41) {
      return null;
    }
    const levelCode = bytes[0];
    const boardSlice = bytes.slice(1, 1 + 162);
    const initialSlice = bytes.slice(1 + 162, 1 + 162 + 162);
    const solutionSlice = bytes.slice(1 + 162 + 162);
    const level = LEVEL_FROM_CODE[levelCode] ?? 'easy';
    const board = unpackBoard(boardSlice);
    const initialBoard = unpackBoard(initialSlice);
    const flatSolution = unpackNibbles(solutionSlice, 81);
    const solution: number[][] = [];
    for (let idx = 0; idx < 81; idx += 9) {
      solution.push(flatSolution.slice(idx, idx + 9));
    }
    return { level, board, initialBoard, solution };
  } catch (error) {
    console.warn('Unable to decode game', error);
    return null;
  }
};

const autoCleanCandidates = (source: CellState[][]): CellState[][] => {
  const board = cloneBoard(source);
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

  board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.value === null) {
        cell.candidates = [...new Set(cell.candidates)].sort();
      } else {
        cell.candidates = [];
      }
    });
  });

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
  const cleanPeers = (row: number, col: number, value: number) => {
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

  let promoted = 0;
  board.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.given && cell.value === null && cell.candidates.length === 1) {
        cell.value = cell.candidates[0];
        cell.candidates = [];
        cleanPeers(cell.row, cell.col, cell.value);
        promoted += 1;
      }
    });
  });
  return { board, promoted };
};

const promoteHiddenSingles = (source: CellState[][]): { board: CellState[][]; promoted: number } => {
  const board = cloneBoard(source);
  let promoted = 0;
  const cleanPeers = (row: number, col: number, value: number) => {
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

  const tryPromote = (row: number, col: number, value: number) => {
    const cell = board[row][col];
    if (!cell.given && cell.value === null) {
      cell.value = value;
      cell.candidates = [];
      promoted += 1;
      cleanPeers(row, col, value);
    }
  };

  for (const digit of DIGITS) {
    // Rows
    for (let row = 0; row < 9; row += 1) {
      const candidates = [];
      for (let col = 0; col < 9; col += 1) {
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.includes(digit)) {
          candidates.push(col);
        }
      }
      if (candidates.length === 1) {
        tryPromote(row, candidates[0], digit);
      }
    }

    // Columns
    for (let col = 0; col < 9; col += 1) {
      const candidates = [];
      for (let row = 0; row < 9; row += 1) {
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.includes(digit)) {
          candidates.push(row);
        }
      }
      if (candidates.length === 1) {
        tryPromote(candidates[0], col, digit);
      }
    }

    // Boxes
    for (let boxRow = 0; boxRow < 3; boxRow += 1) {
      for (let boxCol = 0; boxCol < 3; boxCol += 1) {
        const startRow = boxRow * 3;
        const startCol = boxCol * 3;
        const candidates: CellPointer[] = [];
        for (let row = startRow; row < startRow + 3; row += 1) {
          for (let col = startCol; col < startCol + 3; col += 1) {
            const cell = board[row][col];
            if (isEditableCell(cell) && cell.candidates.includes(digit)) {
              candidates.push({ row, col });
            }
          }
        }
        if (candidates.length === 1) {
          tryPromote(candidates[0].row, candidates[0].col, digit);
        }
      }
    }
  }

  return { board, promoted };
};

const runAutomation = (
  source: CellState[][],
  options: { cleanup?: boolean; promote?: boolean; hiddenSingles?: boolean } = {},
): { board: CellState[][]; promoted: number } => {
  const shouldCleanup = options.cleanup ?? true;
  const shouldPromote = options.promote ?? true;
  const shouldPromoteHidden = options.hiddenSingles ?? true;
  let working = shouldCleanup ? autoCleanCandidates(source) : cloneBoard(source);
  let totalPromoted = 0;
  while (true) {
    let loopPromoted = 0;

    if (shouldPromoteHidden) {
      const { board: promotedHiddenBoard, promoted } = promoteHiddenSingles(working);
      loopPromoted += promoted;
      working = promotedHiddenBoard;
    }

    if (shouldPromote) {
      const { board: promotedBoard, promoted } = promoteSingles(working);
      loopPromoted += promoted;
      working = promotedBoard;
    }

    if (loopPromoted === 0) {
      return { board: shouldCleanup ? autoCleanCandidates(working) : working, promoted: totalPromoted };
    }
    totalPromoted += loopPromoted;
    if (shouldCleanup) {
      working = autoCleanCandidates(working);
    }
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
  const [activeHint, setActiveHint] = useState<Hint | null>(null);
  const [automationSettings, setAutomationSettings] = useState<AutomationSettings>(() => readAutomationSettings());
  const [isStateModalOpen, setIsStateModalOpen] = useState(false);
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

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
      const { board: processedBoard, promoted } = runAutomation(saved.board, automationSettings);
      const { board: processedInitial } = runAutomation(saved.initialBoard, automationSettings);
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
    if (!isBrowser) {
      return;
    }
    localStorage.setItem(AUTO_SETTINGS_KEY, JSON.stringify(automationSettings));
  }, [automationSettings]);

  useEffect(() => {
    if (!board.length || !solution.length) {
      return;
    }
    persistGame({
      board: cloneBoard(board),
      initialBoard: cloneBoard(initialBoard),
      solution,
      level,
    });
    setHasSavedGame(true);
  }, [board, initialBoard, solution, level]);

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
        setActiveHint(null);
      }
      return next;
    });
  };

  const UNDO_LIMIT = 20;

  const recordSnapshot = () => {
    if (!board.length) {
      return;
    }
    setHistory((prev) => {
      const next = [...prev, cloneBoard(board)];
      if (next.length > UNDO_LIMIT) {
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
    setActiveHint(null);
    setStatus('Reverted last manual change.');
  };

  const selectedCellData =
    selectedCell && !isMultiSelectMode ? board[selectedCell.row]?.[selectedCell.col] ?? null : null;
  const canUndo = history.length > 0;
  const multiSelectionHasEditableCells = isMultiSelectMode && multiSelectedKeys.size > 0;

  const commitBoardChange = (mutator: (draft: CellState[][]) => void, fallbackMessage?: FallbackMessage) => {
    let promotions = 0;
    let resolvedFallback: string | undefined;
    let processedBoard: CellState[][] | null = null;
    setBoard((prev) => {
      const next = cloneBoard(prev);
      mutator(next);
      const { board: processed, promoted } = runAutomation(next, automationSettings);
      promotions = promoted;
      resolvedFallback =
        typeof fallbackMessage === 'function' ? fallbackMessage() : fallbackMessage ?? undefined;
      processedBoard = processed;
      return processed;
    });
    if (processedBoard && solution.length) {
      persistGame({
        board: processedBoard,
        initialBoard: cloneBoard(initialBoard),
        solution,
        level,
      });
      setHasSavedGame(true);
    }
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
    setActiveHint(null);

    try {
      const { puzzle, solution } = generateSudoku(difficulty);
      const seededBoard = createBoardFromPuzzle(puzzle);
      const { board: processedBoard, promoted } = runAutomation(seededBoard, automationSettings);
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

    const { board: processedBoard, promoted } = runAutomation(saved.board, automationSettings);
    const { board: processedInitial } = runAutomation(saved.initialBoard, automationSettings);
    setBoard(processedBoard);
    setInitialBoard(processedInitial);
    setSolution(saved.solution);
    setLevel(saved.level);
    setScreen('game');
    resetSelectionState();
    setActiveHint(null);
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

    const { board: refreshedBoard, promoted } = runAutomation(cloneBoard(initialBoard), automationSettings);
    setBoard(refreshedBoard);
    resetSelectionState();
    setHistory([]);
    setStatus(
      promoted ? `Board reset with ${promoted} auto single${promoted > 1 ? 's' : ''}.` : 'Board reset to start.',
    );
  };

  const handleNewSameLevel = () => {
    if (!solved) {
      if (isBrowser && !window.confirm(`Start a new ${level} puzzle? Current progress will be lost.`)) {
        setStatus('New puzzle canceled.');
        return;
      }
    }
    startGame(level);
  };

  const handleExportState = async (copyToClipboard = false) => {
    if (!board.length || !solution.length) {
      setExportText('');
      if (copyToClipboard) {
        setStatus('Start a puzzle to export state.');
      }
      return;
    }
    const encoded = encodeGameState({
      board: cloneBoard(board),
      initialBoard: cloneBoard(initialBoard),
      solution: solution.map((row) => [...row]),
      level,
    });
    setExportText(encoded);
    if (copyToClipboard && isBrowser && encoded) {
      try {
        await navigator.clipboard.writeText(encoded);
        setStatus('State copied to clipboard.');
      } catch (error) {
        console.warn('Clipboard copy failed', error);
        setStatus('Copied to export field. Clipboard unavailable.');
      }
    } else if (copyToClipboard) {
      setStatus('Copied to export field.');
    } else {
      setStatus('State copied to export field.');
    }
  };

  const handleImportState = () => {
    setImportError(null);
    const trimmed = importText.trim();
    if (!trimmed) {
      setImportError('Paste a state string to import.');
      return;
    }
    const decoded = decodeGameState(trimmed);
    if (!decoded || !decoded.board?.length || !decoded.solution?.length) {
      setImportError('Invalid state string.');
      return;
    }
    setBoard(cloneBoard(decoded.board));
    setInitialBoard(cloneBoard(decoded.initialBoard ?? []));
    setSolution(decoded.solution.map((row) => [...row]));
    setLevel(decoded.level ?? level);
    setScreen('game');
    resetSelectionState();
    setActiveHint(null);
    setHistory([]);
    setHasSavedGame(true);
    setStatus('State imported.');
    setIsStateModalOpen(false);
  };

  useEffect(() => {
    if (isStateModalOpen) {
      setImportError(null);
      handleExportState(false);
    }
  }, [isStateModalOpen]);

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
    setActiveHint(null);
  };

  const handleHint = () => {
    if (!board.length) {
      setActiveHint(null);
      setStatus('Start a puzzle to request hints.');
      return;
    }
    const hint = findHint(board);
    if (!hint) {
      setActiveHint(null);
      setStatus('No hints available right now.');
      resetSelectionState();
      return;
    }
    setActiveHint(hint);
    if (hint.cells.length === 1) {
      setIsMultiSelectMode(false);
      setMultiSelectedKeys(new Set<string>());
      setSelectedCell(hint.cells[0]);
    } else {
      setIsMultiSelectMode(true);
      const nextKeys = new Set<string>();
      hint.cells.forEach((cell) => nextKeys.add(createCellKey(cell.row, cell.col)));
      setMultiSelectedKeys(nextKeys);
      setSelectedCell(null);
    }
    setStatus(hint.message);
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

              <div className="hint-panel mobile-only">
                <button className="ghost hint-button" onClick={handleHint} disabled={!board.length}>
                  Show Hint
                </button>
                <p className="hint-message">
                  {activeHint ? (
                    <>
                      <strong>{activeHint.title}:</strong> {activeHint.message}
                    </>
                  ) : (
                    'Tap Hint to highlight a solvable pattern.'
                  )}
                </p>
              </div>
            </div>

          <div className="controls">
            <button onClick={handleResetBoard}>Reset</button>
            <button onClick={handleNewSameLevel}>New {level}</button>
            <button onClick={handleUndo} disabled={!canUndo}>
              Undo
            </button>
            <button onClick={() => setIsStateModalOpen(true)} disabled={!board.length || !solution.length}>
              State
            </button>
            <div className="hint-panel desktop-only">
              <button className="ghost hint-button" onClick={handleHint} disabled={!board.length}>
                Show Hint
              </button>
              <p className="hint-message">
                {activeHint ? (
                  <>
                    <strong>{activeHint.title}:</strong> {activeHint.message}
                  </>
                ) : (
                  'Tap Hint to highlight a solvable pattern.'
                )}
              </p>
            </div>
            <div className="control-toggles">
              <label className="toggle-option">
                <input
                  type="checkbox"
                  checked={automationSettings.cleanup}
                  onChange={(event) =>
                    setAutomationSettings((prev) => ({ ...prev, cleanup: event.target.checked }))
                  }
                />
                <div className="toggle-copy">
                  <span className="toggle-title">Candidates cleanup</span>
                  <span className="muted">Remove peer candidates whenever a value is set.</span>
                </div>
              </label>
              <label className="toggle-option">
                <input
                  type="checkbox"
                  checked={automationSettings.promote}
                  onChange={(event) =>
                    setAutomationSettings((prev) => ({ ...prev, promote: event.target.checked }))
                  }
                />
                <div className="toggle-copy">
                  <span className="toggle-title">Singles promote</span>
                  <span className="muted">Auto-fill cells that only allow one candidate.</span>
                </div>
              </label>
              <label className="toggle-option">
                <input
                  type="checkbox"
                  checked={automationSettings.hiddenSingles}
                  onChange={(event) =>
                    setAutomationSettings((prev) => ({ ...prev, hiddenSingles: event.target.checked }))
                  }
                />
                <div className="toggle-copy">
                  <span className="toggle-title">Hidden singles</span>
                  <span className="muted">Promote digits that are the only option in a row, column, or box.</span>
                </div>
              </label>
            </div>
          </div>
          </div>

          <p className="status">{status || (solved ? 'Puzzle solved! Great job.' : 'Stay focused and have fun!')}</p>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? 'Switch to Night Mode' : 'Switch to Day Mode'}
          </button>
        </div>
      )}
      {isStateModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsStateModalOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="State tools"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2>State tools</h2>
              <button className="ghost close-button" onClick={() => setIsStateModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <div className="modal-row">
                  <span className="modal-title">Export</span>
                  <button onClick={() => handleExportState(true)} disabled={!board.length || !solution.length}>
                    Copy to clipboard
                  </button>
                </div>
                <textarea
                  value={exportText}
                  readOnly
                  placeholder="Click Copy state to generate a shareable string."
                  rows={8}
                />
              </div>
              <div className="modal-section">
                <div className="modal-row">
                  <span className="modal-title">Import</span>
                  <button onClick={handleImportState}>Load</button>
                </div>
                <textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="Paste a state string, then click Load."
                  rows={3}
                />
                {importError && <p className="error-text">{importError}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

export {
  runAutomation,
  findHint,
  detectNakedSingle,
  detectHiddenSingleRow,
  detectHiddenSingleColumn,
  detectHiddenSingleBox,
  detectPeerElimination,
  detectLockedCandidatesPointing,
  detectLockedCandidatesClaiming,
  detectNakedSet,
  detectHiddenSet,
  detectXWing,
  detectFish,
  detectXYWing,
  detectXYZWing,
  detectWWing,
  detectRemotePair,
  detectSimpleColoring,
  detectMultiColoring,
  detectForcingChains,
  encodeGameState,
  decodeGameState,
};
export type { CellState, CellPointer, AutomationSettings };

const isEditableCell = (cell: CellState) => !cell.given && cell.value === null;

const createCellLabel = (row: number, col: number) => `R${row + 1}C${col + 1}`;

type HintDetector = (board: CellState[][]) => Hint | null;

const findHint = (board: CellState[][]): Hint | null => {
  const detectors: HintDetector[] = [
    detectNakedSingle,
    detectHiddenSingleRow,
    detectHiddenSingleColumn,
    detectHiddenSingleBox,
    detectPeerElimination,
    detectLockedCandidatesPointing,
    detectLockedCandidatesClaiming,
    (b) => detectNakedSet(b, 2, 'naked-pair', 'Naked Pair'),
    (b) => detectNakedSet(b, 3, 'naked-triple', 'Naked Triple'),
    (b) => detectNakedSet(b, 4, 'naked-quad', 'Naked Quad'),
    (b) => detectHiddenSet(b, 2, 'hidden-pair', 'Hidden Pair'),
    (b) => detectHiddenSet(b, 3, 'hidden-triple', 'Hidden Triple'),
    (b) => detectHiddenSet(b, 4, 'hidden-quad', 'Hidden Quad'),
    detectXWing,
    (b) => detectFish(b, 3, 'swordfish', 'Swordfish'),
    (b) => detectFish(b, 4, 'jellyfish', 'Jellyfish'),
    detectXYWing,
    detectXYZWing,
    detectWWing,
    detectRemotePair,
    detectSimpleColoring,
    detectMultiColoring,
    (b) => detectForcingChains(b, 3),
  ];
  for (const detector of detectors) {
    const hint = detector(board);
    if (hint) {
      return hint;
    }
  }
  return null;
};

const detectNakedSingle: HintDetector = (board) => {
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = board[row][col];
      if (isEditableCell(cell) && cell.candidates.length === 1) {
        return {
          type: 'naked-single',
          title: 'Single Candidate',
          message: `${createCellLabel(row, col)} only allows ${cell.candidates[0]}.`,
          cells: [{ row, col }],
        };
      }
    }
  }
  return null;
};

const detectHiddenSingleRow: HintDetector = (board) => {
  for (let row = 0; row < 9; row += 1) {
    for (const digit of DIGITS) {
      const cells: CellPointer[] = [];
      for (let col = 0; col < 9; col += 1) {
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.includes(digit)) {
          cells.push({ row, col });
        }
      }
      if (cells.length === 1) {
        const cell = cells[0];
        return {
          type: 'hidden-single-row',
          title: 'Hidden Single (Row)',
          message: `Digit ${digit} can only go in ${createCellLabel(cell.row, cell.col)} of row ${row + 1}.`,
          cells,
        };
      }
    }
  }
  return null;
};

const detectHiddenSingleColumn: HintDetector = (board) => {
  for (let col = 0; col < 9; col += 1) {
    for (const digit of DIGITS) {
      const cells: CellPointer[] = [];
      for (let row = 0; row < 9; row += 1) {
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.includes(digit)) {
          cells.push({ row, col });
        }
      }
      if (cells.length === 1) {
        const cell = cells[0];
        return {
          type: 'hidden-single-column',
          title: 'Hidden Single (Column)',
          message: `Digit ${digit} can only go in ${createCellLabel(cell.row, cell.col)} of column ${col + 1}.`,
          cells,
        };
      }
    }
  }
  return null;
};

const detectHiddenSingleBox: HintDetector = (board) => {
  for (let boxRow = 0; boxRow < 3; boxRow += 1) {
    for (let boxCol = 0; boxCol < 3; boxCol += 1) {
      for (const digit of DIGITS) {
        const cells: CellPointer[] = [];
        for (let row = boxRow * 3; row < boxRow * 3 + 3; row += 1) {
          for (let col = boxCol * 3; col < boxCol * 3 + 3; col += 1) {
            const cell = board[row][col];
            if (isEditableCell(cell) && cell.candidates.includes(digit)) {
              cells.push({ row, col });
            }
          }
        }
        if (cells.length === 1) {
          const cell = cells[0];
          return {
            type: 'hidden-single-box',
            title: 'Hidden Single (Box)',
            message: `Digit ${digit} fits only in ${createCellLabel(cell.row, cell.col)} of its box.`,
            cells,
          };
        }
      }
    }
  }
  return null;
};

const getPeerPointers = (row: number, col: number): CellPointer[] => {
  const peers = new Set<string>();
  for (let idx = 0; idx < 9; idx += 1) {
    if (idx !== col) {
      peers.add(createCellKey(row, idx));
    }
    if (idx !== row) {
      peers.add(createCellKey(idx, col));
    }
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r += 1) {
    for (let c = boxCol; c < boxCol + 3; c += 1) {
      if (r === row && c === col) {
        continue;
      }
      peers.add(createCellKey(r, c));
    }
  }
  return Array.from(peers).map((key) => parseCellKey(key));
};

const detectPeerElimination: HintDetector = (board) => {
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = board[row][col];
      if (cell.value === null) {
        continue;
      }
      const peers = getPeerPointers(row, col);
      const offenders = peers.filter((peer) => {
        const target = board[peer.row][peer.col];
        return isEditableCell(target) && target.candidates.includes(cell.value as number);
      });
      if (offenders.length > 0) {
        return {
          type: 'peer-elimination',
          title: 'Candidate Elimination',
          message: `Value ${cell.value} at ${createCellLabel(row, col)} lets you remove ${cell.value} from highlighted peers.`,
          cells: [{ row, col }, ...offenders],
        };
      }
    }
  }
  return null;
};

const detectLockedCandidatesPointing: HintDetector = (board) => {
  for (let boxRow = 0; boxRow < 3; boxRow += 1) {
    for (let boxCol = 0; boxCol < 3; boxCol += 1) {
      const startRow = boxRow * 3;
      const startCol = boxCol * 3;
      for (const digit of DIGITS) {
        const cells: CellPointer[] = [];
        for (let row = startRow; row < startRow + 3; row += 1) {
          for (let col = startCol; col < startCol + 3; col += 1) {
            const cell = board[row][col];
            if (isEditableCell(cell) && cell.candidates.includes(digit)) {
              cells.push({ row, col });
            }
          }
        }
        if (cells.length < 2) {
          continue;
        }
        const rowSet = new Set(cells.map((cell) => cell.row));
        if (rowSet.size === 1) {
          const rowIdx = cells[0].row;
          const eliminationTargets = [];
          for (let col = 0; col < 9; col += 1) {
            if (col >= startCol && col < startCol + 3) {
              continue;
            }
            const target = board[rowIdx][col];
            if (isEditableCell(target) && target.candidates.includes(digit)) {
              eliminationTargets.push({ row: rowIdx, col });
            }
          }
          if (eliminationTargets.length > 0) {
            return {
              type: 'locked-pointing',
              title: 'Locked Candidates (Pointing)',
              message: `Digit ${digit} is locked in row ${rowIdx + 1} of this box. Remove ${digit} from other cells in that row.`,
              cells,
            };
          }
        }
        const colSet = new Set(cells.map((cell) => cell.col));
        if (colSet.size === 1) {
          const colIdx = cells[0].col;
          const eliminationTargets = [];
          for (let row = 0; row < 9; row += 1) {
            if (row >= startRow && row < startRow + 3) {
              continue;
            }
            const target = board[row][colIdx];
            if (isEditableCell(target) && target.candidates.includes(digit)) {
              eliminationTargets.push({ row, col: colIdx });
            }
          }
          if (eliminationTargets.length > 0) {
            return {
              type: 'locked-pointing',
              title: 'Locked Candidates (Pointing)',
              message: `Digit ${digit} is locked in column ${colIdx + 1} of this box. Remove ${digit} from other cells in that column.`,
              cells,
            };
          }
        }
      }
    }
  }
  return null;
};

const detectLockedCandidatesClaiming: HintDetector = (board) => {
  for (let row = 0; row < 9; row += 1) {
    for (const digit of DIGITS) {
      const positions: CellPointer[] = [];
      for (let col = 0; col < 9; col += 1) {
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.includes(digit)) {
          positions.push({ row, col });
        }
      }
      if (positions.length < 2) {
        continue;
      }
      const boxCols = new Set(positions.map((pos) => Math.floor(pos.col / 3)));
      if (boxCols.size === 1) {
        const sample = positions[0];
        const eliminationTargets = [];
        const startRow = Math.floor(sample.row / 3) * 3;
        const startCol = Math.floor(sample.col / 3) * 3;
        for (let r = startRow; r < startRow + 3; r += 1) {
          for (let c = startCol; c < startCol + 3; c += 1) {
            if (r === row) {
              continue;
            }
            const target = board[r][c];
            if (isEditableCell(target) && target.candidates.includes(digit)) {
              eliminationTargets.push({ row: r, col: c });
            }
          }
        }
        if (eliminationTargets.length > 0) {
          return {
            type: 'locked-claiming',
            title: 'Locked Candidates (Claiming)',
            message: `Digit ${digit} appears only in box ${Math.floor(row / 3) + 1}, so remove it from other cells of that box.`,
            cells: positions,
          };
        }
      }
    }
  }
  for (let col = 0; col < 9; col += 1) {
    for (const digit of DIGITS) {
      const positions: CellPointer[] = [];
      for (let row = 0; row < 9; row += 1) {
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.includes(digit)) {
          positions.push({ row, col });
        }
      }
      if (positions.length < 2) {
        continue;
      }
      const boxRows = new Set(positions.map((pos) => Math.floor(pos.row / 3)));
      if (boxRows.size === 1) {
        const eliminationTargets = [];
        const startRow = Math.floor(positions[0].row / 3) * 3;
        const startCol = Math.floor(col / 3) * 3;
        for (let r = startRow; r < startRow + 3; r += 1) {
          for (let c = startCol; c < startCol + 3; c += 1) {
            if (c === col) {
              continue;
            }
            const target = board[r][c];
            if (isEditableCell(target) && target.candidates.includes(digit)) {
              eliminationTargets.push({ row: r, col: c });
            }
          }
        }
        if (eliminationTargets.length > 0) {
          return {
            type: 'locked-claiming',
            title: 'Locked Candidates (Claiming)',
            message: `Digit ${digit} appears only in column ${col + 1} inside one box. Remove it from other cells of that box.`,
            cells: positions,
          };
        }
      }
    }
  }
  return null;
};

const unitCoords = {
  rows: Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (__ , col) => ({ row, col }))),
  cols: Array.from({ length: 9 }, (_, col) => Array.from({ length: 9 }, (__ , row) => ({ row, col }))),
  boxes: Array.from({ length: 9 }, (_, idx) => {
    const boxRow = Math.floor(idx / 3);
    const boxCol = idx % 3;
    const coords: CellPointer[] = [];
    for (let row = boxRow * 3; row < boxRow * 3 + 3; row += 1) {
      for (let col = boxCol * 3; col < boxCol * 3 + 3; col += 1) {
        coords.push({ row, col });
      }
    }
    return coords;
  }),
};

const combinations = <T,>(arr: T[], size: number): T[][] => {
  const result: T[][] = [];
  const backtrack = (start: number, combo: T[]) => {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i += 1) {
      combo.push(arr[i]);
      backtrack(i + 1, combo);
      combo.pop();
    }
  };
  backtrack(0, []);
  return result;
};

const detectNakedSet = (board: CellState[][], size: number, type: HintType, title: string): Hint | null => {
  const checkUnit = (coords: CellPointer[], label: string): Hint | null => {
    const candidates = coords
      .map(({ row, col }) => ({ row, col, cell: board[row][col] }))
      .filter(({ cell }) => isEditableCell(cell) && cell.candidates.length > 1 && cell.candidates.length <= size);
    if (candidates.length < size) {
      return null;
    }
    for (const combo of combinations(candidates, size)) {
      const union = new Set<number>();
      combo.forEach(({ cell }) => cell.candidates.forEach((digit) => union.add(digit)));
      if (union.size !== size) {
        continue;
      }
      const comboKeys = new Set(combo.map(({ row, col }) => createCellKey(row, col)));
      const eliminationExists = coords.some(({ row, col }) => {
        const key = createCellKey(row, col);
        if (comboKeys.has(key)) {
          return false;
        }
        const cell = board[row][col];
        return isEditableCell(cell) && cell.candidates.some((digit) => union.has(digit));
      });
      if (!eliminationExists) {
        continue;
      }
      return {
        type,
        title: `${title} (${label})`,
        message: `${title} with digits ${Array.from(union).join(', ')} in ${label}. Remove those digits from other cells in the same ${label.includes('row') ? 'row' : label.includes('column') ? 'column' : 'box'}.`,
        cells: combo.map(({ row, col }) => ({ row, col })),
      };
    }
    return null;
  };

  for (let idx = 0; idx < 9; idx += 1) {
    const rowHint = checkUnit(unitCoords.rows[idx], `row ${idx + 1}`);
    if (rowHint) {
      return rowHint;
    }
    const colHint = checkUnit(unitCoords.cols[idx], `column ${idx + 1}`);
    if (colHint) {
      return colHint;
    }
    const boxHint = checkUnit(unitCoords.boxes[idx], `box ${idx + 1}`);
    if (boxHint) {
      return boxHint;
    }
  }
  return null;
};

const detectHiddenSet = (board: CellState[][], size: number, type: HintType, title: string): Hint | null => {
  const checkUnit = (coords: CellPointer[], label: string): Hint | null => {
    const digitMap = new Map<number, CellPointer[]>();
    DIGITS.forEach((digit) => digitMap.set(digit, []));
    coords.forEach(({ row, col }) => {
      const cell = board[row][col];
      if (!isEditableCell(cell)) {
        return;
      }
      cell.candidates.forEach((digit) => {
        digitMap.get(digit)?.push({ row, col });
      });
    });
    const digitEntries = Array.from(digitMap.entries()).filter(([, cells]) => cells.length > 0);
    const digitCombos = combinations(digitEntries, size);
    for (const combo of digitCombos) {
      const unionCells = new Map<string, CellPointer>();
      let valid = true;
      combo.forEach(([, cells]) => {
        cells.forEach((cell) => unionCells.set(createCellKey(cell.row, cell.col), cell));
      });
      if (unionCells.size !== size) {
        continue;
      }
      combo.forEach(([, cells]) => {
        cells.forEach((cell) => {
          if (!unionCells.has(createCellKey(cell.row, cell.col))) {
            valid = false;
          }
        });
      });
      if (!valid) {
        continue;
      }
      const digits = combo.map(([digit]) => digit);
      const actionable = Array.from(unionCells.values()).some(({ row, col }) => {
        const cell = board[row][col];
        return cell.candidates.some((digit) => !digits.includes(digit));
      });
      if (!actionable) {
        continue;
      }
      return {
        type,
        title: `${title} (${label})`,
        message: `${title} with digits ${digits.join(', ')} in ${label}. Remove other digits from the highlighted cells.`,
        cells: Array.from(unionCells.values()),
      };
    }
    return null;
  };

  for (let idx = 0; idx < 9; idx += 1) {
    const rowHint = checkUnit(unitCoords.rows[idx], `row ${idx + 1}`);
    if (rowHint) {
      return rowHint;
    }
    const colHint = checkUnit(unitCoords.cols[idx], `column ${idx + 1}`);
    if (colHint) {
      return colHint;
    }
    const boxHint = checkUnit(unitCoords.boxes[idx], `box ${idx + 1}`);
    if (boxHint) {
      return boxHint;
    }
  }
  return null;
};

const detectXWing: HintDetector = (board) => {
  const digitMapRows = new Map<number, Map<number, number[]>>();
  const digitMapCols = new Map<number, Map<number, number[]>>();
  DIGITS.forEach((digit) => {
    digitMapRows.set(digit, new Map());
    digitMapCols.set(digit, new Map());
  });

  for (const digit of DIGITS) {
    for (let row = 0; row < 9; row += 1) {
      const cols: number[] = [];
      for (let col = 0; col < 9; col += 1) {
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.includes(digit)) {
          cols.push(col);
        }
      }
      if (cols.length === 2) {
        digitMapRows.get(digit)?.set(row, cols);
      }
    }
    for (let col = 0; col < 9; col += 1) {
      const rows: number[] = [];
      for (let row = 0; row < 9; row += 1) {
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.includes(digit)) {
          rows.push(row);
        }
      }
      if (rows.length === 2) {
        digitMapCols.get(digit)?.set(col, rows);
      }
    }
  }

  const checkRows = (): Hint | null => {
    for (const digit of DIGITS) {
      const rowMap = digitMapRows.get(digit)!;
      const rowIndices = Array.from(rowMap.keys());
      for (const pair of combinations(rowIndices, 2)) {
        const [rowA, rowB] = pair;
        const colsA = rowMap.get(rowA)!;
        const colsB = rowMap.get(rowB)!;
        if (colsA[0] === colsB[0] && colsA[1] === colsB[1]) {
          const eliminationTargets: CellPointer[] = [];
          for (const col of colsA) {
            for (let row = 0; row < 9; row += 1) {
              if (row === rowA || row === rowB) {
                continue;
              }
              const cell = board[row][col];
              if (isEditableCell(cell) && cell.candidates.includes(digit)) {
                eliminationTargets.push({ row, col });
              }
            }
          }
          if (eliminationTargets.length > 0) {
            return {
              type: 'x-wing',
              title: 'X-Wing (Row)',
              message: `Digit ${digit} forms an X-Wing on rows ${rowA + 1} & ${rowB + 1}. Remove ${digit} from other cells in columns ${colsA
                .map((c) => c + 1)
                .join(' & ')}.`,
              cells: [
                { row: rowA, col: colsA[0] },
                { row: rowA, col: colsA[1] },
                { row: rowB, col: colsA[0] },
                { row: rowB, col: colsA[1] },
              ],
            };
          }
        }
      }
    }
    return null;
  };

  const checkCols = (): Hint | null => {
    for (const digit of DIGITS) {
      const colMap = digitMapCols.get(digit)!;
      const colIndices = Array.from(colMap.keys());
      for (const pair of combinations(colIndices, 2)) {
        const [colA, colB] = pair;
        const rowsA = colMap.get(colA)!;
        const rowsB = colMap.get(colB)!;
        if (rowsA[0] === rowsB[0] && rowsA[1] === rowsB[1]) {
          const eliminationTargets: CellPointer[] = [];
          for (const row of rowsA) {
            for (let col = 0; col < 9; col += 1) {
              if (col === colA || col === colB) {
                continue;
              }
              const cell = board[row][col];
              if (isEditableCell(cell) && cell.candidates.includes(digit)) {
                eliminationTargets.push({ row, col });
              }
            }
          }
          if (eliminationTargets.length > 0) {
            return {
              type: 'x-wing',
              title: 'X-Wing (Column)',
              message: `Digit ${digit} forms an X-Wing on columns ${colA + 1} & ${colB + 1}. Remove ${digit} from other cells in rows ${rowsA
                .map((r) => r + 1)
                .join(' & ')}.`,
              cells: [
                { row: rowsA[0], col: colA },
                { row: rowsA[1], col: colA },
                { row: rowsA[0], col: colB },
                { row: rowsA[1], col: colB },
              ],
            };
          }
        }
      }
    }
    return null;
  };

  return checkRows() ?? checkCols();
};

const detectFish = (board: CellState[][], size: 3 | 4, type: HintType, title: string): Hint | null => {
  const findInOrientation = (orientation: 'row' | 'col'): Hint | null => {
    for (const digit of DIGITS) {
      const lines: { idx: number; positions: number[] }[] = [];
      for (let line = 0; line < 9; line += 1) {
        const positions: number[] = [];
        for (let pos = 0; pos < 9; pos += 1) {
          const cell = orientation === 'row' ? board[line][pos] : board[pos][line];
          if (isEditableCell(cell) && cell.candidates.includes(digit)) {
            positions.push(pos);
          }
        }
        if (positions.length >= 2 && positions.length <= size) {
          lines.push({ idx: line, positions });
        }
      }
      if (lines.length < size) {
        continue;
      }
      for (const combo of combinations(lines, size)) {
        const union = new Set<number>();
        combo.forEach((line) => line.positions.forEach((p) => union.add(p)));
        if (union.size !== size) {
          continue;
        }
        const lineSet = new Set(combo.map((line) => line.idx));
        const eliminations: CellPointer[] = [];
        if (orientation === 'row') {
          for (let row = 0; row < 9; row += 1) {
            if (lineSet.has(row)) {
              continue;
            }
            union.forEach((col) => {
              const cell = board[row][col];
              if (isEditableCell(cell) && cell.candidates.includes(digit)) {
                eliminations.push({ row, col });
              }
            });
          }
        } else {
          for (let col = 0; col < 9; col += 1) {
            if (lineSet.has(col)) {
              continue;
            }
            union.forEach((row) => {
              const cell = board[row][col];
              if (isEditableCell(cell) && cell.candidates.includes(digit)) {
                eliminations.push({ row, col });
              }
            });
          }
        }
        if (eliminations.length === 0) {
          continue;
        }
        const baseCells: CellPointer[] = [];
        combo.forEach(({ idx, positions }) => {
          positions.forEach((p) => {
            baseCells.push(orientation === 'row' ? { row: idx, col: p } : { row: p, col: idx });
          });
        });
        return {
          type,
          title: `${title} (${orientation === 'row' ? 'rows' : 'columns'})`,
          message: `${title} on digit ${digit}. Remove ${digit} from highlighted peer cells.`,
          cells: [...baseCells, ...eliminations],
        };
      }
    }
    return null;
  };

  return findInOrientation('row') ?? findInOrientation('col');
};

const detectXYWing: HintDetector = (board) => {
  const peersOf = (row: number, col: number) => new Set(getPeerPointers(row, col).map((p) => createCellKey(p.row, p.col)));
  const bivalueCells: { row: number; col: number; candidates: number[]; peers: Set<string> }[] = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = board[row][col];
      if (isEditableCell(cell) && cell.candidates.length === 2) {
        bivalueCells.push({ row, col, candidates: [...cell.candidates], peers: peersOf(row, col) });
      }
    }
  }

  for (const pivot of bivalueCells) {
    const [x, y] = pivot.candidates;
    const wingX = bivalueCells.filter(
      (cell) =>
        cell !== pivot &&
        cell.candidates.includes(x) &&
        !cell.candidates.includes(y) &&
        pivot.peers.has(createCellKey(cell.row, cell.col)),
    );
    const wingY = bivalueCells.filter(
      (cell) =>
        cell !== pivot &&
        cell.candidates.includes(y) &&
        !cell.candidates.includes(x) &&
        pivot.peers.has(createCellKey(cell.row, cell.col)),
    );
    for (const a of wingX) {
      for (const b of wingY) {
        if (a.row === b.row && a.col === b.col) {
          continue;
        }
        const zSet = new Set<number>();
        [...a.candidates, ...b.candidates].forEach((digit) => {
          if (digit !== x && digit !== y) {
            zSet.add(digit);
          }
        });
        if (zSet.size !== 1) {
          continue;
        }
        const z = Array.from(zSet)[0];
        const intersection = new Set<string>();
        a.peers.forEach((peer) => {
          if (b.peers.has(peer)) {
            intersection.add(peer);
          }
        });
        const eliminations: CellPointer[] = [];
        intersection.forEach((key) => {
          const { row, col } = parseCellKey(key);
          const cell = board[row][col];
          if (isEditableCell(cell) && cell.candidates.includes(z)) {
            eliminations.push({ row, col });
          }
        });
        if (eliminations.length > 0) {
          const pivotLabel = createCellLabel(pivot.row, pivot.col);
          const wingALabel = createCellLabel(a.row, a.col);
          const wingBLabel = createCellLabel(b.row, b.col);
          return {
            type: 'xy-wing',
            title: 'XY-Wing',
            message: `Pivot ${pivotLabel} (${x}/${y}) links ${wingALabel} (${x}/${z}) and ${wingBLabel} (${y}/${z}). Remove ${z} from any cell seeing both wings.`,
            cells: [
              { row: pivot.row, col: pivot.col },
              { row: a.row, col: a.col },
              { row: b.row, col: b.col },
              ...eliminations,
            ],
          };
        }
      }
    }
  }
  return null;
};

const detectXYZWing: HintDetector = (board) => {
  const peersOf = (row: number, col: number) => new Set(getPeerPointers(row, col).map((p) => createCellKey(p.row, p.col)));
  const pivotCells: { row: number; col: number; candidates: number[]; peers: Set<string> }[] = [];
  const bivalue: { row: number; col: number; candidates: number[]; peers: Set<string> }[] = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = board[row][col];
      if (!isEditableCell(cell)) {
        continue;
      }
      const peers = peersOf(row, col);
      if (cell.candidates.length === 3) {
        pivotCells.push({ row, col, candidates: [...cell.candidates], peers });
      } else if (cell.candidates.length === 2) {
        bivalue.push({ row, col, candidates: [...cell.candidates], peers });
      }
    }
  }

  for (const pivot of pivotCells) {
    const wings = bivalue.filter((cell) => pivot.peers.has(createCellKey(cell.row, cell.col)) && cell.candidates.every((d) => pivot.candidates.includes(d)));
    if (wings.length < 2) {
      continue;
    }
    for (const [w1, w2] of combinations(wings, 2)) {
      const shared = w1.candidates.filter((d) => w2.candidates.includes(d) && pivot.candidates.includes(d));
      if (shared.length !== 1) {
        continue;
      }
      const targetDigit = shared[0];
      const intersection = new Set<string>();
      w1.peers.forEach((peer) => {
        if (w2.peers.has(peer) && pivot.peers.has(peer)) {
          intersection.add(peer);
        }
      });
      const eliminations: CellPointer[] = [];
      intersection.forEach((key) => {
        const { row, col } = parseCellKey(key);
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.includes(targetDigit)) {
          eliminations.push({ row, col });
        }
      });
      if (eliminations.length > 0) {
        const pivotLabel = createCellLabel(pivot.row, pivot.col);
        const wingALabel = createCellLabel(w1.row, w1.col);
        const wingBLabel = createCellLabel(w2.row, w2.col);
        return {
          type: 'xyz-wing',
          title: 'XYZ-Wing',
          message: `Pivot ${pivotLabel} (${pivot.candidates.join('/')}) with wings ${wingALabel} (${w1.candidates.join('/')}) and ${wingBLabel} (${w2.candidates.join('/')}): remove ${targetDigit} from cells that see all three.`,
          cells: [
            { row: pivot.row, col: pivot.col },
            { row: w1.row, col: w1.col },
            { row: w2.row, col: w2.col },
            ...eliminations,
          ],
        };
      }
    }
  }
  return null;
};

const hasStrongLinkInRow = (board: CellState[][], row: number, digit: number, cols: number[]) => {
  const positions = [];
  for (let col = 0; col < 9; col += 1) {
    const cell = board[row][col];
    if (isEditableCell(cell) && cell.candidates.includes(digit)) {
      positions.push(col);
    }
  }
  return positions.length === 2 && cols.every((c) => positions.includes(c));
};

const hasStrongLinkInCol = (board: CellState[][], col: number, digit: number, rows: number[]) => {
  const positions = [];
  for (let row = 0; row < 9; row += 1) {
    const cell = board[row][col];
    if (isEditableCell(cell) && cell.candidates.includes(digit)) {
      positions.push(row);
    }
  }
  return positions.length === 2 && rows.every((r) => positions.includes(r));
};

const detectWWing: HintDetector = (board) => {
  const pairs: { row: number; col: number; candidates: number[]; peers: Set<string> }[] = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = board[row][col];
      if (isEditableCell(cell) && cell.candidates.length === 2) {
        pairs.push({ row, col, candidates: [...cell.candidates], peers: new Set(getPeerPointers(row, col).map((p) => createCellKey(p.row, p.col))) });
      }
    }
  }

  for (let i = 0; i < pairs.length; i += 1) {
    for (let j = i + 1; j < pairs.length; j += 1) {
      const a = pairs[i];
      const b = pairs[j];
      if (a.row === b.row || a.col === b.col) {
        continue;
      }
      const [x1, y1] = a.candidates.sort();
      const [x2, y2] = b.candidates.sort();
      if (x1 !== x2 || y1 !== y2) {
        continue;
      }
      const [x, y] = [x1, y1];
      const strongLink =
        hasStrongLinkInCol(board, a.col, x, [a.row, b.row]) ||
        hasStrongLinkInCol(board, b.col, x, [a.row, b.row]) ||
        hasStrongLinkInRow(board, a.row, x, [a.col, b.col]) ||
        hasStrongLinkInRow(board, b.row, x, [a.col, b.col]);
      if (!strongLink) {
        continue;
      }
      const intersection = new Set<string>();
      a.peers.forEach((peer) => {
        if (b.peers.has(peer)) {
          intersection.add(peer);
        }
      });
      const eliminations: CellPointer[] = [];
      intersection.forEach((key) => {
        const { row, col } = parseCellKey(key);
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.includes(y)) {
          eliminations.push({ row, col });
        }
      });
      if (eliminations.length > 0) {
        const aLabel = createCellLabel(a.row, a.col);
        const bLabel = createCellLabel(b.row, b.col);
        return {
          type: 'w-wing',
          title: 'W-Wing',
          message: `${aLabel} and ${bLabel} share ${x}/${y} with a strong link on ${x}. Remove ${y} from cells seeing both.`,
          cells: [
            { row: a.row, col: a.col },
            { row: b.row, col: b.col },
            ...eliminations,
          ],
        };
      }
    }
  }
  return null;
};

const detectRemotePair: HintDetector = (board) => {
  const pairs: { row: number; col: number; candidates: number[]; peers: Set<string> }[] = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = board[row][col];
      if (isEditableCell(cell) && cell.candidates.length === 2) {
        pairs.push({ row, col, candidates: [...cell.candidates], peers: new Set(getPeerPointers(row, col).map((p) => createCellKey(p.row, p.col))) });
      }
    }
  }

  const adj: Map<string, string[]> = new Map();
  pairs.forEach((cell) => {
    const key = createCellKey(cell.row, cell.col);
    const neighbors: string[] = [];
    pairs.forEach((other) => {
      if (cell === other) return;
      if (cell.candidates[0] === other.candidates[0] && cell.candidates[1] === other.candidates[1]) {
        if (cell.peers.has(createCellKey(other.row, other.col))) {
          neighbors.push(createCellKey(other.row, other.col));
        }
      }
    });
    adj.set(key, neighbors);
  });

  const bfs = (start: string): Map<string, number> => {
    const dist = new Map<string, number>();
    dist.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift() as string;
      const next = adj.get(current) ?? [];
      next.forEach((neighbor) => {
        if (!dist.has(neighbor)) {
          dist.set(neighbor, (dist.get(current) as number) + 1);
          queue.push(neighbor);
        }
      });
    }
    return dist;
  };

  for (const start of adj.keys()) {
    const distances = bfs(start);
    for (const [target, length] of distances.entries()) {
      if (length === 0 || length % 2 === 0) {
        continue;
      }
      const a = pairs.find((cell) => createCellKey(cell.row, cell.col) === start)!;
      const b = pairs.find((cell) => createCellKey(cell.row, cell.col) === target)!;
      if (a.peers.has(createCellKey(b.row, b.col))) {
        continue;
      }
      const intersection = new Set<string>();
      a.peers.forEach((peer) => {
        if (b.peers.has(peer)) {
          intersection.add(peer);
        }
      });
      const eliminations: CellPointer[] = [];
      intersection.forEach((key) => {
        const { row, col } = parseCellKey(key);
        const cell = board[row][col];
        if (isEditableCell(cell) && cell.candidates.some((digit) => a.candidates.includes(digit))) {
          eliminations.push({ row, col });
        }
      });
      if (eliminations.length > 0) {
        return {
          type: 'remote-pair',
          title: 'Remote Pair',
          message: `Odd-length chain of pairs ${a.candidates.join('/')} forces eliminations in overlapping peers.`,
          cells: [
            { row: a.row, col: a.col },
            { row: b.row, col: b.col },
            ...eliminations,
          ],
        };
      }
    }
  }
  return null;
};

const detectSimpleColoring: HintDetector = (board) => {
  const positionsByDigit = new Map<number, CellPointer[]>();
  DIGITS.forEach((digit) => positionsByDigit.set(digit, []));
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = board[row][col];
      if (isEditableCell(cell)) {
        cell.candidates.forEach((digit) => positionsByDigit.get(digit)?.push({ row, col }));
      }
    }
  }

  for (const digit of DIGITS) {
    const positions = positionsByDigit.get(digit) ?? [];
    if (positions.length < 2) {
      continue;
    }
    const edges: Map<string, string[]> = new Map();
    positions.forEach((pos) => edges.set(createCellKey(pos.row, pos.col), []));

    const addEdge = (a: CellPointer, b: CellPointer) => {
      const aKey = createCellKey(a.row, a.col);
      const bKey = createCellKey(b.row, b.col);
      edges.get(aKey)?.push(bKey);
      edges.get(bKey)?.push(aKey);
    };

    // strong links in rows/cols/boxes
    for (let row = 0; row < 9; row += 1) {
      const rowPositions = positions.filter((pos) => pos.row === row);
      if (rowPositions.length === 2) {
        addEdge(rowPositions[0], rowPositions[1]);
      }
    }
    for (let col = 0; col < 9; col += 1) {
      const colPositions = positions.filter((pos) => pos.col === col);
      if (colPositions.length === 2) {
        addEdge(colPositions[0], colPositions[1]);
      }
    }
    for (let box = 0; box < 9; box += 1) {
      const boxRow = Math.floor(box / 3) * 3;
      const boxCol = (box % 3) * 3;
      const boxPositions = positions.filter((pos) => pos.row >= boxRow && pos.row < boxRow + 3 && pos.col >= boxCol && pos.col < boxCol + 3);
      if (boxPositions.length === 2) {
        addEdge(boxPositions[0], boxPositions[1]);
      }
    }

    const colorMap = new Map<string, { color: 0 | 1; component: number }>();
    let component = 0;
    for (const key of edges.keys()) {
      if (colorMap.has(key)) continue;
      const queue: { key: string; color: 0 | 1 }[] = [{ key, color: 0 }];
      colorMap.set(key, { color: 0, component });
      while (queue.length) {
        const { key: current, color } = queue.shift() as { key: string; color: 0 | 1 };
        (edges.get(current) ?? []).forEach((neighbor) => {
          if (!colorMap.has(neighbor)) {
            colorMap.set(neighbor, { color: color === 0 ? 1 : 0, component });
            queue.push({ key: neighbor, color: color === 0 ? 1 : 0 });
          }
        });
      }
      component += 1;
    }

    for (let row = 0; row < 9; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        const cell = board[row][col];
        if (!isEditableCell(cell) || !cell.candidates.includes(digit)) {
          continue;
        }
        const peers = getPeerPointers(row, col).map((p) => createCellKey(p.row, p.col));
        const seenColors = new Set<number>();
        peers.forEach((peer) => {
          const entry = colorMap.get(peer);
          if (entry) {
            seenColors.add(entry.color);
          }
        });
        if (seenColors.size === 2) {
          const coloredCells = Array.from(colorMap.keys()).map((key) => parseCellKey(key));
          return {
            type: 'coloring',
            title: 'Simple Coloring',
            message: `Digit ${digit} colored in two groups. Cell ${createCellLabel(row, col)} sees both colors, so remove ${digit} here.`,
            cells: [
              { row, col },
              ...coloredCells,
            ],
          };
        }
      }
    }
  }
  return null;
};

const detectMultiColoring: HintDetector = (board) => {
  const positionsByDigit = new Map<number, CellPointer[]>();
  DIGITS.forEach((digit) => positionsByDigit.set(digit, []));
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = board[row][col];
      if (isEditableCell(cell)) {
        cell.candidates.forEach((digit) => positionsByDigit.get(digit)?.push({ row, col }));
      }
    }
  }

  for (const digit of DIGITS) {
    const positions = positionsByDigit.get(digit) ?? [];
    if (positions.length < 4) continue;

    const edges: Map<string, string[]> = new Map();
    positions.forEach((pos) => edges.set(createCellKey(pos.row, pos.col), []));

    const addEdge = (a: CellPointer, b: CellPointer) => {
      const aKey = createCellKey(a.row, a.col);
      const bKey = createCellKey(b.row, b.col);
      edges.get(aKey)?.push(bKey);
      edges.get(bKey)?.push(aKey);
    };

    // strong links in rows/cols/boxes
    for (let row = 0; row < 9; row += 1) {
      const rowPositions = positions.filter((pos) => pos.row === row);
      if (rowPositions.length === 2) {
        addEdge(rowPositions[0], rowPositions[1]);
      }
    }
    for (let col = 0; col < 9; col += 1) {
      const colPositions = positions.filter((pos) => pos.col === col);
      if (colPositions.length === 2) {
        addEdge(colPositions[0], colPositions[1]);
      }
    }
    for (let box = 0; box < 9; box += 1) {
      const boxRow = Math.floor(box / 3) * 3;
      const boxCol = (box % 3) * 3;
      const boxPositions = positions.filter((pos) => pos.row >= boxRow && pos.row < boxRow + 3 && pos.col >= boxCol && pos.col < boxCol + 3);
      if (boxPositions.length === 2) {
        addEdge(boxPositions[0], boxPositions[1]);
      }
    }

    const colorMap = new Map<string, { color: 0 | 1; component: number }>();
    let component = 0;
    for (const key of edges.keys()) {
      if (colorMap.has(key)) continue;
      const queue: { key: string; color: 0 | 1 }[] = [{ key, color: 0 }];
      colorMap.set(key, { color: 0, component });
      while (queue.length) {
        const { key: current, color } = queue.shift() as { key: string; color: 0 | 1 };
        (edges.get(current) ?? []).forEach((neighbor) => {
          if (!colorMap.has(neighbor)) {
            colorMap.set(neighbor, { color: color === 0 ? 1 : 0, component });
            queue.push({ key: neighbor, color: color === 0 ? 1 : 0 });
          }
        });
      }
      component += 1;
    }

    const entries = Array.from(colorMap.entries());
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const [keyA, infoA] = entries[i];
        const [keyB, infoB] = entries[j];
        if (infoA.component === infoB.component) {
          continue;
        }
        if (infoA.color !== infoB.color) {
          continue;
        }
        const { row: rowA, col: colA } = parseCellKey(keyA);
        const { row: rowB, col: colB } = parseCellKey(keyB);
        const peerSetA = new Set(getPeerPointers(rowA, colA).map((p) => createCellKey(p.row, p.col)));
        if (!peerSetA.has(keyB)) {
          continue;
        }
        const eliminations: CellPointer[] = [];
        colorMap.forEach((value, key) => {
          if (value.component === infoA.component && value.color !== infoA.color) {
            eliminations.push(parseCellKey(key));
          }
          if (value.component === infoB.component && value.color !== infoB.color) {
            eliminations.push(parseCellKey(key));
          }
        });
        if (eliminations.length > 0) {
          return {
            type: 'multi-coloring',
            title: 'Multi-coloring',
            message: `Digit ${digit} has conflicting same-color groups; opposite colors are forced and can be eliminated.`,
            cells: eliminations,
          };
        }
      }
    }
  }
  return null;
};

const detectForcingChains = (board: CellState[][], maxDepth: number): Hint | null => {
  const editableCells: CellPointer[] = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const cell = board[row][col];
      if (isEditableCell(cell) && cell.candidates.length === 2) {
        editableCells.push({ row, col });
      }
    }
  }

  const keyCandidate = (row: number, col: number, digit: number) => `${row}-${col}-${digit}`;

  for (const pivot of editableCells) {
    const cell = board[pivot.row][pivot.col];
    const [a, b] = cell.candidates;

    const simulate = (value: number) => {
      const assumed = cloneBoard(board);
      assumed[pivot.row][pivot.col].value = value;
      assumed[pivot.row][pivot.col].candidates = [];
      const { board: processed } = runAutomation(assumed, { cleanup: true, promote: true, hiddenSingles: true });
      const removed = new Set<string>();
      const fixed = new Map<string, number>();
      for (let row = 0; row < 9; row += 1) {
        for (let col = 0; col < 9; col += 1) {
          const before = board[row][col];
          const after = processed[row][col];
          if (isEditableCell(before) && after.value !== null) {
            fixed.set(createCellKey(row, col), after.value);
          }
          if (isEditableCell(before)) {
            before.candidates.forEach((digit) => {
              if (!after.candidates.includes(digit)) {
                removed.add(keyCandidate(row, col, digit));
              }
            });
          }
        }
      }
      return { removed, fixed };
    };

    const first = simulate(a);
    const second = simulate(b);

    const forcedValues: CellPointer[] = [];
    first.fixed.forEach((value, key) => {
      if (second.fixed.get(key) === value) {
        const { row, col } = parseCellKey(key);
        forcedValues.push({ row, col });
      }
    });
    if (forcedValues.length > 0) {
      return {
        type: 'forcing-chain',
        title: 'Forcing Chain',
        message: `Assuming either ${a} or ${b} in ${createCellLabel(pivot.row, pivot.col)} forces other cells. Apply the shared forced placements.`,
        cells: [{ row: pivot.row, col: pivot.col }, ...forcedValues],
      };
    }

    const eliminations: CellPointer[] = [];
    first.removed.forEach((entry) => {
      if (second.removed.has(entry)) {
        const [row, col] = entry.split('-').slice(0, 2).map(Number);
        eliminations.push({ row, col });
      }
    });
    if (eliminations.length > 0) {
      return {
        type: 'forcing-chain',
        title: 'Forcing Chain',
        message: `Both assumptions for ${createCellLabel(pivot.row, pivot.col)} eliminate the same candidates elsewhere.`,
        cells: [{ row: pivot.row, col: pivot.col }, ...eliminations],
      };
    }
  }
  return null;
};
