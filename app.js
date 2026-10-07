const DEFAULT_COLORS = [
  '#9b7bd6', '#aed993', '#4ab5b0', '#e3bb4c', '#d57474', '#6bbbe6', '#fba96b',
  '#f8b4d0', '#5c77b4', '#c9c9c9', '#8fd1c4', '#c98f5c', '#e88fd0', '#7f9d4f',
  '#f1e07a', '#a0a0e0',
];

const state = { n: 9, grid: [], colors: DEFAULT_COLORS.slice(0, 9), selected: 0, solution: null };

const $ = id => document.getElementById(id);
const boardEl = $('board'), paletteEl = $('palette'), statusEl = $('status'), sizeEl = $('size');

function setStatus(msg, bad = false) {
  statusEl.textContent = msg;
  statusEl.className = bad ? 'bad' : '';
}

function newBoard(n) {
  state.n = n;
  state.grid = Array.from({ length: n }, () => new Array(n).fill(-1));
  state.colors = DEFAULT_COLORS.slice(0, n);
  state.selected = 0;
  state.solution = null;
  sizeEl.value = n;
  render();
}

function renderPalette() {
  paletteEl.innerHTML = '';
  state.colors.forEach((color, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (state.selected === i ? ' sel' : '');
    b.style.background = color;
    b.setAttribute('aria-label', `Color ${i + 1}`);
    b.onclick = () => { state.selected = i; renderPalette(); };
    paletteEl.appendChild(b);
  });
  const eraser = document.createElement('button');
  eraser.className = 'swatch eraser' + (state.selected === -1 ? ' sel' : '');
  eraser.textContent = '✕';
  eraser.setAttribute('aria-label', 'Eraser');
  eraser.onclick = () => { state.selected = -1; renderPalette(); };
  paletteEl.appendChild(eraser);
}

function renderBoard() {
  const { n, grid, colors, solution } = state;
  boardEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  boardEl.innerHTML = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (grid[r][c] >= 0) cell.style.background = colors[grid[r][c]];
      if (solution && solution[r] === c) cell.textContent = '🐱';
      boardEl.appendChild(cell);
    }
  }
}

function render() { renderPalette(); renderBoard(); }

// Painting: tap or drag across cells.
let painting = false;
function paintAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || !el.classList.contains('cell')) return;
  const r = +el.dataset.r, c = +el.dataset.c;
  if (state.grid[r][c] === state.selected) return;
  state.grid[r][c] = state.selected;
  state.solution = null;
  el.style.background = state.selected >= 0 ? state.colors[state.selected] : '';
  boardEl.querySelectorAll('.cell').forEach(cell => { cell.textContent = ''; });
}
boardEl.addEventListener('pointerdown', e => { painting = true; paintAt(e.clientX, e.clientY); });
window.addEventListener('pointermove', e => { if (painting) paintAt(e.clientX, e.clientY); });
window.addEventListener('pointerup', () => { painting = false; });
window.addEventListener('pointercancel', () => { painting = false; });

function solve() {
  const { n, grid } = state;
  if (grid.some(row => row.includes(-1))) return setStatus('Some cells are still blank. Paint them first.', true);
  const used = new Set(grid.flat());
  if (used.size !== n) return setStatus(`A ${n}×${n} board needs exactly ${n} colors, but ${used.size} are used.`, true);

  // Renumber regions 0..n-1 in case some palette colors were skipped.
  const ids = [...used];
  const regionGrid = grid.map(row => row.map(v => ids.indexOf(v)));
  const t0 = performance.now();
  const solutions = solveMeowdoku(regionGrid, 2);
  const ms = Math.round(performance.now() - t0);

  if (!solutions.length) {
    state.solution = null;
    renderBoard();
    return setStatus('No solution. Double-check the colors.', true);
  }
  state.solution = solutions[0];
  renderBoard();
  setStatus(solutions.length > 1
    ? `Found a solution, but this board has more than one. A color may be misread. (${ms} ms)`
    : `Solved! 😼 (${ms} ms)`);
}

async function loadScreenshot(file) {
  setStatus('Reading screenshot…');
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1100 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = readBoard(ctx.getImageData(0, 0, canvas.width, canvas.height));
    state.n = result.n;
    state.grid = result.grid;
    state.colors = result.colors;
    state.selected = 0;
    state.solution = null;
    sizeEl.value = result.n;
    render();
    setStatus(result.suspicious
      ? `Found a ${result.n}×${result.n} board, but two colors may have been mixed up. Check it, then hit Solve.`
      : `Found a ${result.n}×${result.n} board. Check it looks right, then hit Solve.`, result.suspicious);
  } catch (err) {
    setStatus(err.message || "Couldn't read that image.", true);
  }
}

for (let n = 4; n <= 16; n++) {
  const opt = document.createElement('option');
  opt.value = n;
  opt.textContent = `${n}×${n}`;
  sizeEl.appendChild(opt);
}
sizeEl.onchange = () => { newBoard(+sizeEl.value); setStatus(''); };
$('clear').onclick = () => { newBoard(state.n); setStatus(''); };
$('solve').onclick = solve;
$('hide').onclick = () => { state.solution = null; renderBoard(); };
$('file').onchange = e => { if (e.target.files[0]) loadScreenshot(e.target.files[0]); e.target.value = ''; };

newBoard(9);
