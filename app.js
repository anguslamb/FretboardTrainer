'use strict';

// --- Tuning & fretboard ---
const STRINGS    = ['F', 'C', 'G', 'D', 'A', 'E']; // top → bottom (high → low), all-4ths
const OPEN_NOTES = [5, 0, 7, 2, 9, 4];              // chromatic index: F=5 C=0 G=7 D=2 A=9 E=4
const FRET_COUNT   = 12;
const FRET_MARKERS = [3, 5, 7, 9]; // single dots; 12 gets a double dot (handled separately)

// --- Music theory ---
const NOTE_NAMES      = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const ACCIDENTALS     = new Set([1, 3, 6, 8, 10]); // notes with both a sharp and flat spelling

// Maps any common note spelling (uppercase) to a chromatic index 0–11
const NOTE_PARSE_MAP = {
  'C': 0, 'B#': 0,
  'C#': 1, 'DB': 1,
  'D': 2,
  'D#': 3, 'EB': 3,
  'E': 4, 'FB': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'GB': 6,
  'G': 7,
  'G#': 8, 'AB': 8,
  'A': 9,
  'A#': 10, 'BB': 10,
  'B': 11, 'CB': 11,
};

const SCALES = [
  // Major modes
  { name: 'Ionian (Major)',        intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Dorian',                intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian',              intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian',                intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian',            intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Aeolian (Minor)',       intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Locrian',               intervals: [0, 1, 3, 5, 6, 8, 10] },
  // Pentatonic
  { name: 'Major Pentatonic',      intervals: [0, 2, 4, 7, 9]        },
  { name: 'Minor Pentatonic',      intervals: [0, 3, 5, 7, 10]       },
  // Melodic / harmonic minor & modes
  { name: 'Melodic Minor',         intervals: [0, 2, 3, 5, 7, 9, 11] },
  { name: 'Harmonic Minor',        intervals: [0, 2, 3, 5, 7, 8, 11] },
  { name: 'Lydian Dominant',       intervals: [0, 2, 4, 6, 7, 9, 10] },
  { name: 'Superlocrian (Altered)',intervals: [0, 1, 3, 4, 6, 8, 10] },
  // Symmetric
  { name: 'Whole Tone',            intervals: [0, 2, 4, 6, 8, 10]       },
  { name: 'Half-Whole Diminished', intervals: [0, 1, 3, 4, 6, 7, 9, 10] },
  { name: 'Whole-Half Diminished', intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
];

const ARPEGGIOS = [
  { name: 'Major',          intervals: [0, 4, 7]      },
  { name: 'Minor',          intervals: [0, 3, 7]      },
  { name: 'Diminished',     intervals: [0, 3, 6]      },
  { name: 'Augmented',      intervals: [0, 4, 8]      },
  { name: 'Major 7th',      intervals: [0, 4, 7, 11]  },
  { name: 'Minor 7th',      intervals: [0, 3, 7, 10]  },
  { name: 'Dominant 7th',   intervals: [0, 4, 7, 10]  },
  { name: 'Min 7b5 (ø)',    intervals: [0, 3, 6, 10]  },
  { name: 'Diminished 7th', intervals: [0, 3, 6, 9]   },
];

// --- App state ---
let appMode   = 'visualiser'; // 'visualiser' | 'note-namer' | 'note-finder'

// Visualiser state
let scaleOrArp = 'scale';
let root       = 0;
let typeIndex  = 0;

// Note Namer state
let currentChallenge = null; // { si, fret, note }
let challengeLocked  = false;
let showCNotes = false;
let minFret   = 0;
let maxFret   = FRET_COUNT;
let minString = 0;             // index into STRINGS (0 = F, highest)
let maxString = STRINGS.length - 1;

// --- SVG helpers ---
const svgNS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function svgText(content, attrs = {}) {
  const t = el('text', attrs);
  t.textContent = content;
  return t;
}

// --- Layout constants ---
const PAD_LEFT       = 50;
const PAD_RIGHT      = 46;
const PAD_TOP        = 70;
const PAD_BOTTOM     = 40;
const STRING_SPACING = 46;
const FRET_OVERHANG  = 12; // fretboard extends this many px beyond the outer strings

// Equal-temperament fret spacing: distance from nut to fret n is
// scaleLength * (1 - 2^(-n/12)). We normalise so fret FRET_COUNT sits at
// the left edge of boardWidth.
const boardWidth  = 1100;
const SCALE_NORM  = 1 - Math.pow(2, -FRET_COUNT / 12); // 0.5 for 12 frets

const boardHeight = (STRINGS.length - 1) * STRING_SPACING;
const totalWidth  = PAD_LEFT + boardWidth + PAD_RIGHT;
const totalHeight = PAD_TOP + boardHeight + PAD_BOTTOM;

// Left-handed: nut (fret 0) on the right.
// fretX(f) = x position of fret wire f.
const fretX = f =>
  PAD_LEFT + boardWidth * (1 - (1 - Math.pow(2, -f / 12)) / SCALE_NORM);

// Centre of the playing space for fret f (between wires f and f-1).
// Fret 0 (open) sits in the PAD_RIGHT area to the right of the nut.
const noteX = f => f === 0
  ? PAD_LEFT + boardWidth + PAD_RIGHT / 2
  : (fretX(f) + fretX(f - 1)) / 2;

const noteY = si => PAD_TOP + si * STRING_SPACING;

// --- Static fretboard ---
function drawFretboard() {
  const svg = document.getElementById('fretboard');
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

  svg.appendChild(el('rect', {
    x: 0, y: 0, width: totalWidth, height: totalHeight, fill: '#1a1a2e',
  }));

  const defs = el('defs');
  const grad = el('linearGradient', { id: 'wood', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(el('stop', { offset: '0%',   'stop-color': 'rgba(255,200,120,0.08)' }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'rgba(0,0,0,0.25)' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  svg.appendChild(el('rect', {
    x: PAD_LEFT, y: PAD_TOP - FRET_OVERHANG,
    width: boardWidth, height: boardHeight + FRET_OVERHANG * 2,
    fill: '#7a4f2e', rx: 2,
  }));
  svg.appendChild(el('rect', {
    x: PAD_LEFT, y: PAD_TOP - FRET_OVERHANG,
    width: boardWidth, height: boardHeight + FRET_OVERHANG * 2,
    fill: 'url(#wood)', rx: 2,
  }));

  // Single-dot position markers
  FRET_MARKERS.forEach(fret => {
    svg.appendChild(el('circle', {
      cx: (fretX(fret) + fretX(fret - 1)) / 2,
      cy: PAD_TOP + boardHeight / 2,
      r: 6, fill: 'rgba(255,255,255,0.18)',
    }));
  });

  // Double dot at fret 12
  const dot12x = (fretX(12) + fretX(11)) / 2;
  [boardHeight / 3, (boardHeight * 2) / 3].forEach(cy => {
    svg.appendChild(el('circle', {
      cx: dot12x, cy: PAD_TOP + cy, r: 6, fill: 'rgba(255,255,255,0.18)',
    }));
  });

  // Fret wires + numbers
  for (let f = 0; f <= FRET_COUNT; f++) {
    const x     = fretX(f);
    const isNut = f === 0;
    svg.appendChild(el('line', {
      x1: x, y1: PAD_TOP - FRET_OVERHANG, x2: x, y2: PAD_TOP + boardHeight + FRET_OVERHANG,
      stroke: isNut ? '#f0ead6' : '#b0b0b0',
      'stroke-width': isNut ? 7 : 2,
      'stroke-linecap': 'round',
    }));
    if (f > 0) {
      svg.appendChild(svgText(String(f), {
        x: (fretX(f) + fretX(f - 1)) / 2,
        y: PAD_TOP + boardHeight + FRET_OVERHANG + 16,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': '12', 'font-family': 'monospace', fill: '#888',
      }));
    }
  }

  svg.appendChild(svgText('Open', {
    x: PAD_LEFT + boardWidth + PAD_RIGHT / 2,
    y: PAD_TOP + boardHeight + FRET_OVERHANG + 16,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-size': '11', 'font-family': 'monospace', fill: '#666',
  }));

  // Strings
  STRINGS.forEach((name, i) => {
    const y = noteY(i);
    svg.appendChild(el('line', {
      x1: PAD_LEFT, y1: y, x2: PAD_LEFT + boardWidth, y2: y,
      stroke: i >= 3 ? '#7a8290' : '#b8c0ca',
      'stroke-width': 1 + i * 0.55,
    }));
    svg.appendChild(svgText(name, {
      x: PAD_LEFT - 14, y,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': '14', 'font-family': 'monospace', 'font-weight': 'bold', fill: '#ddd',
    }));
  });
}

// --- Visualiser note overlay ---
function drawNotes() {
  const old = document.getElementById('notes');
  if (old) old.remove();

  const collection  = scaleOrArp === 'scale' ? SCALES : ARPEGGIOS;
  const { intervals } = collection[typeIndex] ?? collection[0];
  const noteSet     = new Set(intervals.map(i => (root + i) % 12));

  const svg = document.getElementById('fretboard');
  const g   = el('g', { id: 'notes' });

  for (let si = 0; si < STRINGS.length; si++) {
    for (let f = 0; f <= FRET_COUNT; f++) {
      const note = (OPEN_NOTES[si] + f) % 12;
      if (!noteSet.has(note)) continue;

      const isRoot = note === (root % 12);
      const cx     = noteX(f);
      const cy     = noteY(si);

      g.appendChild(el('circle', {
        cx, cy, r: 12,
        fill:           isRoot ? '#e2a95b' : '#4a9eff',
        stroke:         isRoot ? '#8a5010' : '#0a4a90',
        'stroke-width': 1.5,
      }));
      g.appendChild(svgText(NOTE_NAMES[note], {
        x: cx, y: cy,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': '9', 'font-family': 'monospace', 'font-weight': 'bold',
        fill: isRoot ? '#2a1400' : '#001030',
        'pointer-events': 'none',
      }));
    }
  }

  svg.appendChild(g);
}

// --- Note Namer ---
function parseNote(raw) {
  let s = raw.trim().toUpperCase()
    .replace(/♭/g, 'B')
    .replace(/♯/g, '#');
  // Allow 's' suffix as sharp: As → A#, Fs → F#, etc.
  if (s.length > 1 && s.endsWith('S') && !s.endsWith('#')) {
    s = s.slice(0, -1) + '#';
  }
  return NOTE_PARSE_MAP[s] ?? null;
}

function drawChallengeNote(revealed) {
  const old = document.getElementById('notes');
  if (old) old.remove();
  if (!currentChallenge) return;

  const { si, fret, note } = currentChallenge;
  const svg = document.getElementById('fretboard');
  const g   = el('g', { id: 'notes' });

  // C reference dots (drawn first so the challenge circle sits on top)
  if (showCNotes) {
    for (let rsi = 0; rsi < STRINGS.length; rsi++) {
      for (let rf = 0; rf <= FRET_COUNT; rf++) {
        if ((OPEN_NOTES[rsi] + rf) % 12 !== 0) continue; // 0 = C
        // Skip the challenge position — the challenge circle covers it
        if (rsi === si && rf === fret) continue;
        g.appendChild(el('circle', {
          cx: noteX(rf), cy: noteY(rsi), r: 9,
          fill: 'rgba(226,169,91,0.20)', stroke: '#e2a95b', 'stroke-width': 1.5,
        }));
        g.appendChild(svgText('C', {
          x: noteX(rf), y: noteY(rsi),
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'font-size': '8', 'font-family': 'monospace', 'font-weight': 'bold',
          fill: '#e2a95b', 'pointer-events': 'none',
        }));
      }
    }
  }

  // Challenge circle
  const cx = noteX(fret);
  const cy = noteY(si);
  g.appendChild(el('circle', {
    cx, cy, r: 12,
    fill:           revealed ? '#4caf50' : '#ffffff',
    stroke:         revealed ? '#2e7d32' : '#999999',
    'stroke-width': 2,
  }));
  g.appendChild(svgText(revealed ? NOTE_NAMES[note] : '?', {
    x: cx, y: cy,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-size': revealed ? '9' : '12',
    'font-family': 'monospace', 'font-weight': 'bold',
    fill: revealed ? '#fff' : '#333',
    'pointer-events': 'none',
  }));

  svg.appendChild(g);
}

function newChallenge() {
  challengeLocked = false;
  const si   = minString + Math.floor(Math.random() * (maxString - minString + 1));
  const fret = minFret   + Math.floor(Math.random() * (maxFret   - minFret   + 1));
  currentChallenge = { si, fret, note: (OPEN_NOTES[si] + fret) % 12 };

  drawFretboard();
  drawChallengeNote(false);

  const input    = document.getElementById('note-input');
  const feedback = document.getElementById('feedback');
  input.value          = '';
  feedback.textContent = '';
  feedback.className   = '';
  input.focus();
}

function checkAnswer() {
  if (challengeLocked || !currentChallenge) return;

  const input    = document.getElementById('note-input');
  const feedback = document.getElementById('feedback');
  const parsed   = parseNote(input.value);

  if (parsed === null) {
    feedback.textContent = 'Enter a note name, e.g. C, F#, Bb';
    feedback.className   = 'feedback-hint';
    return;
  }

  if (parsed === currentChallenge.note) {
    challengeLocked      = true;
    feedback.textContent = '✓ Correct!';
    feedback.className   = 'feedback-correct';
    drawChallengeNote(true);
    setTimeout(newChallenge, 900);
  } else {
    feedback.textContent = '✗ Try again';
    feedback.className   = 'feedback-wrong';
    input.value          = '';
    input.focus();
  }
}

// --- Note Finder ---
let nfChallenge  = null; // { note }
let nfLocked     = false;
let nfMinFret    = 0;
let nfMaxFret    = FRET_COUNT;
let nfMinString  = 0;
let nfMaxString  = STRINGS.length - 1;

// Convert a click/touch event to SVG viewBox coordinates.
function svgCoordsFromEvent(e) {
  const svg  = document.getElementById('fretboard');
  const rect = svg.getBoundingClientRect();
  const cx   = e.clientX;
  const cy   = e.clientY;
  return {
    x: (cx - rect.left) * (totalWidth  / rect.width),
    y: (cy - rect.top)  * (totalHeight / rect.height),
  };
}

function fretFromX(x) {
  if (x > PAD_LEFT + boardWidth) return 0; // open area (right of nut)
  // fretX decreases as f increases; find the first f where x >= fretX(f)
  for (let f = 1; f <= FRET_COUNT; f++) {
    if (x >= fretX(f)) return f;
  }
  return FRET_COUNT;
}

function stringFromY(y) {
  return Math.max(0, Math.min(STRINGS.length - 1, Math.round((y - PAD_TOP) / STRING_SPACING)));
}

// Draw the valid-area highlight and optional note markers into a <g id="nf-overlay">.
// state: 'idle' | 'correct' | 'wrong'
function drawNFOverlay(state = 'idle', wrongSi, wrongFret) {
  const old = document.getElementById('nf-overlay');
  if (old) old.remove();

  const svg = document.getElementById('fretboard');
  const g   = el('g', { id: 'nf-overlay' });

  const boardLeft  = PAD_LEFT;
  const boardRight = PAD_LEFT + boardWidth + PAD_RIGHT;
  const boardTop   = PAD_TOP  - FRET_OVERHANG;
  const boardBot   = PAD_TOP  + boardHeight + FRET_OVERHANG;

  const isRestricted = nfMinFret > 0 || nfMaxFret < FRET_COUNT
                    || nfMinString > 0 || nfMaxString < STRINGS.length - 1;

  if (isRestricted) {
    // x bounds of the valid fret playing space
    const vx1 = fretX(nfMaxFret);
    const vx2 = nfMinFret === 0          ? boardRight : fretX(nfMinFret - 1);

    // y bounds of the valid string band
    const vy1 = nfMinString === 0               ? boardTop : noteY(nfMinString) - STRING_SPACING / 2;
    const vy2 = nfMaxString === STRINGS.length - 1 ? boardBot : noteY(nfMaxString) + STRING_SPACING / 2;

    const dim = 'rgba(0,0,0,0.5)';
    // Dim the four strips surrounding the valid area
    if (vy1 > boardTop)
      g.appendChild(el('rect', { x: boardLeft, y: boardTop, width: boardRight - boardLeft, height: vy1 - boardTop, fill: dim }));
    if (vy2 < boardBot)
      g.appendChild(el('rect', { x: boardLeft, y: vy2,      width: boardRight - boardLeft, height: boardBot - vy2,  fill: dim }));
    if (vx1 > boardLeft)
      g.appendChild(el('rect', { x: boardLeft, y: vy1, width: vx1 - boardLeft, height: vy2 - vy1, fill: dim }));
    if (vx2 < boardRight)
      g.appendChild(el('rect', { x: vx2, y: vy1, width: boardRight - vx2,  height: vy2 - vy1, fill: dim }));

    // Border around valid area
    g.appendChild(el('rect', {
      x: vx1, y: vy1, width: vx2 - vx1, height: vy2 - vy1,
      fill: 'none', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 1.5, rx: 2,
    }));
  }

  if (state === 'correct') {
    // Highlight every occurrence of the challenge note within the valid range
    for (let si = nfMinString; si <= nfMaxString; si++) {
      for (let f = nfMinFret; f <= nfMaxFret; f++) {
        if ((OPEN_NOTES[si] + f) % 12 !== nfChallenge.note) continue;
        g.appendChild(el('circle', {
          cx: noteX(f), cy: noteY(si), r: 12,
          fill: '#4caf50', stroke: '#2e7d32', 'stroke-width': 1.5,
        }));
        g.appendChild(svgText(nfChallenge.display, {
          x: noteX(f), y: noteY(si),
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          'font-size': '9', 'font-family': 'monospace', 'font-weight': 'bold',
          fill: '#fff', 'pointer-events': 'none',
        }));
      }
    }
  } else if (state === 'wrong') {
    g.appendChild(el('circle', {
      cx: noteX(wrongFret), cy: noteY(wrongSi), r: 12,
      fill: '#ef5350', stroke: '#b71c1c', 'stroke-width': 1.5,
    }));
    g.appendChild(svgText('✗', {
      x: noteX(wrongFret), y: noteY(wrongSi),
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-size': '12', 'font-family': 'monospace', 'font-weight': 'bold',
      fill: '#fff', 'pointer-events': 'none',
    }));
  }

  // Note name centered above the fretboard wood
  if (nfChallenge) {
    const label = nfChallenge.display;
    g.appendChild(svgText(label, {
      x: PAD_LEFT + boardWidth / 2,
      y: (PAD_TOP - FRET_OVERHANG) / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      'font-size': '52',
      'font-family': "'Menlo', 'Monaco', monospace",
      'font-weight': 'bold',
      fill: state === 'correct' ? '#4caf50' : '#e2a95b',
      'pointer-events': 'none',
    }));
  }

  svg.appendChild(g);
}

function newNFChallenge() {
  nfLocked = false;

  // Only pick notes that actually appear within the current fret/string range
  const available = new Set();
  for (let si = nfMinString; si <= nfMaxString; si++) {
    for (let f = nfMinFret; f <= nfMaxFret; f++) {
      available.add((OPEN_NOTES[si] + f) % 12);
    }
  }
  const pool = [...available];
  const note = pool[Math.floor(Math.random() * pool.length)];
  const display = ACCIDENTALS.has(note)
    ? (Math.random() < 0.5 ? NOTE_NAMES[note] : NOTE_NAMES_FLAT[note])
    : NOTE_NAMES[note];
  nfChallenge = { note, display };
  document.getElementById('nf-feedback').textContent     = '';
  document.getElementById('nf-feedback').className       = '';
  drawFretboard();
  drawNFOverlay('idle');
}

function handleFretboardClick(e) {
  if (appMode !== 'note-finder' || nfLocked || !nfChallenge) return;
  e.preventDefault();

  const { x, y } = svgCoordsFromEvent(e);
  const si   = stringFromY(y);
  const fret = fretFromX(x);

  // Ignore clicks outside the valid range
  if (si < nfMinString || si > nfMaxString || fret < nfMinFret || fret > nfMaxFret) {
    const fb = document.getElementById('nf-feedback');
    fb.textContent = 'Click within the highlighted area';
    fb.className   = 'feedback-hint';
    return;
  }

  const note = (OPEN_NOTES[si] + fret) % 12;
  const fb   = document.getElementById('nf-feedback');

  if (note === nfChallenge.note) {
    nfLocked       = true;
    fb.textContent = '✓ Correct!';
    fb.className   = 'feedback-correct';
    drawNFOverlay('correct');
    setTimeout(newNFChallenge, 500);
  } else {
    fb.textContent = '✗ Try again';
    fb.className   = 'feedback-wrong';
    drawNFOverlay('wrong', si, fret);
    setTimeout(() => { if (!nfLocked) drawNFOverlay('idle'); }, 600);
  }
}

function setupNoteFinder() {
  const selIds = ['nf-min-fret', 'nf-max-fret', 'nf-min-string', 'nf-max-string'];
  const [minFretSel, maxFretSel, minStringSel, maxStringSel] = selIds.map(id => document.getElementById(id));

  for (let f = 0; f <= FRET_COUNT; f++) {
    [minFretSel, maxFretSel].forEach(sel => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f === 0 ? '0 (open)' : String(f);
      sel.appendChild(opt);
    });
  }
  minFretSel.value = 0;
  maxFretSel.value = FRET_COUNT;

  STRINGS.forEach((name, i) => {
    [minStringSel, maxStringSel].forEach(sel => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${i + 1} – ${name}`;
      sel.appendChild(opt);
    });
  });
  minStringSel.value = 0;
  maxStringSel.value = STRINGS.length - 1;

  minFretSel.addEventListener('change',   e => { nfMinFret   = +e.target.value; if (nfMinFret > nfMaxFret)   { nfMaxFret   = nfMinFret;   maxFretSel.value   = nfMaxFret;   } drawNFOverlay('idle'); });
  maxFretSel.addEventListener('change',   e => { nfMaxFret   = +e.target.value; if (nfMaxFret < nfMinFret)   { nfMinFret   = nfMaxFret;   minFretSel.value   = nfMinFret;   } drawNFOverlay('idle'); });
  minStringSel.addEventListener('change', e => { nfMinString = +e.target.value; if (nfMinString > nfMaxString) { nfMaxString = nfMinString; maxStringSel.value = nfMaxString; } drawNFOverlay('idle'); });
  maxStringSel.addEventListener('change', e => { nfMaxString = +e.target.value; if (nfMaxString < nfMinString) { nfMinString = nfMaxString; minStringSel.value = nfMinString; } drawNFOverlay('idle'); });

  // Click and touch handlers on the SVG
  const svg = document.getElementById('fretboard');
  svg.addEventListener('click', handleFretboardClick);
}

// --- Control setup ---
function populateRootSelect() {
  const sel = document.getElementById('root-select');
  NOTE_NAMES.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

function populateTypeSelect() {
  const sel        = document.getElementById('type-select');
  const collection = scaleOrArp === 'scale' ? SCALES : ARPEGGIOS;
  sel.innerHTML    = '';
  collection.forEach((item, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = item.name;
    sel.appendChild(opt);
  });
  typeIndex = Math.min(typeIndex, collection.length - 1);
  sel.value = typeIndex;
}

function setupControls() {
  document.getElementById('btn-scale').addEventListener('click', () => {
    if (scaleOrArp === 'scale') return;
    scaleOrArp = 'scale';
    typeIndex  = 0;
    document.getElementById('btn-scale').classList.add('active');
    document.getElementById('btn-arpeggio').classList.remove('active');
    populateTypeSelect();
    drawNotes();
  });

  document.getElementById('btn-arpeggio').addEventListener('click', () => {
    if (scaleOrArp === 'arpeggio') return;
    scaleOrArp = 'arpeggio';
    typeIndex  = 0;
    document.getElementById('btn-arpeggio').classList.add('active');
    document.getElementById('btn-scale').classList.remove('active');
    populateTypeSelect();
    drawNotes();
  });

  document.getElementById('root-select').addEventListener('change', e => {
    root = +e.target.value;
    drawNotes();
  });

  document.getElementById('type-select').addEventListener('change', e => {
    typeIndex = +e.target.value;
    drawNotes();
  });

  document.getElementById('check-btn').addEventListener('click', checkAnswer);

  document.getElementById('btn-show-c').addEventListener('click', function () {
    showCNotes = !showCNotes;
    this.classList.toggle('active', showCNotes);
    drawChallengeNote(challengeLocked);
  });

  document.getElementById('note-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') checkAnswer();
  });
}

function setupNoteNamerFilters() {
  const minFretSel   = document.getElementById('min-fret-select');
  const maxFretSel   = document.getElementById('max-fret-select');
  const minStringSel = document.getElementById('min-string-select');
  const maxStringSel = document.getElementById('max-string-select');

  // Populate fret options
  for (let f = 0; f <= FRET_COUNT; f++) {
    const labelOpen = f === 0 ? '0 (open)' : String(f);
    [minFretSel, maxFretSel].forEach(sel => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = labelOpen;
      sel.appendChild(opt);
    });
  }
  minFretSel.value = 0;
  maxFretSel.value = FRET_COUNT;

  // Populate string options (high F = string 1, low E = string 6)
  STRINGS.forEach((name, i) => {
    [minStringSel, maxStringSel].forEach(sel => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${i + 1} – ${name}`;
      sel.appendChild(opt);
    });
  });
  minStringSel.value = 0;
  maxStringSel.value = STRINGS.length - 1;

  minFretSel.addEventListener('change', e => {
    minFret = +e.target.value;
    if (minFret > maxFret) { maxFret = minFret; maxFretSel.value = maxFret; }
  });
  maxFretSel.addEventListener('change', e => {
    maxFret = +e.target.value;
    if (maxFret < minFret) { minFret = maxFret; minFretSel.value = minFret; }
  });
  minStringSel.addEventListener('change', e => {
    minString = +e.target.value;
    if (minString > maxString) { maxString = minString; maxStringSel.value = maxString; }
  });
  maxStringSel.addEventListener('change', e => {
    maxString = +e.target.value;
    if (maxString < minString) { minString = maxString; minStringSel.value = minString; }
  });
}

function setupModeSelector() {
  document.getElementById('mode-select').addEventListener('change', e => {
    appMode = e.target.value;
    document.getElementById('visualiser-controls').hidden  = appMode !== 'visualiser';
    document.getElementById('note-namer-controls').hidden  = appMode !== 'note-namer';
    document.getElementById('note-finder-controls').hidden = appMode !== 'note-finder';
    document.getElementById('fretboard').classList.toggle('note-finder-active', appMode === 'note-finder');

    if (appMode === 'visualiser') {
      drawFretboard();
      drawNotes();
    } else if (appMode === 'note-namer') {
      newChallenge();
    } else {
      newNFChallenge();
    }
  });
}

// --- PWA ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// --- Init ---
populateRootSelect();
populateTypeSelect();
setupControls();
setupNoteNamerFilters();
setupNoteFinder();
setupModeSelector();
drawFretboard();
drawNotes();
