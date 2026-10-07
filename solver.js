// Meowdoku solver: place one cat per row, column and color region,
// with no two cats touching (diagonals included).
// grid: n x n array of region ids (0..n-1). Returns up to `limit` solutions,
// each an array where solution[row] = column of that row's cat.
function solveMeowdoku(grid, limit = 2) {
  const n = grid.length;
  const solutions = [];
  const cols = new Array(n);

  // Cells per region, so we can bail out early when a region has no room left.
  const regionCells = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) (regionCells[grid[r][c]] ||= []).push([r, c]);

  function regionStillPossible(row, usedCols, usedRegs) {
    // Every unused region must still have a free cell at or below `row`.
    for (let reg = 0; reg < regionCells.length; reg++) {
      if (!regionCells[reg] || usedRegs & (1 << reg)) continue;
      let ok = false;
      for (const [r, c] of regionCells[reg]) {
        if (r >= row && !(usedCols & (1 << c))) { ok = true; break; }
      }
      if (!ok) return false;
    }
    return true;
  }

  function place(row, usedCols, usedRegs) {
    if (solutions.length >= limit) return;
    if (row === n) { solutions.push(cols.slice()); return; }
    if (!regionStillPossible(row, usedCols, usedRegs)) return;
    for (let c = 0; c < n; c++) {
      if (usedCols & (1 << c)) continue;
      const reg = grid[row][c];
      if (usedRegs & (1 << reg)) continue;
      if (row > 0 && Math.abs(cols[row - 1] - c) <= 1) continue;
      cols[row] = c;
      place(row + 1, usedCols | (1 << c), usedRegs | (1 << reg));
    }
  }

  place(0, 0, 0);
  return solutions;
}

if (typeof module !== 'undefined') module.exports = { solveMeowdoku };
