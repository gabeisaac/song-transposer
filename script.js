(function () {
  'use strict';

  var NOTE_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var NOTE_FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  var ENHARMONIC = {
    'C#': 'Db', 'Db': 'C#',
    'D#': 'Eb', 'Eb': 'D#',
    'F#': 'Gb', 'Gb': 'F#',
    'G#': 'Ab', 'Ab': 'G#',
    'A#': 'Bb', 'Bb': 'A#',
    'E#': 'F',  'Fb': 'E',
    'B#': 'C',  'Cb': 'B'
  };

  var KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

  // Full chord token (no leading/trailing letters). Supports G, Am, F#m7, Bbmaj7, G/B, Cadd9, Dsus4, etc.
  var CHORD_TOKEN = /^([A-G](?:#|b)?)((?:maj|min|dim|aug|sus|add|mmaj|m|M|°|ø|o|\+|−|-)?(?:\d+)?)((?:maj|min|dim|aug|sus|add|m|M)?\d+)?(?:\/([A-G](?:#|b)?))?$/;

  var BRACKET_CHORD = /\[([A-G](?:#|b)?(?:maj|min|dim|aug|sus|add|mmaj|m|M|°|ø|o|\+|−|-)?(?:\d+)?(?:(?:maj|min|dim|aug|sus|add|m|M)?\d+)?(?:\/[A-G](?:#|b)?)?)\]/g;

  var SAMPLE =
    'Key: G\n' +
    '\n' +
    'G          D          Em         C\n' +
    'Amazing grace, how sweet the sound\n' +
    'G          D          G\n' +
    'That saved a wretch like me\n' +
    '\n' +
    '[G] I once was [D] lost but [Em] now am [C] found\n' +
    '[G] Was blind but [D] now I [G] see';

  var inputEl = document.getElementById('input');
  var outputEl = document.getElementById('output');
  var slider = document.getElementById('semitoneSlider');
  var valueEl = document.getElementById('semitoneValue');
  var fromKey = document.getElementById('fromKey');
  var toKey = document.getElementById('toKey');
  var copyBtn = document.getElementById('copyBtn');
  var sampleBtn = document.getElementById('sampleBtn');
  var clearBtn = document.getElementById('clearBtn');
  var downBtn = document.getElementById('downBtn');
  var upBtn = document.getElementById('upBtn');
  var sharpBtn = document.getElementById('sharpBtn');
  var flatBtn = document.getElementById('flatBtn');
  var fromPill = document.getElementById('fromPill');
  var toPill = document.getElementById('toPill');
  var shiftLabel = document.getElementById('shiftLabel');

  var preferFlats = false;
  var syncing = false;

  function noteIndex(note) {
    var n = note;
    var i = NOTE_SHARPS.indexOf(n);
    if (i >= 0) return i;
    i = NOTE_FLATS.indexOf(n);
    if (i >= 0) return i;
    if (ENHARMONIC[n]) {
      i = NOTE_SHARPS.indexOf(ENHARMONIC[n]);
      if (i >= 0) return i;
      i = NOTE_FLATS.indexOf(ENHARMONIC[n]);
      if (i >= 0) return i;
    }
    return -1;
  }

  function transposeNote(note, semitones) {
    var i = noteIndex(note);
    if (i < 0) return note;
    var next = (i + semitones) % 12;
    if (next < 0) next += 12;
    return preferFlats ? NOTE_FLATS[next] : NOTE_SHARPS[next];
  }

  function parseChord(token) {
    var m = token.match(CHORD_TOKEN);
    if (!m) return null;
    return { root: m[1], q1: m[2] || '', q2: m[3] || '', bass: m[4] || '' };
  }

  function formatChord(parts, semitones) {
    var out = transposeNote(parts.root, semitones) + parts.q1 + parts.q2;
    if (parts.bass) {
      out += '/' + transposeNote(parts.bass, semitones);
    }
    return out;
  }

  function isChordToken(token) {
    // Strip trailing punctuation often stuck to chords
    var clean = token.replace(/[,.;:!?]+$/g, '');
    return !!parseChord(clean);
  }

  function transposeToken(token, semitones) {
    var punct = '';
    var clean = token.replace(/([,.;:!?]+)$/, function (_, p) {
      punct = p;
      return '';
    });
    var parts = parseChord(clean);
    if (!parts) return token;
    return formatChord(parts, semitones) + punct;
  }

  function isChordLine(line) {
    var trimmed = line.trim();
    if (!trimmed) return false;
    // Pure ChordPro-ish lines with brackets
    if (/^\s*(\[[^\]]+\]\s*)+$/.test(trimmed)) return true;

    var tokens = trimmed.split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;
    var chordish = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (isChordToken(tokens[i]) || /^\[[^\]]+\]$/.test(tokens[i])) {
        chordish++;
      }
    }
    // Chord lines are mostly short chord tokens (and usually no long lyric words)
    var avgLen = trimmed.replace(/\s+/g, '').length / tokens.length;
    return chordish >= Math.ceil(tokens.length * 0.7) && avgLen <= 7;
  }

  function transposeBracketContent(inner, semitones) {
    var parts = parseChord(inner);
    if (!parts) return '[' + inner + ']';
    return '[' + formatChord(parts, semitones) + ']';
  }

  function transposeLine(line, semitones) {
    // Always transpose [Chord] brackets, even inside lyric lines
    var withBrackets = line.replace(BRACKET_CHORD, function (full, inner) {
      return transposeBracketContent(inner, semitones);
    });

    if (!isChordLine(withBrackets.replace(/\[[^\]]+\]/g, 'X'))) {
      // Still handle "Key: G" style labels
      return withBrackets.replace(/(Key:\s*)([A-G](?:#|b)?)/i, function (_, label, note) {
        return label + transposeNote(note, semitones);
      });
    }

    // Preserve spacing by replacing chord tokens in place
    return withBrackets.replace(/(\S+)/g, function (token) {
      if (/^\[[^\]]+\]$/.test(token)) return token; // already done
      return transposeToken(token, semitones);
    });
  }

  function getSemitones() {
    return parseInt(slider.value, 10) || 0;
  }

  function setSemitones(n, fromKeys) {
    n = Math.max(-12, Math.min(12, n));
    slider.value = String(n);
    valueEl.textContent = (n > 0 ? '+' : '') + n;
    if (!fromKeys) {
      syncToKeyFromSemitones();
    }
    updateShiftLabel();
    render();
  }

  function syncToKeyFromSemitones() {
    syncing = true;
    var from = fromKey.value;
    var i = noteIndex(from);
    if (i >= 0) {
      var next = (i + getSemitones()) % 12;
      if (next < 0) next += 12;
      var target = preferFlats ? NOTE_FLATS[next] : NOTE_SHARPS[next];
      var found = false;
      for (var k = 0; k < toKey.options.length; k++) {
        if (noteIndex(toKey.options[k].value) === next) {
          if (toKey.options[k].value === target || !found) {
            toKey.value = toKey.options[k].value;
            found = true;
            if (toKey.options[k].value === target) break;
          }
        }
      }
    }
    syncing = false;
  }

  function syncSemitonesFromKeys() {
    if (syncing) return;
    var a = noteIndex(fromKey.value);
    var b = noteIndex(toKey.value);
    if (a < 0 || b < 0) return;
    var diff = b - a;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    setSemitones(diff, true);
  }

  function updateShiftLabel() {
    var n = getSemitones();
    fromPill.textContent = fromKey.value;
    toPill.textContent = toKey.value;
    if (n === 0) {
      shiftLabel.textContent = 'same pitch';
    } else if (n > 0) {
      shiftLabel.textContent = 'up ' + n + ' semitone' + (n === 1 ? '' : 's');
    } else {
      shiftLabel.textContent = 'down ' + Math.abs(n) + ' semitone' + (n === -1 ? '' : 's');
    }
  }

  function transposeText(text) {
    var n = getSemitones();
    if (!n) return text;
    return text.split('\n').map(function (line) {
      return transposeLine(line, n);
    }).join('\n');
  }

  function render() {
    outputEl.value = transposeText(inputEl.value);
  }

  function fillKeySelects() {
    KEYS.forEach(function (k) {
      var o1 = document.createElement('option');
      o1.value = k;
      o1.textContent = k;
      fromKey.appendChild(o1);
      var o2 = document.createElement('option');
      o2.value = k;
      o2.textContent = k;
      toKey.appendChild(o2);
    });
    fromKey.value = 'G';
    toKey.value = 'G';
  }

  function setAccidental(flats) {
    preferFlats = !!flats;
    sharpBtn.classList.toggle('active', !preferFlats);
    flatBtn.classList.toggle('active', preferFlats);
    syncToKeyFromSemitones();
    render();
  }

  fillKeySelects();

  slider.addEventListener('input', function () {
    setSemitones(getSemitones());
  });
  downBtn.addEventListener('click', function () {
    setSemitones(getSemitones() - 1);
  });
  upBtn.addEventListener('click', function () {
    setSemitones(getSemitones() + 1);
  });
  fromKey.addEventListener('change', function () {
    syncToKeyFromSemitones();
    updateShiftLabel();
    render();
  });
  toKey.addEventListener('change', syncSemitonesFromKeys);
  sharpBtn.addEventListener('click', function () { setAccidental(false); });
  flatBtn.addEventListener('click', function () { setAccidental(true); });
  inputEl.addEventListener('input', render);

  sampleBtn.addEventListener('click', function () {
    inputEl.value = SAMPLE;
    fromKey.value = 'G';
    setSemitones(2);
  });

  clearBtn.addEventListener('click', function () {
    inputEl.value = '';
    render();
    inputEl.focus();
  });

  copyBtn.addEventListener('click', async function () {
    var text = outputEl.value;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      outputEl.select();
      document.execCommand('copy');
    }
    copyBtn.textContent = 'Copied';
    copyBtn.classList.add('copied');
    setTimeout(function () {
      copyBtn.textContent = 'Copy result';
      copyBtn.classList.remove('copied');
    }, 1400);
  });

  setSemitones(0);
  render();
})();
