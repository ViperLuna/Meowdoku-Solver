const DEFAULT_COLORS = [
  '#9b7bd6', '#aed993', '#4ab5b0', '#e3bb4c', '#d57474', '#6bbbe6', '#fba96b',
  '#f8b4d0', '#5c77b4', '#c9c9c9', '#8fd1c4', '#c98f5c', '#e88fd0', '#7f9d4f',
  '#f1e07a', '#a0a0e0',
];

const state = {
  n: 9, grid: [], colors: DEFAULT_COLORS.slice(0, 9), selected: 0,
  marks: [],            // marks[r][c]: OPEN, CAT or X
  hintKeys: new Set(),  // "r,c" of marks the Hint button added
  focus: new Set(),     // squares the latest hint is talking about
  fresh: new Set(),     // squares the latest hint just marked
  wrong: new Set(),     // X's that sit on a cat square
  solution: null,       // solution[row] = col
  showAnswer: false,
};
const CAT_TOOL = 'cat', X_TOOL = 'x';
const key = (r, c) => `${r},${c}`;

const $ = id => document.getElementById(id);
const boardEl = $('board'), paletteEl = $('palette'), statusEl = $('status'), sizeEl = $('size');

function setStatus(msg, bad = false) {
  statusEl.textContent = msg;
  statusEl.className = bad ? 'bad' : '';
}

function clearHighlights() {
  state.focus.clear();
  state.fresh.clear();
  state.wrong.clear();
}

function resetAnswer() {
  state.solution = null;
  state.showAnswer = false;
  clearHighlights();
}

function emptyMarks(n) {
  return Array.from({ length: n }, () => new Array(n).fill(OPEN));
}

function newBoard(n) {
  state.n = n;
  state.grid = Array.from({ length: n }, () => new Array(n).fill(-1));
  state.colors = DEFAULT_COLORS.slice(0, n);
  state.selected = 0;
  state.marks = emptyMarks(n);
  state.hintKeys.clear();
  resetAnswer();
  sizeEl.value = n;
  render();
}

// Rough everyday names for colors, used in hint explanations.
function colorName(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max !== min) {
    if (max === r) h = 60 * (((g - b) / (max - min)) % 6);
    else if (max === g) h = 60 * ((b - r) / (max - min) + 2);
    else h = 60 * ((r - g) / (max - min) + 4);
  }
  if (h < 0) h += 360;
  if (s < 0.15) return l > 0.7 ? 'light gray' : 'gray';
  let name;
  if (h < 15 || h >= 345) name = 'red';
  else if (h < 40) name = l < 0.5 ? 'brown' : 'orange';
  else if (h < 65) name = 'yellow';
  else if (h < 160) name = 'green';
  else if (h < 195) name = 'teal';
  else if (h < 250) name = l < 0.55 && s < 0.5 ? 'navy' : 'blue';
  else if (h < 290) name = 'purple';
  else name = 'pink';
  return (l > 0.78 ? 'light ' : '') + name;
}

// Names for each color on the board, made unique when two sound the same.
function colorNames(ids) {
  const names = ids.map(id => colorName(state.colors[id]));
  const seen = {};
  names.forEach((name, i) => { (seen[name] ||= []).push(i); });
  for (const idxs of Object.values(seen)) {
    if (idxs.length < 2) continue;
    idxs.forEach((i, k) => { names[i] = `${names[i]} #${k + 1}`; });
  }
  return names;
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
  swatch('swatch tool' + sel(-1), 'Erase color', pick(-1), null, '⌫');
  swatch('swatch tool' + sel(CAT_TOOL), 'Place or remove a cat', pick(CAT_TOOL), null, '🐈‍⬛');
  swatch('swatch tool' + sel(X_TOOL), 'Place or remove an X', pick(X_TOOL), null, '✕');
}

function renderBoard() {
  const { n, grid, colors, marks, solution } = state;
  boardEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  boardEl.innerHTML = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = key(r, c);
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (state.focus.has(k)) cell.classList.add('focus');
      if (state.fresh.has(k)) cell.classList.add('fresh');
      if (state.wrong.has(k)) cell.classList.add('wrong');
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (grid[r][c] >= 0) cell.style.background = colors[grid[r][c]];
      if (marks[r][c] === CAT) cell.textContent = '🐈‍⬛';
      else if (state.showAnswer && solution && solution[r] === c) {
        cell.textContent = '🐱';
        cell.classList.add('answer');
      } else if (marks[r][c] === X) {
        cell.innerHTML = '<span class="x">✕</span>';
      }
      boardEl.appendChild(cell);
    }
  }
}

function render() { renderPalette(); renderBoard(); }

function cellAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest('.cell');
  return cell && boardEl.contains(cell) ? cell : null;
}

