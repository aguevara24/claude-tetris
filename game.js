'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (nut), gray with hollow center
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (hollow center)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// ---- Habilidades cargables ----
const QUEUE_SIZE = 5;                      // piezas siempre precalculadas en la cola (NEXT + previsualización)
const ENERGY_MAX = 100;
const ENERGY_GAIN = [0, 10, 25, 45, 70];   // % ganado según nº de líneas limpiadas de golpe (índice = min(cleared, 4))
const SLOW_DURATION = 10000;               // ms que dura "Ralentizar"
const SLOW_FACTOR = 2.5;                   // multiplicador del intervalo de caída mientras dura
const SKILL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];

const GRID_COLORS = { dark: '#22222e', light: '#d8d8e4' };
const THEME_KEY = 'tetris-theme';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const queueCanvas = document.getElementById('queue-canvas');
const queueCtx = queueCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const energyFill = document.getElementById('energy-fill');
const energyHint = document.getElementById('energy-hint');
const slowIndicator = document.getElementById('slow-indicator');
const queueSection = document.getElementById('queue-section');
const holdSection = document.getElementById('hold-section');
const holdControl = document.getElementById('hold-control');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skillOverlay = document.getElementById('skill-overlay');
const skillItems = Array.from(document.querySelectorAll('#skill-list .skill-item'));

let board, current, nextQueue, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let energy, skillMenuOpen, skillIndex, previewExpanded, holdUnlocked, holdPiece, holdUsed, slowRemaining, undoSnapshot;

// Definidas más abajo, tras las funciones que usan (previewExpanded, canSwap, undo, etc.)
let SKILLS;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function clonePiece(p) {
  return { type: p.type, shape: p.shape.map(row => [...row]), x: p.x, y: p.y };
}

