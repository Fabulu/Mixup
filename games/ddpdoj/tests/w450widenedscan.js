// WAVE 450 (D69) -- THE SCAN THAT CAN SEE A PRIVATE COPY.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
// ---------------------------------------------------------------------------
// W444 built an index of "ROM addresses claimed by a port", and W446, W447,
// W448 and W449 all steered by it.  Every duplicate it named was a real defect:
//
//   W446 $25FFA8  the live copy omitted a store and carried an invented guard;
//                 the background froze with a player still alive.
//   W447 $2428A6  one copy read a byte too far; Hibachi's second form refilled
//                 its HP pool instead of dying.
//   W448 $246520  NO copy was correct; the live one read palette RAM out of
//                 ROM, so type $4C's death effect could never run.
//   W449 $246800  the invented condition was in the copy that HAD a caller.
//
// **AND W449 FOUND A FOURTH COPY THE INDEX COULD NOT SEE.**  `animobjects.js`
// reached its own transcription of `$246800` through the module-private name
// `clearChain`: no `export`, no `246800` name suffix, no JSDoc opening address.
// The index was built from
//
//     /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/
//
// so a private `function`, an arrow assigned to a `const`, a class or object
// method, and any copy whose doc names no address were **all** invisible to it.
// W444's own header said so in prose (its "CANNOT" list, points a and b) and
// four waves relied on the number anyway.
//
// **THE NUMBER 19 WAS A FLOOR, NOT A COUNT.**  This file is what replaces it.
//
// ---------------------------------------------------------------------------
// THREE AXES, AND WHY IT TAKES THREE
// ---------------------------------------------------------------------------
// A transcription can announce itself in three ways, and `clearChain` proves
// that catching two of them is not enough:
//
//   NAME   `a3Stop2599EC`          -- the name ends in the six hex digits.
//   DOC    /** `$27F87C` -- ... */ -- the JSDoc opens with the address.
//   BODY   ram.setU16(at, 0);      // $246806
//
// `clearChain` had NO name suffix and NO doc.  Its only address markers were
// trailing body comments, so **widening the head forms alone would still have
// missed it** -- measured against the pre-W449 tree, not assumed.  The BODY
// axis is the one that names it.
//
// ---------------------------------------------------------------------------
// THE TRAPS, AND WHAT THIS SCAN DOES ABOUT EACH
// ---------------------------------------------------------------------------
// 1. A DOC HEADER CAN NAME THE WRONG ADDRESS.  W447 found a header saying
//    `$246710` for a function that is `$246704`.  A scan cannot read English,
//    so it cannot fix this -- it can only surface the pair.  The register is
//    where the classification is written down.
//
// 2. WHICH END OF A SPAN.  The shipped regex was
//
//        /`?\$([0-9A-Fa-f]{6})`/
//
//    with a REQUIRED trailing backtick.  It therefore took the LAST address of
//    every opening span and silently missed the first:
//
//        `$249EA0..$249EE2`      a RANGE      -> it took $249EE2
//        `$27E912 -> $27F6E4`    a DISPATCH   -> it took $27F6E4
//        `$240F62[0] = $28D520`  a TABLE SLOT -> it took $28D520
//
//    W447 named the range case as a mis-attribution.  **Picking the other end
//    just moves the blind spot** -- $249EA0 and $27E912 and $240F62 are real
//    claims too, and two of those three turn out to be duplicated.  So this
//    scan takes EVERY address in the opening span.  Over-claiming costs one
//    line in the register; under-claiming is what hid `clearChain` for 108
//    waves.  **The doc axis here is a strict superset of the shipped one.**
//
// 3. TWO HEADS CAN SHARE ONE BODY.  `$246528 bra.s $246532` (W448) means two
//    entry points into one routine, and `$242EC2`'s two names are one body with
//    two faces.  **That is not a duplicate** -- but no scan can tell it from
//    one, so both land in the register and the register says which is which.
//
// 4. A CALL IS NOT A TRANSCRIPTION.  A trailing marker like
//
//        enqueueRegisters(ram, 25, ...);   // $28566C jsr $23FAC4
//
//    transcribes `$28566C`; `$23FAC4` is the call TARGET.  Counting both makes
//    every pair of bodies that call the same routine look like a duplicate --
//    measured, that alone took the body-pair register from 39 to 112.  So a
//    body marker is the FIRST address of a TRAILING `//` comment, and nothing
//    else.  Leading comments are prose about the code, not markers in it.
//
// 5. ONE SHARED ADDRESS IS A COINCIDENCE.  Two bodies that both call `$23FA96`
//    both cite it.  Two bodies TRANSCRIBING one routine cite a RUN of its
//    instructions.  The body register is therefore built from PAIRS sharing two
//    or more markers, never from a single shared address.
//
// ---------------------------------------------------------------------------
// WHAT THIS STILL CANNOT DO -- stated plainly, the way W444 stated its holes
// ---------------------------------------------------------------------------
//   a. A copy with NO name suffix, NO doc address AND NO body markers is still
//      invisible.  Nothing in the file would name a ROM address at all.
//   b. It cannot read English, so a wrong doc header stays wrong (trap 1).
//   c. Body extents come from brace counting over a hand-rolled tokeniser, not
//      a real parser.  It is exact on this tree -- SECTION 1 of the guard
//      asserts the head count and the body-extent sanity -- but a file using
//      syntax the tokeniser does not model could mis-scope its markers.
//   d. It says two bodies transcribe one routine.  It does NOT say they
//      DISAGREE.  Four waves of evidence say to go and look.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BS = String.fromCharCode(92);