// Painting: tap or drag across cells. The cat and X tools toggle one cell per tap.
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
  if (state.selected === CAT_TOOL || state.selected === X_TOOL) {
    const el = cellAt(e.clientX, e.clientY);
    if (!el) return;
    const r = +el.dataset.r, c = +el.dataset.c;
    const mark = state.selected === CAT_TOOL ? CAT : X;
    state.marks[r][c] = state.marks[r][c] === mark ? OPEN : mark;
    state.hintKeys.delete(key(r, c));
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

// The board as region ids 0..n-1 (renumbered in case palette colors were
// skipped), or null with a status message when it isn't ready.
function regionBoard() {
  const { n, grid } = state;
  if (grid.some(row => row.includes(-1))) return setStatus('Some cells are still blank. Paint them first.', true), null;
  const ids = [...new Set(grid.flat())];
  if (ids.length !== n) return setStatus(`A ${n}×${n} board needs exactly ${n} colors, but ${ids.length} are used.`, true), null;
  return { ids, regions: grid.map(row => row.map(v => ids.indexOf(v))) };
}

// Works out the answer around your cats. The game only accepts correct cats,
// so if they don't fit, a color was misread. Returns false and
// sets a status message when it can't.
function computeSolution() {
  const board = regionBoard();
  if (!board) return false;
  const { n, marks } = state;

  const fixed = new Array(n).fill(-1);
  let fixable = true;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (marks[r][c] !== CAT) continue;
      if (fixed[r] >= 0) fixable = false;
      fixed[r] = c;
    }
  }
  const hasCats = fixed.some(c => c >= 0);

  const solutions = fixable ? solveMeowdoku(board.regions, 2, fixed) : [];
  if (!solutions.length) {
    state.solution = null;
    renderBoard();
    const why = hasCats ? "Your cats don't fit this board, so a color was probably misread." : 'No solution.';
    return setStatus(`${why} Double-check the colors.`, true), false;
  }
  state.solution = solutions[0];
  state.unique = solutions.length === 1;
  return true;
}

// The game only checks cats, so a white X can be wrong. Check every X against
// the answer (worked out from the colors and your cats) before anything else.
// Wrong X's get removed here and outlined red. Returns a message, or ''.
function checkXs() {
  const { marks, n } = state;
  if (!marks.flat().includes(X) || !computeSolution() || !state.unique) return '';
  const bad = [];
  for (let r = 0; r < n; r++) {
    const c = state.solution[r];
    if (marks[r][c] === X) bad.push([r, c]);
  }
  if (!bad.length) return '';
  for (const [r, c] of bad) {
    marks[r][c] = OPEN;
    state.hintKeys.delete(key(r, c));
    state.wrong.add(key(r, c));
  }
  const where = bad.map(([r, c]) => `row ${r + 1}, column ${c + 1}`).join(' and ');
  return bad.length === 1
    ? `Hold up: your X at ${where} is wrong. That's actually where a cat goes. I took it off here (red outline), so remove it in the game too.`
    : `Hold up: your X's at ${where} are wrong. Those are cat squares. I took them off here (red outlines), so remove them in the game too.`;
}

function solve() {
  if (!computeSolution()) return;
  clearHighlights();
  const xWarning = checkXs();
  state.showAnswer = true;
  renderBoard();
  if (xWarning) return setStatus(xWarning, true);
  setStatus(state.unique ? 'Solved! 😼' : 'Solved, but this board has more than one answer, so a color may be misread.', !state.unique);
}

function applyMarks(cells, mark) {
  for (const [r, c] of cells || []) {
    state.marks[r][c] = mark;
    state.hintKeys.add(key(r, c));
    state.fresh.add(key(r, c));
  }
}

// One logical move per tap, easiest first: places a cat or rules squares out.
function hint() {
  const board = regionBoard();
  if (!board) return;
  const names = colorNames(board.ids);
  clearHighlights();
  state.showAnswer = false;
  const xWarning = checkXs();
  if (xWarning) { renderBoard(); return setStatus(xWarning, true); }
  const step = nextLogicalStep(board.regions, state.marks, id => names[id]);

  if (step.done) {
    renderBoard();
    return setStatus('Every cat is placed. Board solved! 😼');
  }
  if (step.broken) {
    renderBoard();
    return setStatus(`Something doesn't add up: ${step.broken} Check the colors and your X's.`, true);
  }
  if (step.stuck) {
    // No clean logic left: fall back to a cat straight from the answer.
    if (!computeSolution()) return;
    const r = state.solution.findIndex((c, row) => state.marks[row][c] !== CAT);
    applyMarks([[r, state.solution[r]]], CAT);
    renderBoard();
    return setStatus("I couldn't find a clean logical move here, so this cat comes straight from the answer.");
  }

  applyMarks(step.xs, X);
  applyMarks(step.cats, CAT);
  for (const [r, c] of step.focus) state.focus.add(key(r, c));
  renderBoard();
  setStatus(step.text);
}

function resetHints() {
  for (const k of state.hintKeys) {
    const [r, c] = k.split(',').map(Number);
    state.marks[r][c] = OPEN;
  }
  state.hintKeys.clear();
  resetAnswer();
  renderBoard();
  setStatus('');
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
    state.marks = emptyMarks(result.n);
    for (const [r, c] of result.xs) state.marks[r][c] = X;
    for (const [r, c] of result.cats) state.marks[r][c] = CAT;
    state.hintKeys.clear();
    resetAnswer();
    sizeEl.value = result.n;
    const xWarning = checkXs();
    render();
    if (xWarning) return setStatus(xWarning, true);
    const found = [];
    if (result.cats.length) found.push(`${result.cats.length} cat${result.cats.length > 1 ? 's' : ''}`);
    if (result.xs.length) found.push(`${result.xs.length} X${result.xs.length > 1 ? "'s" : ''}`);
    const cats = found.length ? ` with ${found.join(' and ')} already placed` : '';
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
$('hide').onclick = resetHints;
$('file').onchange = e => { if (e.target.files[0]) loadScreenshot(e.target.files[0]); e.target.value = ''; };

newBoard(9);
