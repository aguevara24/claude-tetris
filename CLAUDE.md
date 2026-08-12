# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris implemented in vanilla JavaScript (HTML5 Canvas, CSS3). No dependencies, no build step, no `package.json`. Three files: `index.html`, `style.css`, `game.js`.

## Running

No build/install step. Open directly or serve statically:

```bash
start index.html          # Windows, open directly
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

There is no test suite, linter, or bundler configured in this repo.

## Architecture

All game logic lives in `game.js` as top-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) plus functions operating on that shared state — no classes, no modules.

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces**: defined as square matrices in `PIECES`. Rotation is done via `rotateCW` (transpose + reverse), not by storing pre-rotated states.
- **Collision** (`collide`): checks board bounds and overlap with locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding position is found, else the rotation is discarded.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates elapsed time in `dropAccum` and advances the piece one row once `dropInterval` is exceeded.
- **Line clearing** (`clearLines`): scans bottom-to-top, splices full rows out and unshifts empty rows at the top.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 pts/row dropped, soft drop adds 1 pt/row.
- **Leveling**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects the current piece straight down to its landing row, drawn at `globalAlpha = 0.2`.
- **Rendering**: `draw()` clears and redraws the grid, locked board, ghost piece, and current piece every frame onto `#board`; `drawNext()` renders the preview piece onto the separate `#next-canvas`.

Flow: `init()` builds an empty board, seeds `next`, calls `spawn()` (which promotes `next` to `current` and generates a new `next`), then starts the `requestAnimationFrame` loop. `spawn()` triggers `endGame()` if the newly spawned piece immediately collides.

Input is handled by a single `keydown` listener (arrow keys move/rotate/soft-drop, Space hard-drops, P toggles pause); it's a no-op while paused or game-over except for the pause key itself.

## Tuning constants (in `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