export const inRom = (a) => a >= 0x230000 && a < 0x2b0000;
export const hex = (a) => '$' + a.toString(16).toUpperCase();

/** Every `.js` under `src/`, recursively, as `[relative path, text]`. */
export function sources(root) {
  const SRC = root ?? join(dirname(fileURLToPath(import.meta.url)), '../src');
  const out = [];
  (function walk(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) walk(join(dir, e.name), rel + e.name + '/');
      else if (e.name.endsWith('.js')) out.push([rel + e.name, readFileSync(join(dir, e.name), 'utf8')]);
    }
  })(SRC, '');
  return out;
}

// ---------------------------------------------------------------------------
// THE HEAD FORMS.  The shipped scan had ONE of these; this has six.
// ---------------------------------------------------------------------------
const FORMS = Object.freeze([
  ['fn', /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/],
  ['arrow', /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/],
  ['arrow1', /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/],
  ['fnexpr', /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/],
  ['method', /^\s+(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?\s*([A-Za-z_$][\w$]*)\s*\([^;=]*\)\s*\{\s*$/],
  ['prop', /^\s+([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:\(|function\b)/],
]);

// `if (...) {` and `for (...) {` match the `method` shape exactly.
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof',
  'function', 'do', 'else', 'case', 'with', 'new', 'delete', 'void']);

/**
 * Tokenise past strings, template literals, regexes and comments so that brace
 * counting is sound, then return every function-like head with a REAL body
 * extent and the comments of the file with their line numbers.
 *
 * The extent matters: attributing body markers to "the nearest head above"
 * instead put a small helper's name on everything that followed it, which
 * measured 1141 multiply-cited addresses where the true figure is 226.
 */
export function scanFile(text) {
  const lines = text.split(/\r?\n/);
  const N = text.length;
  const lineOf = new Int32Array(N + 1);
  { let ln = 0; for (let i = 0; i < N; i++) { lineOf[i] = ln; if (text[i] === '\n') ln += 1; } lineOf[N] = ln; }
  const isCode = new Uint8Array(N);
  const comments = [];
  let i = 0;
  let prevSig = '';
  while (i < N) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') {
      const e = text.indexOf('\n', i);
      const end = e < 0 ? N : e;
      comments.push({ line: lineOf[i], col: i, text: text.slice(i + 2, end), trailing: /\S/.test(text.slice(text.lastIndexOf('\n', i) + 1, i)) });
      i = end;
      continue;
    }
    if (c === '/' && d === '*') {
      const e = text.indexOf('*/', i + 2);
      const end = e < 0 ? N : e + 2;
      comments.push({ line: lineOf[i], col: i, text: text.slice(i + 2, end - 2), trailing: false });
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i += 1;
      while (i < N) {
        if (text[i] === BS) { i += 2; continue; }
        if (text[i] === q) { i += 1; break; }
        if (q === '`' && text[i] === '$' && text[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < N && depth > 0) { if (text[i] === '{') depth += 1; else if (text[i] === '}') depth -= 1; i += 1; }
          continue;
        }
        i += 1;
      }
      prevSig = q;
      continue;
    }
    if (c === '/' && /[=(,:[!&|?{};+\-*%~^<>]/.test(prevSig)) {
      let j = i + 1;
      let inClass = false;
      let ok = false;
      while (j < N) {
        const ch = text[j];
        if (ch === BS) { j += 2; continue; }
        if (ch === '\n') break;
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { ok = true; break; }
        j += 1;
      }
      if (ok) { i = j + 1; while (i < N && /[a-z]/.test(text[i])) i += 1; prevSig = '/'; continue; }
    }
    if (!/\s/.test(c)) prevSig = c;
    isCode[i] = 1;
    i += 1;
  }

  const lineStart = [];
  { let p = 0; for (const L of lines) { lineStart.push(p); p += L.length + 1; } }

  const heads = [];
  lines.forEach((L, li) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(L)) return;
    for (const [kind, re] of FORMS) {
      const m = L.match(re);
      if (m && !KEYWORDS.has(m[1])) {
        heads.push({ kind, name: m[1], line: li, exported: /^\s*export\b/.test(L) });
        break;
      }
    }
  });

  for (const h of heads) {
    let p = lineStart[h.line];
    let depth = 0;
    let started = false;
    for (; p < N; p += 1) {
      if (!isCode[p]) continue;
      const ch = text[p];
      if (ch === '{') { depth += 1; started = true; }
      else if (ch === '}') { depth -= 1; if (started && depth <= 0) { p += 1; break; } }
      else if (!started && ch === ';') break;          // `const f = (x) => expr;`
    }
    h.endLine = lineOf[Math.min(p, N)];
    let j = h.line - 1;
    const doc = [];
    while (j >= 0 && /^\s*(\*|\/\*\*)/.test(lines[j])) {
      doc.unshift(lines[j]);
      if (/^\s*\/\*\*/.test(lines[j])) break;
      j -= 1;
    }
    h.doc = doc.join('\n');
  }
  return { lines, heads, comments };
}

