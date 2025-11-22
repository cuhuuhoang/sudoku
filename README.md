# Sudoku Trainer

A touch-friendly React + Vite Sudoku trainer that runs on port 7203 and adapts to Chrome and mobile browsers. Features include difficulty selection, auto-generated puzzles, candidate management, undo history, save/load via local storage, and a light/dark mode toggle to conserve device power.

## Requirements
- Node.js 20+
- npm

## Getting Started
```bash
npm install
npm run dev
```
The dev server binds to `0.0.0.0:7203` so you can load it from other devices on your network. Use `npm run build` for a production bundle.

## Scripts
- `npm run dev` – start Vite dev server on port 7203
- `npm run test` – run the Vitest suite
- `npm run build` – type-check and build production assets
- `scripts/test.sh` – helper script that installs deps (if needed) then runs tests and build

## Deploying to GitHub Pages
This repo is pre-configured for GitHub Pages using the workflow in `.github/workflows/deploy.yml`.

1. Push to `master` on GitHub – the workflow installs deps, runs the build, and publishes `dist` to Pages.
2. In the repository settings (`Settings` → `Pages`), set the build source to **GitHub Actions** (one-time step).
3. Wait for the workflow to finish; the site will be available at `https://<your-user>.github.io/sudoku/`.

Notes:
- Vite’s `base` is set to `/sudoku/` for production builds. If you rename the repository, update `repoBase` inside `vite.config.ts`.
- You can trigger manual deployments via the “Deploy to GitHub Pages” workflow dispatch in the Actions tab.

## Features
- **Level picker**: Easy/Medium/Hard generator with unique solutions
- **Board interactions**: Tap-only value entry, candidate toggling, auto-cleanup/promote, undo history (3 steps)
- **Persistence**: Save/Load current puzzle, auto-resume on refresh
- **Controls**: Reset, New puzzle at current level, Save, Undo, and board status messaging
- **Visualization**: In-board candidates, larger digits, matching tile styles, and responsive layout for mobile/desktop
- **Night mode**: Toggle at the bottom of both the level selector and game screen; theme persists via local storage
- **Deployment ready**: Vite preview also binds to 7203

## Notes
- Puzzles are generated locally with a backtracking/unique-solution algorithm; no external API required.
- Undo history only records manual value/candidate edits and holds the three most recent states.
- Auto-clean and single promotion run after every manual edit to keep candidates accurate.
