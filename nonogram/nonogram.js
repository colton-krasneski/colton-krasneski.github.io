/* ===========================================================================
   Nonogram engine — clue building, a line solver, and a generator.

   The whole point of the solver is the generator: a random picture almost
   never makes a *good* puzzle, because its clues usually describe several
   different pictures. A puzzle is only worth playing if it has exactly one
   solution AND that solution can be reached by pure logic, one line at a
   time, with no guessing. So the generator draws a random picture, asks the
   solver whether the clues pin it down, and if they don't it nudges the
   picture and asks again — until the clues are airtight.
   =========================================================================== */

export const UNKNOWN = 0, FILL = 1, BLANK = 2;

/* ------------------------------- clues ---------------------------------- */

/** The run lengths in one line: [1,1,0,1,1,1] -> [2,3] */
export function cluesForLine(cells) {
  const out = [];
  let run = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === FILL) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out;
}

/** Row and column clues for a finished picture. */
export function cluesFor(sol, n) {
  const rows = [], cols = [];
  const line = new Int8Array(n);
  for (let r = 0; r < n; r++) {
    for (let i = 0; i < n; i++) line[i] = sol[r * n + i];
    rows.push(cluesForLine(line));
  }
  for (let c = 0; c < n; c++) {
    for (let i = 0; i < n; i++) line[i] = sol[i * n + c];
    cols.push(cluesForLine(line));
  }
  return { rows, cols };
}

/* ----------------------------- line solver ------------------------------
   Given one line's clue and what is known about it so far, work out every
   cell that is filled in *every* legal arrangement, and every cell that is
   blank in *every* legal arrangement. Those cells are forced; the rest stay
   unknown. Two passes of dynamic programming over (cell, block) pairs:

     feas[j][i]  — blocks j..last still fit in cells i..end
     reach[j][i] — cells 0..i-1 can hold blocks 0..j-1

   A placement is part of a complete arrangement only where both hold, so
   walking the reachable-and-feasible states marks exactly the possibilities.
   ------------------------------------------------------------------------ */

function canPlace(state, i, len, n) {
  if (i + len > n) return false;
  for (let c = i; c < i + len; c++) if (state[c] === BLANK) return false;
  if (i + len < n && state[i + len] === FILL) return false;   // needs a gap after
  return true;
}

/**
 * @returns false if the clue cannot be satisfied at all, otherwise true with
 *          the tightened line written into `out`.
 */
export function solveLine(state, clue, out) {
  const n = state.length, k = clue.length, W = n + 2;
  const feas = new Uint8Array((k + 1) * W);

  // With every block placed, all remaining cells must be blank.
  let tail = 1;
  feas[k * W + n] = 1;
  for (let i = n - 1; i >= 0; i--) {
    if (state[i] === FILL) tail = 0;
    feas[k * W + i] = tail;
  }
  feas[k * W + n + 1] = 1;      // a block ending flush with the wall lands here

  for (let j = k - 1; j >= 0; j--) {
    const len = clue[j];
    feas[j * W + n + 1] = 0;
    for (let i = n; i >= 0; i--) {
      let ok = 0;
      if (i < n && state[i] !== FILL && feas[j * W + i + 1]) ok = 1;
      if (!ok && canPlace(state, i, len, n)) {
        const next = Math.min(i + len + 1, n + 1);
        if (feas[(j + 1) * W + next]) ok = 1;
      }
      feas[j * W + i] = ok;
    }
  }
  if (!feas[0]) return false;

  const reach = new Uint8Array((k + 1) * W);
  const canFill = new Uint8Array(n), canBlank = new Uint8Array(n);
  reach[0] = 1;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= k; j++) {
      if (!reach[j * W + i] || !feas[j * W + i]) continue;
      if (i < n && state[i] !== FILL && feas[j * W + i + 1]) {
        canBlank[i] = 1;
        reach[j * W + i + 1] = 1;
      }
      if (j < k) {
        const len = clue[j];
        if (canPlace(state, i, len, n)) {
          const next = Math.min(i + len + 1, n + 1);
          if (feas[(j + 1) * W + next]) {
            for (let c = i; c < i + len; c++) canFill[c] = 1;
            if (i + len < n) canBlank[i + len] = 1;
            if (next <= n) reach[(j + 1) * W + next] = 1;
          }
        }
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const f = canFill[i], b = canBlank[i];
    if (!f && !b) return false;
    out[i] = (f && b) ? UNKNOWN : (f ? FILL : BLANK);
  }
  return true;
}