/**
 * THE OPENING SPAN, NOT ONE END OF IT.  See trap 2 in the header: the shipped
 * regex required a trailing backtick and so took the LAST address of every
 * `$A..$B`, `$A -> $B` and `$T[i] = $B` opening.  Take them all.
 */
export function docAddresses(doc) {
  if (!doc) return [];
  const span = doc.match(/`([^`]*\$[0-9A-Fa-f]{6}[^`]*)`/);
  const scope = span ? span[1] : doc;
  const out = [];
  for (const m of scope.matchAll(/\$([0-9A-Fa-f]{6})\b/g)) out.push(parseInt(m[1], 16));
  return span ? out : out.slice(0, 1);
}

/**
 * THE HEAD INDEX: ROM address -> Set("file:line name") for every function-like
 * head that CLAIMS the address, by name suffix or by its JSDoc opening span.
 */
export function headIndex(root) {
  const idx = new Map();
  const meta = new Map();
  for (const [file, text] of sources(root)) {
    const { heads } = scanFile(text);
    for (const h of heads) {
      const key = `${file}:${h.line + 1} ${h.name}`;
      meta.set(key, h);
      const claim = (a, how) => {
        if (!inRom(a)) return;
        if (!idx.has(a)) idx.set(a, new Map());
        const m = idx.get(a);
        m.set(key, (m.get(key) ?? '') + how);
      };
      const suffix = h.name.match(/([0-9a-fA-F]{6})$/);
      if (suffix) claim(parseInt(suffix[1], 16), 'N');
      for (const a of docAddresses(h.doc)) claim(a, 'D');
    }
  }
  return { idx, meta };
}

