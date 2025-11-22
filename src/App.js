import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { generateSudoku } from './lib/sudoku';
const STORAGE_KEY = 'sudoku-current-game-v1';
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const difficultyOptions = [
    { id: 'easy', title: 'Easy', subtitle: 'Gentle starter – plenty of givens.' },
    { id: 'medium', title: 'Medium', subtitle: 'Balanced challenge with steady flow.' },
    { id: 'hard', title: 'Hard', subtitle: 'Sparse clues, focus and patience required.' },
];
const cloneBoard = (board) => board.map((row) => row.map((cell) => ({
    ...cell,
    candidates: [...new Set(cell.candidates ?? [])],
})));
const createBoardFromPuzzle = (puzzle) => puzzle.map((row, rowIndex) => row.map((value, colIndex) => ({
    row: rowIndex,
    col: colIndex,
    value: value === 0 ? null : value,
    given: value !== 0,
    candidates: value === 0 ? [...DIGITS] : [],
})));
const isBrowser = typeof window !== 'undefined';
const readSavedGame = () => {
    if (!isBrowser) {
        return null;
    }
    try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (!cached) {
            return null;
        }
        const parsed = JSON.parse(cached);
        return {
            ...parsed,
            board: parsed.board ? cloneBoard(parsed.board) : [],
            initialBoard: parsed.initialBoard ? cloneBoard(parsed.initialBoard) : [],
            solution: parsed.solution ? parsed.solution.map((row) => [...row]) : [],
        };
    }
    catch (error) {
        console.warn('Unable to read saved game', error);
        return null;
    }
};
const persistGame = (payload) => {
    if (!isBrowser) {
        return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...payload,
        board: payload.board,
        initialBoard: payload.initialBoard,
    }));
};
const autoCleanCandidates = (source) => {
    const board = cloneBoard(source);
    board.forEach((row) => {
        row.forEach((cell) => {
            if (cell.value === null) {
                cell.candidates = [...new Set(cell.candidates)].sort();
            }
            else {
                cell.candidates = [];
            }
        });
    });
    const removeFromPeers = (row, col, value) => {
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
const promoteSingles = (source) => {
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
const runAutomation = (source) => {
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
    const [screen, setScreen] = useState('setup');
    const [board, setBoard] = useState([]);
    const [initialBoard, setInitialBoard] = useState([]);
    const [solution, setSolution] = useState([]);
    const [level, setLevel] = useState('easy');
    const [selectedCell, setSelectedCell] = useState(null);
    const [status, setStatus] = useState('');
    const [hasSavedGame, setHasSavedGame] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    useEffect(() => {
        setHasSavedGame(Boolean(readSavedGame()));
    }, []);
    const selectedCellData = selectedCell ? board[selectedCell.row]?.[selectedCell.col] ?? null : null;
    const commitBoardChange = (mutator, fallbackMessage) => {
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
        }
        else if (fallbackMessage) {
            setStatus(fallbackMessage);
        }
        else {
            setStatus('');
        }
    };
    const startGame = (difficulty) => {
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
            setStatus(promoted ? `Auto promoted ${promoted} starter single${promoted > 1 ? 's' : ''}.` : '');
        }
        catch (error) {
            console.error(error);
            setStatus('Unable to generate a puzzle right now.');
        }
        finally {
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
        setStatus(promoted ? `Loaded & auto promoted ${promoted} single${promoted > 1 ? 's' : ''}.` : 'Loaded saved puzzle.');
        setHasSavedGame(true);
    };
    const handleResetBoard = () => {
        if (!initialBoard.length) {
            return;
        }
        const { board: refreshedBoard, promoted } = runAutomation(cloneBoard(initialBoard));
        setBoard(refreshedBoard);
        setSelectedCell(null);
        setStatus(promoted ? `Board reset with ${promoted} auto single${promoted > 1 ? 's' : ''}.` : 'Board reset to start.');
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
    const handleSetValue = (value) => {
        if (!selectedCellData || selectedCellData.given || !selectedCell) {
            return;
        }
        commitBoardChange((draft) => {
            const cell = draft[selectedCell.row][selectedCell.col];
            cell.value = value;
            if (value !== null) {
                cell.candidates = [];
            }
        }, value === null ? 'Value cleared.' : 'Value updated.');
    };
    const handleToggleCandidate = (value) => {
        if (!selectedCellData || selectedCellData.given || selectedCellData.value !== null || !selectedCell) {
            return;
        }
        commitBoardChange((draft) => {
            const cell = draft[selectedCell.row][selectedCell.col];
            const exists = cell.candidates.includes(value);
            cell.candidates = exists
                ? cell.candidates.filter((candidate) => candidate !== value)
                : [...cell.candidates, value].sort();
        }, 'Candidate updated.');
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
    return (_jsxs("div", { className: "app-shell", children: [screen === 'setup' && (_jsxs("div", { className: "card", children: [_jsx("h1", { children: "Sudoku Trainer" }), _jsx("p", { className: "lead", children: "Choose a difficulty to spin up a fresh puzzle or reload what you were working on." }), _jsx("div", { className: "levels", children: difficultyOptions.map((option) => (_jsxs("button", { className: "level-option", disabled: isGenerating, onClick: () => startGame(option.id), children: [_jsx("span", { className: "level-title", children: option.title }), _jsx("span", { className: "level-subtitle", children: option.subtitle })] }, option.id))) }), _jsx("button", { className: "ghost", onClick: handleLoadSaved, disabled: !hasSavedGame, children: "Load Saved Game" }), isGenerating && _jsx("p", { className: "muted", children: status })] })), screen === 'game' && (_jsxs("div", { className: "game-layout", children: [_jsxs("div", { className: "toolbar", children: [_jsx("button", { className: "ghost", onClick: handleBackToLevels, children: "\u2190 Levels" }), _jsx("span", { className: "badge", children: level.toUpperCase() })] }), _jsxs("div", { className: "play-area", children: [_jsxs("div", { className: "board-stack", children: [_jsx("div", { className: "board-wrapper", children: board.map((row, rowIdx) => (_jsx("div", { className: "row", children: row.map((cell, colIdx) => {
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
                                                };
                                                return (_jsx("button", { type: "button", className: classes.join(' '), style: customBorder, onClick: () => setSelectedCell({ row: rowIdx, col: colIdx }), children: cell.value ? (_jsx("span", { className: "cell-value", children: cell.value })) : (_jsx("div", { className: "candidates", children: DIGITS.map((digit) => (_jsx("span", { className: cell.candidates.includes(digit) ? 'candidate active' : 'candidate', children: cell.candidates.includes(digit) ? digit : '' }, digit))) })) }, `cell-${rowIdx}-${colIdx}`));
                                            }) }, `row-${rowIdx}`))) }), _jsxs("div", { className: "controls", children: [_jsx("button", { onClick: handleResetBoard, children: "Reset" }), _jsx("button", { onClick: handleSaveBoard, children: "Save" }), _jsx("div", { className: "control-note muted", children: "Candidates clean up & singles promote automatically." })] })] }), _jsxs("div", { className: "pad", children: [_jsxs("div", { className: "pad-header", children: [_jsx("div", { children: selectedCellData ? (_jsxs(_Fragment, { children: [_jsxs("p", { children: ["Tile (", selectedCellData.row + 1, ", ", selectedCellData.col + 1, ")"] }), selectedCellData.given ? (_jsx("span", { className: "muted", children: "Given number" })) : (_jsx("span", { className: "muted", children: "Tap to enter" }))] })) : (_jsx("p", { className: "muted", children: "Tap a tile to edit" })) }), _jsx("button", { className: "ghost", onClick: () => handleSetValue(null), disabled: !selectedCellData || selectedCellData.given || selectedCellData.value === null, children: "Clear Value" })] }), _jsxs("div", { children: [_jsx("p", { className: "section-title", children: "Set Value" }), _jsx("div", { className: "digit-matrix", children: DIGITS.map((digit) => (_jsx("button", { className: selectedCellData?.value === digit ? 'digit active' : 'digit', onClick: () => handleSetValue(digit), disabled: !selectedCellData || selectedCellData.given, children: digit }, `value-${digit}`))) })] }), _jsxs("div", { children: [_jsx("p", { className: "section-title", children: "Candidates" }), _jsx("div", { className: "digit-matrix", children: DIGITS.map((digit) => {
                                                    const isOn = selectedCellData?.candidates.includes(digit);
                                                    return (_jsx("button", { className: isOn ? 'digit active' : 'digit', onClick: () => handleToggleCandidate(digit), disabled: !selectedCellData || selectedCellData.given || selectedCellData.value !== null, children: digit }, `cand-${digit}`));
                                                }) })] })] })] }), _jsx("p", { className: "status", children: status || (solved ? 'Puzzle solved! Great job.' : 'Stay focused and have fun!') })] }))] }));
}
export default App;