// Devuelve una copia del tipo de pieza dado en su forma original y posición de spawn
// (usado por swap/hold/undo para no arrastrar rotaciones previas).
function resetPiece(piece) {
  const shape = PIECES[piece.type].map(row => [...row]);
  return { type: piece.type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    energy = Math.min(ENERGY_MAX, energy + ENERGY_GAIN[Math.min(cleared, 4)]);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

// Guarda el estado justo antes de fijar una pieza, para poder deshacerlo con la habilidad "Deshacer".
function snapshot() {
  undoSnapshot = {
    board: board.map(row => [...row]),
    piece: clonePiece(current),
    queue: nextQueue.map(clonePiece),
    hold: holdPiece ? clonePiece(holdPiece) : null,
    holdUsed,
    score, lines, level, dropInterval,
  };
}

function lockPiece() {
  snapshot();
  merge();
  clearLines();
  spawn();
  holdUsed = false; // pieza nueva: se puede volver a usar Hold
}

function spawn() {
  current = nextQueue.shift();
  nextQueue.push(randomPiece());
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
  drawQueue();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  energyFill.style.width = energy + '%';
  energyFill.classList.toggle('full', energy >= ENERGY_MAX);
  energyHint.textContent = energy >= ENERGY_MAX ? 'Pulsa E' : 'Limpia líneas';
  updateSlowIndicator();
}

function updateSlowIndicator() {
  if (slowRemaining > 0) {
    slowIndicator.textContent = `SLOW ${(slowRemaining / 1000).toFixed(1)}s`;
    slowIndicator.classList.remove('hidden');
  } else {
    slowIndicator.classList.add('hidden');
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// Bounding box de las celdas ocupadas de una forma (para centrar piezas de distinto tamaño en los paneles).
function pieceBounds(shape) {
  let minR = shape.length, maxR = -1, minC = shape[0].length, maxC = -1;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  return { minR, minC, height: maxR - minR + 1, width: maxC - minC + 1 };
}

function drawPiecePreview(context, piece, size, gridSpan, alpha) {
  if (!piece) return;
  const shape = piece.shape;
  const b = pieceBounds(shape);
  const offX = Math.floor((gridSpan - b.width) / 2) - b.minC;
  const offY = Math.floor((gridSpan - b.height) / 2) - b.minR;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c])
        drawBlock(context, offX + c, offY + r, shape[r][c], size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = document.body.dataset.theme === 'light' ? GRID_COLORS.light : GRID_COLORS.dark;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  drawPiecePreview(nextCtx, nextQueue[0], 30, 4);
}

// Panel "COLA": muestra las 4 piezas siguientes a la de NEXT (habilidad "Ver 5 siguientes").
function drawQueue() {
  queueCtx.clearRect(0, 0, queueCanvas.width, queueCanvas.height);
  if (!previewExpanded) return;
  const size = 14;
  const gridPx = size * 4;
  const rowHeight = queueCanvas.height / (QUEUE_SIZE - 1);
  const offsetX = (queueCanvas.width - gridPx) / 2;
  for (let i = 1; i < QUEUE_SIZE; i++) {
    const rowTop = (i - 1) * rowHeight + (rowHeight - gridPx) / 2;
    queueCtx.save();
    queueCtx.translate(offsetX, rowTop);
    drawPiecePreview(queueCtx, nextQueue[i], size, 4);
    queueCtx.restore();
  }
}

// Panel "RESERVA": pieza guardada con la habilidad Hold.
function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  drawPiecePreview(holdCtx, holdPiece, 30, 4, holdUsed ? 0.35 : 1);
}

function refreshPanels() {
  queueSection.classList.toggle('hidden', !previewExpanded);
  holdSection.classList.toggle('hidden', !holdUnlocked);
  holdControl.classList.toggle('hidden', !holdUnlocked);
  drawQueue();
  drawHold();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

// Congela/reanuda el loop de juego; compartido por la pausa y el menú de habilidades.
function freeze() {
  cancelAnimationFrame(animId);
}

function resume() {
  cancelAnimationFrame(animId);
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function togglePause() {
  if (gameOver || skillMenuOpen) return;
  paused = !paused;
  if (paused) {
    freeze();
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
    resume();
  }
}

function effectiveInterval() {
  return slowRemaining > 0 ? dropInterval * SLOW_FACTOR : dropInterval;
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (slowRemaining > 0) {
    slowRemaining = Math.max(0, slowRemaining - dt);
    updateSlowIndicator();
  }
  dropAccum += dt;
  if (dropAccum >= effectiveInterval()) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

// ---- Habilidad: Intercambiar pieza actual por la del pool (NEXT) ----
function canSwap() {
  const incoming = resetPiece(nextQueue[0]);
  return !collide(incoming.shape, incoming.x, incoming.y);
}

function swapWithQueue() {
  const incoming = resetPiece(nextQueue[0]);
  if (collide(incoming.shape, incoming.x, incoming.y)) return false;
  nextQueue[0] = resetPiece(current);
  current = incoming;
  drawNext();
  return true;
}

// ---- Habilidad: Deshacer la última colocación ----
function undo() {
  if (!undoSnapshot) return false;
  const s = undoSnapshot;
  board = s.board.map(row => [...row]);
  nextQueue = s.queue.map(clonePiece);
  holdPiece = s.hold ? clonePiece(s.hold) : null;
  holdUsed = s.holdUsed;
  score = s.score;
  lines = s.lines;
  level = s.level;
  dropInterval = s.dropInterval;
  dropAccum = 0;

  const restored = resetPiece(s.piece);
  current = collide(restored.shape, restored.x, restored.y) ? clonePiece(s.piece) : restored;

  undoSnapshot = null;
  updateHUD();
  refreshPanels();
  drawNext();
  return true;
}

// ---- Habilidad: Reservar (Hold), tecla C ----
function doHold() {
  if (!holdUnlocked || holdUsed || paused || gameOver || skillMenuOpen) return;
  if (!holdPiece) {
    holdPiece = resetPiece(current);
    spawn();
  } else {
    const swapped = resetPiece(holdPiece);
    if (collide(swapped.shape, swapped.x, swapped.y)) return;
    holdPiece = resetPiece(current);
    current = swapped;
  }
  holdUsed = true;
  refreshPanels();
  updateHUD();
}

SKILLS = [
  {
    id: 'preview',
    name: 'Ver 5 siguientes',
    available: () => !previewExpanded,
    apply: () => { previewExpanded = true; refreshPanels(); return true; },
  },
  {
    id: 'swap',
    name: 'Intercambiar pieza',
    available: () => canSwap(),
    apply: swapWithQueue,
  },
  {
    id: 'slow',
    name: 'Ralentizar 10s',
    available: () => true,
    apply: () => { slowRemaining = SLOW_DURATION; updateSlowIndicator(); return true; },
  },
  {
    id: 'undo',
    name: 'Deshacer colocación',
    available: () => undoSnapshot !== null,
    apply: undo,
  },
  {
    id: 'hold',
    name: 'Reservar (Hold)',
    available: () => !holdUnlocked,
    apply: () => { holdUnlocked = true; refreshPanels(); return true; },
  },
];

function openSkillMenu() {
  if (energy < ENERGY_MAX || paused || gameOver || skillMenuOpen) return;
  skillMenuOpen = true;
  skillIndex = 0;
  freeze();
  renderSkillMenu();
  skillOverlay.classList.remove('hidden');
}

function closeSkillMenu(spent) {
  skillOverlay.classList.add('hidden');
  skillMenuOpen = false;
  if (spent) energy = 0;
  updateHUD();
  resume();
}

function renderSkillMenu() {
  skillItems.forEach((item, i) => {
    const skill = SKILLS[i];
    item.classList.toggle('disabled', !skill.available());
    item.classList.toggle('selected', i === skillIndex);
  });
}

function moveSkillSelection(delta) {
  skillIndex = (skillIndex + delta + SKILLS.length) % SKILLS.length;
  renderSkillMenu();
}

function chooseSkill(i) {
  if (!skillMenuOpen) return;
  const skill = SKILLS[i];
  if (!skill || !skill.available()) return;
  const result = skill.apply();
  if (result === false) {
    renderSkillMenu();
    return;
  }
  closeSkillMenu(true);
}

skillItems.forEach((item, i) => {
  item.addEventListener('click', () => chooseSkill(i));
});

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();

  energy = 0;
  skillMenuOpen = false;
  skillIndex = 0;
  previewExpanded = false;
  holdUnlocked = false;
  holdPiece = null;
  holdUsed = false;
  slowRemaining = 0;
  undoSnapshot = null;

  nextQueue = Array.from({ length: QUEUE_SIZE }, randomPiece);
  spawn();
  updateHUD();
  refreshPanels();
  overlay.classList.add('hidden');
  skillOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (skillMenuOpen) {
    if (e.code === 'Escape') closeSkillMenu(false);
    else if (e.code === 'ArrowUp') moveSkillSelection(-1);
    else if (e.code === 'ArrowDown') moveSkillSelection(1);
    else if (e.code === 'Enter') chooseSkill(skillIndex);
    else if (SKILL_KEYS.includes(e.code)) chooseSkill(SKILL_KEYS.indexOf(e.code));
    else return;
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyE':
      openSkillMenu();
      break;
    case 'KeyC':
      doHold();
      break;
  }
  updateHUD();
});

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeToggle.checked = theme === 'light';
  localStorage.setItem(THEME_KEY, theme);
  if (current) draw();
  if (nextQueue) {
    drawNext();
    drawQueue();
    drawHold();
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

restartBtn.addEventListener('click', init);

initTheme();
init();
