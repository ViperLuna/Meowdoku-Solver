// Reads a Meowdoku board out of a screenshot.
// Input: ImageData-like { data, width, height }.
// Output: { n, grid, colors } where grid[r][c] is a region id and colors[id] is a hex string,
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
    rowProfile.push(count > w * 0.45);
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
    colProfile.push(count > span * 0.45);
  }
  let colRuns = bestChain(runsOf(colProfile).filter(r => r.len >= 6));
  if (colRuns.length !== n) {
    // Fall back to slicing the board's width evenly.
    const on = colProfile.map((v, i) => v ? i : -1).filter(i => i >= 0);
    if (!on.length) throw new Error("Couldn't find the board's columns.");
    const x0 = on[0], x1 = on[on.length - 1], cw = (x1 - x0 + 1) / n;
    colRuns = Array.from({ length: n }, (_, i) => ({ start: Math.round(x0 + i * cw), len: Math.round(cw) }));
  }

  // Sample the middle of each cell, ignoring cat/X marks drawn on top.
  const samples = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cy = rowRuns[r].start + rowRuns[r].len / 2, cx = colRuns[c].start + colRuns[c].len / 2;
      const ry = Math.max(1, Math.floor(rowRuns[r].len * 0.3)), rx = Math.max(1, Math.floor(colRuns[c].len * 0.3));
      let sum = [0, 0, 0], k = 0, all = [0, 0, 0], ka = 0;
      for (let y = Math.round(cy - ry); y <= cy + ry; y++) {
        for (let x = Math.round(cx - rx); x <= cx + rx; x++) {
          const i = (y * w + x) * 4;
          const px = [data[i], data[i + 1], data[i + 2]];
          all = all.map((v, j) => v + px[j]); ka++;
          if (mask[y * w + x]) { sum = sum.map((v, j) => v + px[j]); k++; }
        }
      }
      const rgb = k > ka * 0.2 ? sum.map(v => v / k) : all.map(v => v / ka);
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
    // A big final merge means two genuinely different colors got lumped together.
    suspicious: lastMerge > 12,
  };
}

if (typeof module !== 'undefined') module.exports = { readBoard };
