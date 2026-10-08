// Human-style Meowdoku solving: finds the easiest next move and explains it.
// regions: n x n region ids. marks: n x n of OPEN, CAT or X.
// regionName(id) gives a color's name for the explanations.
// Returns one of:
//   { cats, xs, focus, text }  a move: cells to put cats/X's on, cells the reasoning is about
//   { done: true }             every cat is placed
//   { broken: text }           the marks contradict the rules
//   { stuck: true }            no logical move found
const OPEN = 0, CAT = 1, X = 2;

function nextLogicalStep(regions, marks, regionName) {
  const n = regions.length;
  const cells = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells.push([r, c]);

  // Every row, column and color is a group that needs exactly one cat.
  const groups = [];
  for (let i = 0; i < n; i++) groups.push({ type: 'row', id: i, label: `row ${i + 1}`, cells: cells.filter(([r]) => r === i) });
  for (let i = 0; i < n; i++) groups.push({ type: 'col', id: i, label: `column ${i + 1}`, cells: cells.filter(([, c]) => c === i) });
  for (let i = 0; i < n; i++) groups.push({ type: 'region', id: i, label: regionName(i), cells: cells.filter(([r, c]) => regions[r][c] === i) });
  const groupOf = (type, [r, c]) => type === 'row' ? r : type === 'col' ? c : regions[r][c];

  // Cells a cat at [r, c] rules out: same row, column, color, or touching.
  const blockedBy = ([r, c]) => cells.filter(([r2, c2]) => (r2 !== r || c2 !== c) &&
    (r2 === r || c2 === c || regions[r2][c2] === regions[r][c] || (Math.abs(r2 - r) <= 1 && Math.abs(c2 - c) <= 1)));

  function analyze(m) {
    const open = cell => m[cell[0]][cell[1]] === OPEN;
    const info = groups.map(g => ({
      ...g,
      cats: g.cells.filter(([r, c]) => m[r][c] === CAT),
      open: g.cells.filter(open),
    }));
    for (const g of info) {
      if (g.cats.length > 1) return { broken: `${cap(g.label)} has two cats.` };
      if (!g.cats.length && !g.open.length) return { broken: `${cap(g.label)} has no spot left for a cat.` };
    }
    const catCells = cells.filter(([r, c]) => m[r][c] === CAT);
    for (const a of catCells)
      for (const b of catCells)
        if (a !== b && Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1)
          return { broken: 'Two cats are touching.' };
    return { isOpen: open, openCells: cells.filter(open), catCells, needy: info.filter(g => !g.cats.length) };
  }

  // Easy moves only: clear around cats, and fill groups with one spot left.
  function easyMove(m) {
    const a = analyze(m);
    if (a.broken) return a;
    for (const cat of a.catCells) {
      const xs = blockedBy(cat).filter(a.isOpen);
      if (xs.length) return {
        xs, focus: [cat],
        text: `The cat in row ${cat[0] + 1}, column ${cat[1] + 1} rules out its row, column, color and every square touching it.`,
      };
    }
    // Colors first: that's where people usually spot a lone square.
    for (const g of [...a.needy].sort((p, q) => (p.type === 'region' ? 0 : 1) - (q.type === 'region' ? 0 : 1))) {
      if (g.open.length === 1) {
        const cat = g.open[0];
        return {
          cats: [cat], xs: blockedBy(cat).filter(a.isOpen), focus: g.cells,
          text: `Only one spot left for ${g.label}. Cat goes there, and that rules out everything around it.`,
        };
      }
    }
    return null;
  }

  const start = analyze(marks);
  if (start.broken) return start;
  if (!start.needy.length) return { done: true };

  const easy = easyMove(marks);
  if (easy) return easy;

  const { needy, openCells: open } = start;
  const typeWord = { row: 'row', col: 'column', region: 'color' };
  const plural = (type, k) => typeWord[type] + (k > 1 ? 's' : '');
  const list = labels => labels.length < 3 ? labels.join(' and ') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

  // Squeezes: k groups whose open squares all sit inside k groups of another
  // kind. Those k cats must fill the second set, so nothing else can go there.
  function squeeze(k) {
    for (const srcType of ['region', 'row', 'col']) {
      const sources = needy.filter(g => g.type === srcType);
      for (const tgtType of ['row', 'col', 'region']) {
        if (tgtType === srcType) continue;
        for (const combo of combinations(sources, k)) {
          const targets = new Set(combo.flatMap(g => g.open.map(cell => groupOf(tgtType, cell))));
          if (targets.size !== k) continue;
          const srcIds = new Set(combo.map(g => g.id));
          const xs = open.filter(cell => targets.has(groupOf(tgtType, cell)) && !srcIds.has(groupOf(srcType, cell)));
          if (!xs.length) continue;
          const tgtLabels = [...targets].sort((a, b) => a - b)
            .map(id => groups.find(g => g.type === tgtType && g.id === id).label);
          const srcLabels = list(combo.map(g => g.label)), tgtList = list(tgtLabels);
          let text;
          if (srcType === 'region' && k === 1)
            text = `${cap(srcLabels)} only fits in ${tgtList}, so nothing else can go in ${tgtList}.`;
          else if (srcType === 'region')
            text = `${cap(srcLabels)} all fit inside just ${k} ${plural(tgtType, k)}: ${tgtList}. They'll fill those ${plural(tgtType, k)}, so nothing else can go there.`;
          else if (k === 1)
            text = `Every open square in ${srcLabels} is ${tgtList}, so ${tgtList}'s cat has to be in ${srcLabels}. The rest of ${tgtList} is out.`;
          else
            text = `${cap(srcLabels)} only have open squares in ${tgtList}. Their cats will use up ${tgtList}, so the rest of those ${plural(tgtType, k)} is out.`;
          return { xs, focus: combo.flatMap(g => g.open), text };
        }
      }
    }
    return null;
  }

  const one = squeeze(1);
  if (one) return one;

  // Touch check: a cat here would wipe out every open square some group has left.
  for (const cell of open) {
    const blocked = new Set(blockedBy(cell).map(([r, c]) => key2(r, c)));
    for (const g of needy) {
      if (g.open.some(([r, c]) => r === cell[0] && c === cell[1])) continue;
      if (g.open.every(([r, c]) => blocked.has(key2(r, c)))) {
        return { xs: [cell], focus: g.open, text: `A cat on the new X would block every spot left for ${g.label}, so that square is out.` };
      }
    }
  }

  for (let k = 2; k <= Math.floor(n / 2); k++) {
    const move = squeeze(k);
    if (move) return move;
  }

  // Last resort: try a cat, follow the easy moves, and see if it falls apart.
  for (const cell of open) {
    let m = marks.map(row => row.slice());
    m[cell[0]][cell[1]] = CAT;
    for (let guard = 0; guard < n * n; guard++) {
      const move = easyMove(m);
      if (!move) break;
      if (move.broken) {
        return { xs: [cell], focus: [cell], text: `If a cat went on the new X and you follow it through, ${lower(move.broken)} So that square is out.` };
      }
      for (const [r, c] of move.cats || []) m[r][c] = CAT;
      for (const [r, c] of move.xs || []) m[r][c] = X;
    }
  }

  return { stuck: true };
}

function key2(r, c) { return r * 100 + c; }
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function lower(s) { return s[0].toLowerCase() + s.slice(1); }

function* combinations(arr, k, start = 0, picked = []) {
  if (picked.length === k) { yield picked.slice(); return; }
  for (let i = start; i < arr.length; i++) {
    picked.push(arr[i]);
    yield* combinations(arr, k, i + 1, picked);
    picked.pop();
  }
}

if (typeof module !== 'undefined') module.exports = { nextLogicalStep, OPEN, CAT, X };
