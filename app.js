'use strict';

// --- Tuning & fretboard ---
const STRINGS    = ['F', 'C', 'G', 'D', 'A', 'E']; // top → bottom (high → low), all-4ths
const OPEN_NOTES = [5, 0, 7, 2, 9, 4];              // chromatic index: F=5 C=0 G=7 D=2 A=9 E=4
const FRET_COUNT   = 12;
const FRET_MARKERS = [3, 5, 7, 9]; // single dots; 12 gets a double dot (handled separately)

// --- Music theory ---
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

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
let appMode   = 'visualiser'; // 'visualiser' | 'note-namer'

// Visualiser state
let scaleOrArp = 'scale';
let root       = 0;
let typeIndex  = 0;

// Note Namer state
let currentChallenge = null; // { si, fret, note }
let challengeLocked  = false;

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
const PAD_TOP        = 20;
const PAD_BOTTOM     = 40;
const STRING_SPACING = 46;
const FRET_SPACING   = 80;

const boardWidth  = FRET_COUNT * FRET_SPACING;
const boardHeight = (STRINGS.length - 1) * STRING_SPACING;
const totalWidth  = PAD_LEFT + boardWidth + PAD_RIGHT;
const totalHeight = PAD_TOP + boardHeight + PAD_BOTTOM;

// Left-handed: fret 0 (nut) on the right; fret numbers increase leftward.
const fretX = f => PAD_LEFT + (FRET_COUNT - f) * FRET_SPACING;
const noteX = f => f === 0
  ? PAD_LEFT + boardWidth + PAD_RIGHT / 2
  : PAD_LEFT + (FRET_COUNT - f + 0.5) * FRET_SPACING;
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
    x: PAD_LEFT, y: PAD_TOP, width: boardWidth, height: boardHeight, fill: '#7a4f2e', rx: 2,
  }));
  svg.appendChild(el('rect', {
    x: PAD_LEFT, y: PAD_TOP, width: boardWidth, height: boardHeight, fill: 'url(#wood)', rx: 2,
  }));

  // Single-dot position markers
  FRET_MARKERS.forEach(fret => {
    svg.appendChild(el('circle', {
      cx: PAD_LEFT + (FRET_COUNT - fret + 0.5) * FRET_SPACING,
      cy: PAD_TOP + boardHeight / 2,
      r: 6, fill: 'rgba(255,255,255,0.18)',
    }));
  });

  // Double dot at fret 12
  const dot12x = PAD_LEFT + (FRET_COUNT - 12 + 0.5) * FRET_SPACING;
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
      x1: x, y1: PAD_TOP, x2: x, y2: PAD_TOP + boardHeight,
      stroke: isNut ? '#d4af37' : '#c0c0c0',
      'stroke-width': isNut ? 6 : 2,
      'stroke-linecap': 'round',
    }));
    if (f > 0) {
      svg.appendChild(svgText(String(f), {
        x: PAD_LEFT + (FRET_COUNT - f + 0.5) * FRET_SPACING,
        y: PAD_TOP + boardHeight + 28,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': '12', 'font-family': 'monospace', fill: '#888',
      }));
    }
  }

  svg.appendChild(svgText('Open', {
    x: PAD_LEFT + boardWidth + PAD_RIGHT / 2,
    y: PAD_TOP + boardHeight + 28,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-size': '11', 'font-family': 'monospace', fill: '#666',
  }));

  // Strings
  STRINGS.forEach((name, i) => {
    const y = noteY(i);
    svg.appendChild(el('line', {
      x1: PAD_LEFT, y1: y, x2: PAD_LEFT + boardWidth, y2: y,
      stroke: i >= 3 ? '#b8a070' : '#d0d0d0',
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
  const s = raw.trim().toUpperCase()
    .replace(/♭/g, 'B')
    .replace(/♯/g, '#');
  return NOTE_PARSE_MAP[s] ?? null;
}

function drawChallengeNote(revealed) {
  const old = document.getElementById('notes');
  if (old) old.remove();
  if (!currentChallenge) return;

  const { si, fret, note } = currentChallenge;
  const svg = document.getElementById('fretboard');
  const g   = el('g', { id: 'notes' });
  const cx  = noteX(fret);
  const cy  = noteY(si);

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
  const si   = Math.floor(Math.random() * STRINGS.length);
  const fret = Math.floor(Math.random() * (FRET_COUNT + 1));
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

  document.getElementById('note-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') checkAnswer();
  });
}

function setupModeSelector() {
  document.getElementById('mode-select').addEventListener('change', e => {
    appMode = e.target.value;
    const isVisualiser = appMode === 'visualiser';
    document.getElementById('visualiser-controls').hidden = !isVisualiser;
    document.getElementById('note-namer-controls').hidden =  isVisualiser;

    if (isVisualiser) {
      drawFretboard();
      drawNotes();
    } else {
      newChallenge();
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
setupModeSelector();
drawFretboard();
drawNotes();
