/**
 * Pulls a Hooktheory TheoryTab down as structured data - key, mode, tempo,
 * chords and melody - so a song snippet's PITCHES can be transcribed instead
 * of guessed.
 *
 * Companion to ingest-songsterr.mjs, and it exists for the same reason: the
 * theorytab page renders its notes from WASM, so reading the HTML yields
 * nothing playable, and the fallback is invention. Worse, hooktheory.com 403s
 * a request with no browser User-Agent, so a naive fetch reports "blocked"
 * rather than "empty" and looks like a dead end. It is not - one UA header
 * gets both the page and the API.
 *
 * The section ids are in the static HTML as `<div id="tab-{slug}">`; each slug
 * then resolves through the public API, no auth:
 *
 *   GET /theorytab/view/{artist}/{song}       -> tab-{slug} per section
 *   GET api.hooktheory.com/v1/songs/public/{slug}?fields=jsonData,song
 *
 * Hookpad stores melody as scale degree + octave offset, which is already the
 * shape Strudel's n().scale() wants, so `degree` transcribes straight into a
 * pattern and `note` is only there to check it by eye. Beats are 1-based in
 * the source and printed 0-based here, to match a cycle starting at 0.
 *
 *   node scripts/ingest-hooktheory.mjs <artist/song | url> [--json]
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const API = 'https://api.hooktheory.com/v1/songs/public';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Semitones above the tonic for each of the seven degrees, per mode. */
const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

/** Accepts `artist/song` or any theorytab URL. */
function parsePath(arg) {
  const m = arg.match(/theorytab\/view\/([^/?#]+)\/([^/?#]+)/) ?? arg.match(/^([^/]+)\/([^/]+)$/);
  if (!m) throw new Error(`cannot read an artist/song out of "${arg}"`);
  return `${m[1]}/${m[2]}`;
}

/** Tonic in octave 4 is Hookpad's octave 0, which is where its melodies sit. */
function midiOf(tonic, mode, sd, octave) {
  const steps = MODES[mode] ?? MODES.major;
  const root = PITCH_CLASS[tonic[0].toUpperCase()] + (tonic.includes('b') ? -1 : 0) + (tonic.includes('#') ? 1 : 0);
  const idx = Number(sd) - 1;
  return 60 + root + steps[((idx % 7) + 7) % 7] + 12 * (Math.floor(idx / 7) + octave);
}
const midiName = (m) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  console.error('usage: node scripts/ingest-hooktheory.mjs <artist/song | url> [--json]');
  process.exit(1);
}

const path = parsePath(target);
const html = await (await get(`https://www.hooktheory.com/theorytab/view/${path}`)).text();

// Each section embeds its player as `<div id="tab-{slug}">`, preceded by the
// section name in a <span>. Grab the nearest preceding span for the label.
const sections = [];
for (const m of html.matchAll(/id="tab-([A-Za-z0-9_-]+)"/g)) {
  const before = html.slice(Math.max(0, m.index - 400), m.index);
  const label = [...before.matchAll(/>([^<>]{2,30})<\/span>/g)].pop()?.[1]?.trim();
  if (!sections.some((s) => s.slug === m[1])) sections.push({ slug: m[1], label: label ?? '?' });
}
if (!sections.length) throw new Error(`no theorytab sections found at ${path}`);

const out = { path, sections: [] };
for (const { slug, label } of sections) {
  const payload = await (await get(`${API}/${slug}?fields=ID,song,jsonData`)).json();
  const data = JSON.parse(payload.jsonData);
  const key = data.keys?.[0] ?? { tonic: 'C', scale: 'major' };
  const tempo = data.tempos?.[0]?.bpm ?? null;
  const meter = data.meters?.[0];

  out.sections.push({
    slug,
    label,
    song: payload.song,
    key: `${key.tonic} ${key.scale}`,
    bpm: tempo,
    meter: meter ? `${meter.numBeats}/4` : null,
    chords: (data.chords ?? [])
      .filter((c) => !c.isRest)
      .map((c) => ({ beat: c.beat - 1, duration: c.duration, degree: c.root, inversion: c.inversion })),
    notes: (data.notes ?? [])
      .filter((n) => !n.isRest)
      .map((n) => {
        const midi = midiOf(key.tonic, key.scale, n.sd, n.octave);
        return {
          beat: n.beat - 1,
          duration: n.duration,
          degree: Number(n.sd) - 1 + 7 * n.octave, // Strudel n().scale() degree
          note: midiName(midi),
        };
      }),
  });
}

if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  for (const s of out.sections) {
    console.log(`\n=== ${s.song} - ${s.label}  (${s.slug})`);
    console.log(`    key ${s.key} | ${s.bpm} BPM | ${s.meter ?? '?'}`);
    console.log(`    chords: ${s.chords.map((c) => `beat ${c.beat} deg ${c.degree} for ${c.duration}`).join(' | ') || '(none)'}`);
    console.log('    melody (beat / scale degree / pitch):');
    for (const n of s.notes) {
      console.log(`      ${String(n.beat).padStart(5)}  deg ${String(n.degree).padStart(3)}  ${n.note}  (${n.duration})`);
    }
  }
}
