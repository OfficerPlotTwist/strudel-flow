/**
 * Pulls a real Songsterr tab down as structured data, so a song snippet can be
 * TRANSCRIBED instead of invented.
 *
 * This exists because the obvious approach fails silently: the tab page is a
 * JS shell that renders "Loading...", so anything that reads the HTML - a
 * plain fetch, a page-to-markdown fetcher, an LLM "reading the URL" - comes
 * back with no notes at all and is very tempting to paper over with a
 * plausible-sounding invention. That is exactly how src/seed-snippets.js ended
 * up with a Get Got in the wrong key at the wrong tempo.
 *
 * The notes live in gzipped JSON on a CDN, at a path assembled from three
 * fields of the meta API. No browser and no auth are needed once you know the
 * shape:
 *
 *   GET /api/meta/{songId}                     -> revisionId, image, tracks[]
 *   GET {CDN}/{songId}/{revisionId}/{image}/{trackIndex}.json
 *
 * The CDN serves gzip WITHOUT a content-encoding header, so fetch() hands back
 * compressed bytes and JSON.parse chokes on them - hence the magic-byte check.
 *
 *   node scripts/ingest-songsterr.mjs <songId | songsterr url> [--track N] [--json]
 *
 * Positions are printed in sixteenths from the top of the measure, so `4:sd`
 * is a snare on beat 2 and `1.5:mt` is a 32nd offbeat. That is the unit
 * Strudel mini-notation counts in, so the output transcribes straight across.
 */
import { gunzipSync } from 'node:zlib';

const CDN = 'https://dqsljvtekg760.cloudfront.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** General MIDI percussion map, for the note numbers a drum track uses. */
const GM_DRUMS = {
  35: 'bd2', 36: 'bd', 37: 'rim', 38: 'sd', 39: 'clap', 40: 'sd2', 41: 'lt2',
  42: 'hh', 43: 'lt', 44: 'hh_pedal', 45: 'mt2', 46: 'oh', 47: 'mt', 48: 'ht',
  49: 'cr', 50: 'ht2', 51: 'rd', 52: 'china', 53: 'rd_bell', 54: 'tamb',
  55: 'splash', 56: 'cowbell', 57: 'cr2', 59: 'rd2',
};
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiName = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // gzip magic - the CDN omits content-encoding, so fetch cannot do this for us
  const body = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  return JSON.parse(body.toString('utf8'));
}

/** Accepts a bare id or any songsterr URL ending in `-s<id>`. */
function parseSongId(arg) {
  if (/^\d+$/.test(arg)) return arg;
  const m = arg.match(/-s(\d+)/);
  if (!m) throw new Error(`cannot find a song id in "${arg}"`);
  return m[1];
}

/**
 * Flattens one measure into `position -> [names]`, where position is in
 * sixteenths. Guitar Pro stores durations as fractions of a whole note, so a
 * [1,16] beat advances the cursor by one sixteenth.
 */
function measureEvents(measure, naming) {
  const events = new Map();
  for (const voice of measure.voices) {
    let pos = 0;
    for (const beat of voice.beats) {
      const [num, den] = beat.duration;
      for (const note of beat.notes ?? []) {
        if (note.rest || note.fret === undefined) continue;
        const at = Number(pos.toFixed(4));
        if (!events.has(at)) events.set(at, []);
        events.get(at).push(naming(note));
      }
      pos += (num / den) * 16;
    }
  }
  return events;
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const trackFlag = args.indexOf('--track');
const wantTrack = trackFlag === -1 ? null : Number(args[trackFlag + 1]);
const target = args.find((a) => !a.startsWith('--') && a !== String(wantTrack));
if (!target) {
  console.error('usage: node scripts/ingest-songsterr.mjs <songId | url> [--track N] [--json]');
  process.exit(1);
}

const songId = parseSongId(target);
const meta = await getJson(`https://www.songsterr.com/api/meta/${songId}`);
const indices = wantTrack === null ? meta.tracks.map((_, i) => i) : [wantTrack];

const out = { songId, revisionId: meta.revisionId, artist: meta.artist, title: meta.title, tracks: [] };

for (const i of indices) {
  const info = meta.tracks[i];
  if (!info) throw new Error(`no track ${i} (song has ${meta.tracks.length})`);
  const track = await getJson(`${CDN}/${songId}/${meta.revisionId}/${meta.image}/${i}.json`);

  // Drum tracks store the MIDI note in `fret` and carry no tuning; pitched
  // tracks are tuning[string - 1] + fret.
  const isDrums = !track.tuning;
  const naming = isDrums
    ? (n) => GM_DRUMS[n.fret] ?? `#${n.fret}`
    : (n) => midiName(track.tuning[n.string - 1] + n.fret);

  const measures = track.measures.map((m, mi) => ({
    index: mi,
    signature: m.signature ?? null,
    marker: m.marker?.text ?? null,
    // an array, not an object: JS reorders integer-like object keys, which
    // would file the 32nd offbeat 1.5 after the downbeat 14
    events: [...measureEvents(m, naming)]
      .sort((a, b) => a[0] - b[0])
      .map(([at, names]) => ({ at, hits: [...new Set(names)].sort() })),
  }));
  out.tracks.push({
    index: i,
    instrument: track.instrument,
    tuning: track.tuning?.map(midiName) ?? null,
    tempo: track.automations?.tempo ?? [],
    measures,
  });
}

if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`${out.artist} - ${out.title}  (song ${songId}, revision ${out.revisionId})`);
  for (const t of out.tracks) {
    const bpm = t.tempo.map((x) => `${x.bpm} BPM from measure ${x.measure + 1}`).join(', ');
    console.log(`\n=== track ${t.index}: ${t.instrument}${t.tuning ? ` [${t.tuning.join(' ')}]` : ''}`);
    console.log(`    ${bpm || 'no tempo automation'} | ${t.measures.length} measures`);
    for (const m of t.measures) {
      const cells = m.events.map(({ at, hits }) => `${at}:${hits.join('+')}`);
      const tags = [m.signature ? m.signature.join('/') : '', m.marker ?? ''].filter(Boolean).join(' ');
      console.log(`  m${String(m.index + 1).padStart(2, '0')} ${tags.padEnd(10)}| ${cells.join('  ')}`);
    }
  }
}