/**
 * THE BODY INDEX: ROM address -> Set(body key) for every TRAILING `//` marker.
 * The marker is the FIRST address of the comment (trap 4), attributed to the
 * INNERMOST head whose brace extent contains the line.
 */
export function bodyIndex(root) {
  const idx = new Map();
  for (const [file, text] of sources(root)) {
    const { heads, comments } = scanFile(text);
    for (const c of comments) {
      if (!c.trailing) continue;
      const m = c.text.match(/\$([0-9A-Fa-f]{6})\b/);
      if (!m) continue;
      const a = parseInt(m[1], 16);
      if (!inRom(a)) continue;
      let owner = null;
      for (const h of heads) {
        if (h.line < c.line && c.line <= h.endLine && (!owner || h.line > owner.line)) owner = h;
      }
      if (!owner) continue;
      // NO LINE NUMBER IN THE KEY.  The register is frozen in a test file, and a
      // key carrying a line number would redden it on any edit ANYWHERE above the
      // function -- a guard that cries wolf gets weakened, which is how the last
      // one came to be trusted past its own documented holes.
      const key = `${file} ${owner.name}`;
      if (!idx.has(a)) idx.set(a, new Set());
      idx.get(a).add(key);
    }
  }
  return idx;
}

/**
 * Pairs of DISTINCT bodies that share `min` or more transcription markers --
 * two ports of one routine, rather than two callers of it (trap 5).
 * Returns `["A<>B", [addr, ...]]` sorted, with A < B.
 */
export function bodyPairs(root, min = 2) {
  const idx = root instanceof Map ? root : bodyIndex(root);
  const pairs = new Map();
  for (const [a, keys] of idx) {
    if (keys.size < 2 || keys.size > 10) continue;      // a 10-way cite is a table, not a port
    const arr = [...keys].sort();
    for (let x = 0; x < arr.length; x += 1) {
      for (let y = x + 1; y < arr.length; y += 1) {
        const p = `${arr[x]} <> ${arr[y]}`;
        if (!pairs.has(p)) pairs.set(p, []);
        pairs.get(p).push(a);
      }
    }
  }
  return [...pairs]
    .filter(([, v]) => v.length >= min)
    .map(([p, v]) => [p, v.sort((a, b) => a - b)])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** The addresses claimed by two or more heads -- the widened register. */
export function headRegister(root) {
  const { idx } = headIndex(root);
  return [...idx].filter(([, v]) => v.size > 1).map(([a]) => a).sort((a, b) => a - b);
}

/**
 * THE SHIPPED SCAN, VERBATIM, kept so the guard can prove the widening is a
 * widening and say by how much.  Do not "improve" this -- it is a fixture.
 */
export function narrowIndex(root) {
  const ported = new Map();
  for (const [file, text] of sources(root)) {
    const lines = text.split(/\r?\n/);
    lines.forEach((L, i) => {
      const fn = L.match(/^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (!fn) return;
      const claim = (a) => {
        if (!inRom(a)) return;
        if (!ported.has(a)) ported.set(a, new Set());
        ported.get(a).add(`${file}:${i + 1} ${fn[1]}`);
      };
      const suffix = fn[1].match(/([0-9a-fA-F]{6})$/);
      if (suffix) claim(parseInt(suffix[1], 16));
      let j = i - 1;
      const doc = [];
      while (j >= 0 && /^\s*(\*|\/\*\*)/.test(lines[j])) {
        doc.unshift(lines[j]);
        if (/^\s*\/\*\*/.test(lines[j])) break;
        j -= 1;
      }
      const first = doc.join('\n').match(/`?\$([0-9A-Fa-f]{6})`/);
      if (first) claim(parseInt(first[1], 16));
    });
  }
  return ported;
}
