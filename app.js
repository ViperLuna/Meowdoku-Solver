const DEFAULT_COLORS = [
  '#9b7bd6', '#aed993', '#4ab5b0', '#e3bb4c', '#d57474', '#6bbbe6', '#fba96b',
  '#f8b4d0', '#5c77b4', '#c9c9c9', '#8fd1c4', '#c98f5c', '#e88fd0', '#7f9d4f',
  '#f1e07a', '#a0a0e0',
];

const state = {
  n: 9, grid: [], colors: DEFAULT_COLORS.slice(0, 9), selected: 0,
  placed: new Set(),    // "r,c" of cats you've already put down
  solution: null,       // solution[row] = col
  shown: new Set(),     // "r,c" of solution cats revealed so far
};
const CAT_TOOL = 'cat';
const key = (r, c) => `${r},${c}`;

const $ = id => document.getElementById(id);
const boardEl = $('board'), paletteEl = $('palette'), statusEl = $('status'), sizeEl = $('size');

function setStatus(msg, bad = false) {
  statusEl.textContent = msg;
  statusEl.className = bad ? 'bad' : '';
}

function resetAnswer() {
  state.solution = null;
  state.shown.clear();
}

function newBoard(n) {
  state.n = n;
  state.grid = Array.from({ length: n }, () => new Array(n).fill(-1));
  state.colors = DEFAULT_COLORS.slice(0, n);
  state.selected = 0;
  state.placed.clear();
  resetAnswer();
  sizeEl.value = n;
  render();
}

function swatch(cls, label, onclick, background, text) {
  const b = document.createElement('button');
  b.className = cls;
  b.setAttribute('aria-label', label);
  if (background) b.style.background = background;
  if (text) b.textContent = text;
  b.onclick = onclick;
  paletteEl.appendChild(b);
}

function renderPalette() {
  paletteEl.innerHTML = '';
  const pick = v => () => { state.selected = v; renderPalette(); };
  const sel = v => state.selected === v ? ' sel' : '';
  state.colors.forEach((color, i) => swatch('swatch' + sel(i), `Color ${i + 1}`, pick(i), color));
  swatch('swatch eraser' + sel(-1), 'Eraser', pick(-1), null, '✕');
  swatch('swatch eraser' + sel(CAT_TOOL), 'Place or remove a cat', pick(CAT_TOOL), null, '🐈‍⬛');
}

function cellContent(r, c) {
  const k = key(r, c);
  if (state.placed.has(k)) return { text: '🐈‍⬛', cls: '' };
  if (state.solution && state.solution[r] === c && state.shown.has(k)) return { text: '🐱', cls: 'answer' };
  return { text: '', cls: '' };
}

function renderBoard() {
  const { n, grid, colors } = state;
  boardEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  boardEl.innerHTML = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = document.createElement('div');
      const { text, cls } = cellContent(r, c);
      cell.className = 'cell ' + cls;
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (grid[r][c] >= 0) cell.style.background = colors[grid[r][c]];
      cell.textContent = text;
      boardEl.appendChild(cell);
    }
  }
}

function render() { renderPalette(); renderBoard(); }

function cellAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.classList.contains('cell') ? el : null;
}

// Painting: tap or drag across cells. The cat tool toggles one cell per tap.
let painting = false;
function paintAt(x, y) {
  const el = cellAt(x, y);
  if (!el) return;
  const r = +el.dataset.r, c = +el.dataset.c;
  if (state.grid[r][c] === state.selected) return;
  state.grid[r][c] = state.selected;
  resetAnswer();
  renderBoard();
}
boardEl.addEventListener('pointerdown', e => {
  if (state.selected === CAT_TOOL) {
    const el = cellAt(e.clientX, e.clientY);
    if (!el) return;
    const k = key(+el.dataset.r, +el.dataset.c);
    state.placed.has(k) ? state.placed.delete(k) : state.placed.add(k);
    resetAnswer();
    renderBoard();
    return;
  }
  painting = true;
  paintAt(e.clientX, e.clientY);
});
window.addEventListener('pointermove', e => { if (painting) paintAt(e.clientX, e.clientY); });
window.addEventListener('pointerup', () => { painting = false; });
window.addEventListener('pointercancel', () => { painting = false; });

// Works out the answer around your cats. The game only accepts correct cats,
// so if they don't fit, a color was misread. Returns false and
// sets a status message when it can't.
function computeSolution() {
  const { n, grid } = state;
  if (grid.some(row => row.includes(-1))) return setStatus('Some cells are still blank. Paint them first.', true), false;
  const used = new Set(grid.flat());
  if (used.size !== n) return setStatus(`A ${n}×${n} board needs exactly ${n} colors, but ${used.size} are used.`, true), false;

  // Renumber regions 0..n-1 in case some palette colors were skipped.
  const ids = [...used];
  const regionGrid = grid.map(row => row.map(v => ids.indexOf(v)));

  const fixed = new Array(n).fill(-1);
  let fixable = true;
  for (const k of state.placed) {
    const [r, c] = k.split(',').map(Number);
    if (fixed[r] >= 0) fixable = false;
    fixed[r] = c;
  }

  const solutions = fixable ? solveMeowdoku(regionGrid, 2, fixed) : [];
  if (!solutions.length) {
    state.solution = null;
    renderBoard();
    const why = state.placed.size ? "Your cats don't fit this board, so a color was probably misread." : 'No solution.';
    return setStatus(`${why} Double-check the colors.`, true), false;
  }
  state.solution = solutions[0];
  state.unique = solutions.length === 1;
  return true;
}

function answerStatus(prefix) {
  setStatus(state.unique ? prefix : `${prefix} This board has more than one answer though, so a color may be misread.`, !state.unique);
}

function solve() {
  if (!computeSolution()) return;
  state.solution.forEach((c, r) => state.shown.add(key(r, c)));
  renderBoard();
  answerStatus('Solved! 😼');
}

// Reveal one cat, starting with the one in the smallest color region.
function hint() {
  if (!state.solution && !computeSolution()) return;
  const { solution, grid } = state;
  const regionSize = id => grid.flat().filter(v => v === id).length;
  const remaining = solution
    .map((c, r) => ({ r, c, k: key(r, c) }))
    .filter(({ k }) => !state.placed.has(k) && !state.shown.has(k))
    .sort((a, b) => regionSize(grid[a.r][a.c]) - regionSize(grid[b.r][b.c]));
  if (!remaining.length) { renderBoard(); return answerStatus('That\'s every cat! 😼'); }
  state.shown.add(remaining[0].k);
  renderBoard();
  answerStatus(`Here's one. ${remaining.length - 1} to go.`);
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
    state.placed = new Set(result.cats.map(([r, c]) => key(r, c)));
    resetAnswer();
    sizeEl.value = result.n;
    render();
    const cats = result.cats.length ? ` with ${result.cats.length} cat${result.cats.length > 1 ? 's' : ''} already placed` : '';
    setStatus(result.suspicious
      ? `Found a ${result.n}×${result.n} board${cats}, but two colors may have been mixed up. Check it, then hit Solve.`
      : `Found a ${result.n}×${result.n} board${cats}. Check it looks right, then hit Solve or Hint.`, result.suspicious);
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
$('hint').onclick = hint;
$('hide').onclick = () => { state.shown.clear(); renderBoard(); setStatus(''); };
$('file').onchange = e => { if (e.target.files[0]) loadScreenshot(e.target.files[0]); e.target.value = ''; };

newBoard(9);