/* ---------------------------- whole-grid solve --------------------------- */

/**
 * Sweep rows and columns until nothing more can be deduced.
 * `solved` means the clues force the entire picture with no guessing — which
 * also means the puzzle has exactly one solution.
 */
export function lineSolve(n, rows, cols, start) {
  const g = start ? Int8Array.from(start) : new Int8Array(n * n);
  const line = new Int8Array(n), out = new Int8Array(n);
  let changed = true, ok = true;

  while (changed && ok) {
    changed = false;
    for (let r = 0; r < n; r++) {
      for (let i = 0; i < n; i++) line[i] = g[r * n + i];
      if (!solveLine(line, rows[r], out)) { ok = false; break; }
      for (let i = 0; i < n; i++) {
        if (out[i] !== line[i]) { g[r * n + i] = out[i]; changed = true; }
      }
    }
    if (!ok) break;
    for (let c = 0; c < n; c++) {
      for (let i = 0; i < n; i++) line[i] = g[i * n + c];
      if (!solveLine(line, cols[c], out)) { ok = false; break; }
      for (let i = 0; i < n; i++) {
        if (out[i] !== line[i]) { g[i * n + c] = out[i]; changed = true; }
      }
    }
  }

  let solved = ok;
  if (ok) for (let i = 0; i < n * n; i++) if (g[i] === UNKNOWN) { solved = false; break; }
  return { ok, solved, grid: g };
}

/* ------------------------------- randomness ------------------------------ */

/** Small seeded PRNG so a puzzle code always rebuilds the same puzzle. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A random picture. Pure noise makes ugly, hard puzzles, so for anything
 * bigger than 5x5 we run a smoothing pass: each cell takes the majority of
 * its neighbours. That clumps the noise into blobs, which read as longer
 * runs and give the solver something to bite on.
 */
export function makePicture(n, fill, smooth, rnd) {
  let g = new Int8Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = rnd() < fill ? FILL : BLANK;
  for (let pass = 0; pass < smooth; pass++) {
    const next = new Int8Array(n * n);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        let on = 0, total = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
            total++;
            if (g[rr * n + cc] === FILL) on++;
          }
        }
        next[r * n + c] = on * 2 > total ? FILL : BLANK;
      }
    }
    g = next;
  }
  return g;
}

function filledCount(g) {
  let n = 0;
  for (let i = 0; i < g.length; i++) if (g[i] === FILL) n++;
  return n;
}

/* ------------------------------- generator ------------------------------- */

/**
 * Returns a stepper so a big grid can be built across several frames instead
 * of freezing the page. Call step(ms) until it hands back `done`.
 */
export function generator(n, fill, smooth, seed) {
  const rnd = rng(seed);
  const cells = n * n;
  const lo = Math.round(cells * 0.2), hi = Math.round(cells * 0.8);
  let sol = makePicture(n, fill, smooth, rnd);
  let tries = 0;

  function nudge(stuck) {
    // Flip cells the solver could not pin down: those are exactly the ones
    // whose clues are ambiguous, so changing them is what breaks the tie.
    const loose = [];
    for (let i = 0; i < cells; i++) if (stuck[i] === UNKNOWN) loose.push(i);
    const pool = loose.length ? loose : null;
    const flips = 1 + Math.floor(rnd() * 3);
    for (let f = 0; f < flips; f++) {
      const i = pool ? pool[Math.floor(rnd() * pool.length)] : Math.floor(rnd() * cells);
      sol[i] = sol[i] === FILL ? BLANK : FILL;
    }
  }

  return {
    get tries() { return tries; },
    step(budgetMs) {
      const started = Date.now();
      do {
        const count = filledCount(sol);
        if (count >= lo && count <= hi) {
          const { rows, cols } = cluesFor(sol, n);
          const res = lineSolve(n, rows, cols);
          if (res.solved) return { done: true, sol, rows, cols, tries };
          tries++;
          nudge(res.grid);
        } else {
          tries++;
          sol = makePicture(n, fill, smooth, rnd);
        }
        // A picture that keeps resisting is a bad starting point; begin again.
        if (tries % 80 === 0) sol = makePicture(n, fill, smooth, rnd);
      } while (Date.now() - started < budgetMs);
      return { done: false, tries };
    }
  };
}
