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

All game logic lives in `game.js` as top-level mutable state (`board`, `current`, `nextQueue`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, plus the skill-system state below) plus functions operating on that shared state — no classes, no modules.

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–8` identifying which piece locked there (`1–7` tetrominoes, `8` the N/tuerca piece).
- **Pieces**: defined as square matrices in `PIECES`. Rotation is done via `rotateCW` (transpose + reverse), not by storing pre-rotated states.
- **Collision** (`collide`): checks board bounds and overlap with locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding position is found, else the rotation is discarded.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates elapsed time in `dropAccum` and advances the piece one row once `effectiveInterval()` (see Habilidades) is exceeded.
- **Line clearing** (`clearLines`): scans bottom-to-top, splices full rows out and unshifts empty rows at the top.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 pts/row dropped, soft drop adds 1 pt/row.
- **Leveling**: level = `floor(lines / 10) + startLevel`; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms. `startLevel` (1–15, see Menú de pausa) sets the floor a game starts and regresses to.
- **Ghost piece** (`ghostY`): projects the current piece straight down to its landing row, drawn at `globalAlpha = 0.2`.
- **Rendering**: `draw()` clears and redraws the grid, locked board, ghost piece, and current piece every frame onto `#board`; `drawNext()`/`drawQueue()`/`drawHold()` render piece previews via the shared `drawPiecePreview()` helper, which centers a shape of any size in a `gridSpan × gridSpan` cell grid using its bounding box (`pieceBounds`).

Flow: `init()` builds an empty board, seeds `nextQueue` with `QUEUE_SIZE` pieces, calls `spawn()` (which shifts a piece off `nextQueue` into `current` and pushes a new random one), then starts the `requestAnimationFrame` loop. `spawn()` triggers `endGame()` and returns early if the newly spawned piece immediately collides.

Input is handled by a single `keydown` listener (arrow keys move/rotate/soft-drop, Space hard-drops, X also rotates, P or Escape opens the pause menu, E opens the skill menu, C holds); it's a no-op while paused or game-over except for the pause keys themselves. While the skill menu is open, the same listener is redirected to menu navigation (arrows/Enter/digits/Escape) instead; the `skillMenuOpen` branch is checked first so `Escape` still cancels the skill menu rather than opening the pause menu. While the pause menu is open, a second branch (checked next, before the game's `switch`) redirects the same listener to pause-menu navigation instead, so no game input leaks through.

## Habilidades (skill system)

A single-charge energy bar fills as lines are cleared and, once full, lets the player spend it on one of five skills via an in-game menu.

- **Energy**: `energy` (0–`ENERGY_MAX`) gains `ENERGY_GAIN[min(cleared, 4)]` per lock in `clearLines()` — 10/25/45/70% for 1/2/3/4+ simultaneous lines (the N piece can clear more than 4 rows at once, hence the clamp). The bar and `Pulsa E` hint are driven by `updateHUD()`.
- **Menu** (`openSkillMenu`/`closeSkillMenu`/`chooseSkill`, `#skill-overlay`): `E` freezes the game loop (`freeze()`) and opens the menu, only when `energy >= ENERGY_MAX`. Navigate with arrows/digits 1–5/Enter/click; `Esc` cancels without spending energy. Selecting a valid skill runs its `apply()` from the `SKILLS` array, resets `energy` to 0, and calls `resume()`.
- **`freeze()`/`resume()`**: shared helpers that cancel/restart the `requestAnimationFrame` loop, used by both `togglePause()` and the skill menu so pausing and the menu never conflict or stack loops.
- **Ver 5 siguientes**: sets `previewExpanded = true` permanently, revealing the `#queue-section` panel (`drawQueue()`, piece indices `nextQueue[1..4]`) alongside the always-visible `NEXT` (`nextQueue[0]`).
- **Intercambiar pieza** (`swapWithQueue`): swaps `current` with `nextQueue[0]`, resetting both to their spawn shape/position via `resetPiece()`; aborts (no energy spent) if the incoming piece would collide (`canSwap()`).
- **Ralentizar 10s**: sets `slowRemaining = SLOW_DURATION`; `loop()` counts it down each frame and `effectiveInterval()` multiplies `dropInterval` by `SLOW_FACTOR` while it's active. `#slow-indicator` shows the remaining time.
- **Deshacer colocación** (`undo`): `snapshot()` captures board/piece/queue/hold/score/lines/level/dropInterval right before every `merge()` in `lockPiece()`; `undo()` restores that snapshot. Disabled (`undoSnapshot === null`) before the first piece locks.
- **Reservar (Hold)** (`doHold`, key `C`): first use sets `holdUnlocked = true` permanently and reveals the `#hold-section`/`C` control hint; each subsequent press stores/swaps `current` with `holdPiece` (via `resetPiece()`), limited to one use per piece — `holdUsed` is set in `doHold()` and cleared in `lockPiece()`, not in `spawn()`, so a piece pulled from the queue by a hold can't be hold-swapped again until it locks.

## Menú de pausa

`P` or `Escape` opens a dedicated `#pause-overlay` (styled like `#skill-overlay`, sharing its `.skill-box`/`.skill-item` markup and CSS), replacing the old behavior of reusing `#overlay` with a `'PAUSA'` title.

- **State**: `pauseMenuOpen`, `pauseIndex` (selected row in `#pause-list`), `pauseView` (`'main' | 'controls' | 'level'`, controls which sub-panel of the box is visible), `startLevel` (1–15, persisted).
- **Menu** (`openPauseMenu`/`closePauseMenu`/`resumeGame`/`choosePauseItem`, `#pause-overlay`): `P`/`Escape` calls `togglePause()`, which opens the menu via `openPauseMenu()` (sets `paused = true`, `freeze()`s the loop) when closed, or resumes via `resumeGame()` when open. Only reachable when neither `gameOver` nor `skillMenuOpen`. Navigate `#pause-list` with arrows/digits 1–4/Enter/click (`movePauseSelection`, `choosePauseItem`); only active while `pauseView === 'main'`.
- **Input blocking**: the keydown listener checks `pauseMenuOpen` right after `skillMenuOpen` and before the `if (paused || gameOver) return;` line, redirecting all keys to pause-menu navigation and returning before the game's `switch` — no game input leaks while the menu is open, and closing it doesn't leak a trailing keystroke either.
- **Reanudar**: `resumeGame()` — closes the overlay, clears `paused`, calls `resume()`.
- **Reiniciar**: closes the overlay and calls `init()` (which re-reads `startLevel` for the new game).
- **Ver controles**: sets `pauseView = 'controls'`, revealing the `#pause-controls` key-list sub-panel in place of `#pause-list`; `Escape`/`Enter` return to `pauseView = 'main'` rather than closing the menu.
- **Nivel inicial**: sets `pauseView = 'level'`, revealing `#pause-level`; `ArrowLeft`/`ArrowRight` (or the `#level-dec`/`#level-inc` buttons) call `adjustStartLevel()`, clamping `startLevel` to 1–15 and persisting it to `localStorage` under `tetris-start-level` (read back by `initStartLevel()` on load). Only affects the next `init()`, not the game in progress.

## Tuning constants (in `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval`, `QUEUE_SIZE`, `ENERGY_MAX`, `ENERGY_GAIN`, `SLOW_DURATION`, `SLOW_FACTOR`, `START_LEVEL_MIN`, `START_LEVEL_MAX`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
