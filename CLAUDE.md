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
- **Leveling**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects the current piece straight down to its landing row, drawn at `globalAlpha = 0.2`.
- **Rendering**: `draw()` clears and redraws the grid, locked board, ghost piece, and current piece every frame onto `#board`; `drawNext()`/`drawQueue()`/`drawHold()` render piece previews via the shared `drawPiecePreview()` helper, which centers a shape of any size in a `gridSpan × gridSpan` cell grid using its bounding box (`pieceBounds`). `drawBlock()` — the single primitive every one of those call sites funnels through — delegates to the active skin's draw routine (see Skins visuales below).

Flow: `init()` builds an empty board, seeds `nextQueue` with `QUEUE_SIZE` pieces, calls `spawn()` (which shifts a piece off `nextQueue` into `current` and pushes a new random one), then starts the `requestAnimationFrame` loop. `spawn()` triggers `endGame()` and returns early if the newly spawned piece immediately collides.

Input is handled by a single `keydown` listener (arrow keys move/rotate/soft-drop, Space hard-drops, X also rotates, P toggles pause, E opens the skill menu, C holds); it's a no-op while paused or game-over except for the pause key itself. While the skill menu is open, the same listener is redirected to menu navigation (arrows/Enter/digits/Escape) instead.

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

## Skins visuales

Four switchable block-rendering skins (`retro`, `neon`, `pastel`, `pixel`), persisted independently of the light/dark theme.

- **`SKINS`**: an object keyed by skin id, each entry `{ name, colors: [null, ...8 colors], grid: { dark, light }, draw(context, x, y, colorIndex, size, alpha) }`. `colors` is each skin's own 8-color palette (`retro` and `pixel` reuse `COLORS`; `neon`/`pastel` have their own `NEON_COLORS`/`PASTEL_COLORS`). `grid` supplies the canvas grid-line color for that skin, keyed by the active theme — needed because canvas drawing can't read CSS custom properties directly (mirrors the old standalone `GRID_COLORS`, which is now just `retro`'s `grid`).
- **`drawBlock(context, x, y, colorIndex, size, alpha)`**: unchanged signature and falsy-`colorIndex` early return; its body now just delegates to `SKINS[currentSkin].draw(...)`. Every call site (board, ghost, falling piece, `drawPiecePreview` for next/queue/hold) is untouched. Each skin's draw routine takes CELL coordinates and multiplies by `size` itself, and must scale any sub-block detail off `size` (not hardcoded pixel offsets) since callers use `size: 30` for the board/next/hold and `size: 14` for the queue preview.
  - `drawBlockRetro`: the original flat fill + 4px top highlight, byte-for-byte — the regression baseline.
  - `drawBlockNeon`: dark fill + a glowing outline via `context.shadowBlur`/`shadowColor`. Always resets `shadowBlur`/`shadowColor` (and `globalAlpha`) to neutral before returning, since they're context-level state that would otherwise bleed into the grid and every preview panel drawn afterward in the same frame.
  - `drawBlockPastel`: soft palette + rounded corners via `context.roundRect` when available, falling back to a manual arc-based path (`tracePixelRoundRect`) when it isn't.
  - `drawBlockPixel`: flat fill plus a checkerboard dither overlay whose cell size is `Math.max(2, Math.floor(size / 6))`, so it stays legible at both 30px and 14px.
- **`drawGrid()`** resolves its stroke color from `SKINS[currentSkin].grid[theme]` instead of a fixed constant, so grid color follows both the active skin and the active theme.
- **Persistence/selector**: `applySkin(name)`/`initSkin()` mirror `applyTheme()`/`initTheme()` exactly — set `document.body.dataset.skin`, sync the `#skin-select` dropdown, persist to `localStorage` under `'tetris-skin'` (default `'retro'`), and redraw all canvases (`draw()`, `drawNext()`, `drawQueue()`, `drawHold()`) guarded by the same `if (current)`/`if (nextQueue)` existence checks so it's safe to call before `init()`. `currentSkin` is a top-level `let`, initialized once and *not* reset by `init()`, so the chosen skin survives restarts just like the theme.
- **CSS coupling**: `body[data-skin="neon"]`/`body[data-skin="pastel"]` in `style.css` override `--board-bg`/`--board-border` to stay coherent with each skin's palette; these rules are declared after the `body[data-theme="light"]` block so the skin's value wins over the theme's for those two variables (both attributes coexist on `<body>` at once).

## Tuning constants (in `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval`, `QUEUE_SIZE`, `ENERGY_MAX`, `ENERGY_GAIN`, `SLOW_DURATION`, `SLOW_FACTOR`, `SKINS`, `NEON_COLORS`, `PASTEL_COLORS`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
