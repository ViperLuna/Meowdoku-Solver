// Reads a Meowdoku board out of a screenshot.
// Input: ImageData-like { data, width, height }.
// Output: { n, grid, colors, cats } where grid[r][c] is a region id and colors[id] is a hex string
// and cats / xs list [row, col] of cats and X marks already placed,
// or throws an Error with a human-readable message.

function isCellPixel(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max > 70 && (max - min) / max > 0.18;
}

// Turn a boolean profile into runs of consecutive "on" indices.
function runsOf(profile) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= profile.length; i++) {
    const on = i < profile.length && profile[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) { runs.push({ start, end: i - 1, len: i - start }); start = -1; }
  }
  return runs;
}

// The board is the longest chain of evenly sized runs separated by thin gaps.
function bestChain(runs) {
  let best = [];
  for (let i = 0; i < runs.length; i++) {
    const chain = [runs[i]];
    for (let j = i + 1; j < runs.length; j++) {
      const prev = chain[chain.length - 1], cur = runs[j];
      const gap = cur.start - prev.end - 1;
      const ratio = cur.len / chain[0].len;
      if (gap > chain[0].len * 0.5 || ratio < 0.7 || ratio > 1.4) break;
      chain.push(cur);
    }
    if (chain.length > best.length) best = chain;
  }
  return best;
}

function rgbToLab([r, g, b]) {
  const lin = v => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function labDist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function readBoard(img) {
  const { data, width: w, height: h } = img;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = isCellPixel(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) ? 1 : 0;

  // Rows: a board row is mostly colored cells across the screen.
  const rowProfile = [];
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (let x = 0; x < w; x++) count += mask[y * w + x];
    // Low bar: X marks and cats eat into a row's color.
    rowProfile.push(count > w * 0.25);
  }
  const rowRuns = bestChain(runsOf(rowProfile).filter(r => r.len >= 6));
  const n = rowRuns.length;
  if (n < 4) throw new Error("Couldn't find the board in that screenshot.");

  // Columns: look only inside the board's vertical span.
  const y0 = rowRuns[0].start, y1 = rowRuns[n - 1].end, span = y1 - y0 + 1;
  const colProfile = [];
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = y0; y <= y1; y++) count += mask[y * w + x];
    colProfile.push(count > span * 0.25);
  }
  let colRuns = bestChain(runsOf(colProfile).filter(r => r.len >= 6));
  if (colRuns.length !== n) {
    // Fall back to slicing the board's width evenly.
    const on = colProfile.map((v, i) => v ? i : -1).filter(i => i >= 0);
    if (!on.length) throw new Error("Couldn't find the board's columns.");
    const x0 = on[0], x1 = on[on.length - 1], cw = (x1 - x0 + 1) / n;
    colRuns = Array.from({ length: n }, (_, i) => ({ start: Math.round(x0 + i * cw), len: Math.round(cw) }));
  }

  // Sample each cell. Placed cats cover the middle, so read the color from
  // the colored pixels across the whole cell (median ignores cat/X marks).
  const samples = [], cats = [], xs = [];
  // The game's red X (a wrong guess) is bright orange-red.
  const isRedX = (R, G, B) => R > 200 && G < 130 && B < 100;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const top = rowRuns[r].start, left = colRuns[c].start;
      const ch = rowRuns[r].len, cw = colRuns[c].len;
      const colored = [[], [], []];
      let dark = 0, light = 0, red = 0, center = 0;
      for (let y = Math.round(top + ch * 0.08); y < top + ch * 0.92; y++) {
        for (let x = Math.round(left + cw * 0.08); x < left + cw * 0.92; x++) {
          const i = (y * w + x) * 4;
          const R = data[i], G = data[i + 1], B = data[i + 2];
          if (mask[y * w + x]) { colored[0].push(R); colored[1].push(G); colored[2].push(B); }
          const inCenter = Math.abs(y - (top + ch / 2)) < ch * 0.25 && Math.abs(x - (left + cw / 2)) < cw * 0.25;
          if (inCenter) {
            center++;
            const max = Math.max(R, G, B), min = Math.min(R, G, B);
            if (max < 70) dark++;
            else if (min > 200 && max - min < 30) light++;
            if (isRedX(R, G, B)) red++;
          }
        }
      }
      if (!colored[0].length) throw new Error(`Couldn't read the color of row ${r + 1}, column ${c + 1}.`);
      const median = arr => { arr.sort((a, b) => a - b); return arr[arr.length >> 1]; };
      const rgb = colored.map(median);
      // Cat heads are black and white fur; white X marks have no black.
      if (dark > center * 0.08 && dark + light > center * 0.3) cats.push([r, c]);
      else if (light > center * 0.3 && dark < center * 0.02) xs.push([r, c]);
      else if (red > center * 0.1 && !isRedX(...rgb)) xs.push([r, c]);
      samples.push({ r, c, rgb, lab: rgbToLab(rgb) });
    }
  }

  // Group cells into exactly n colors, merging the closest groups first.
  let groups = samples.map(s => ({ members: [s], rgb: s.rgb, lab: s.lab }));
  let lastMerge = 0;
  while (groups.length > n) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const d = labDist(groups[i].lab, groups[j].lab);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    const a = groups[bi], b = groups[bj];
    const members = a.members.concat(b.members);
    const rgb = [0, 1, 2].map(j => members.reduce((s, m) => s + m.rgb[j], 0) / members.length);
    groups.splice(bj, 1);
    groups[bi] = { members, rgb, lab: rgbToLab(rgb) };
    lastMerge = bd;
  }

  const grid = Array.from({ length: n }, () => new Array(n).fill(0));
  groups.forEach((g, id) => g.members.forEach(m => { grid[m.r][m.c] = id; }));
  return {
    n,
    grid,
    colors: groups.map(g => toHex(g.rgb)),
    cats,
    xs,
    // A big final merge means two genuinely different colors got lumped together.
    suspicious: lastMerge > 12,
  };
}

if (typeof module !== 'undefined') module.exports = { readBoard };
