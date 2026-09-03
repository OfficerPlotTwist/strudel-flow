#!/usr/bin/env node
/**
 * Extracts one-line descriptions for Strudel functions out of the JSDoc that
 * @strudel ships in its published .mjs sources, and writes them to
 * src/strudel-docs.json.
 *
 * Why a build step and not a runtime parse: the docs never change between
 * `npm install`s, so parsing ~2MB of source on every page load (and shipping
 * a JSDoc parser to the browser) would buy nothing. Why not a hand-written
 * map: it would silently drift from the installed version and cover a
 * fraction of the ~400 functions. Re-run this after upgrading @strudel.
 *
 * Usage: node scripts/build-docs.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packages = ['core', 'mini', 'tonal', 'webaudio', 'midi', 'draw', 'soundfonts', 'web'];

function mjsFiles(dir) {
  let out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'node_modules') out = out.concat(mjsFiles(path));
    } else if (entry.endsWith('.mjs') && !entry.endsWith('.test.mjs')) {
      out.push(path);
    }
  }
  return out;
}

/** Strip the leading ` * ` gutter from a raw JSDoc block body. */
function ungutter(block) {
  return block
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, ''))
    .join('\n');
}

/** The prose above the first @tag, flattened to one line of plain text. */
function summarize(body) {
  const prose = body.split(/^\s*@/m)[0];
  const flat = prose
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return '';
  // First sentence, unless it is very short (many blocks open with a short
  // clause that only makes sense together with the next one).
  // A sentence ends at .!? followed by whitespace and a new sentence - NOT at
  // every period. These docstrings are full of code: `sometimesBy(0.9)` and a
  // leading `.method` both contain periods that a naive split cuts on, and the
  // result reads as a truncated description rather than a short one.
  const sentences = flat.split(/(?<=[.!?])\s+(?=["'`(\[]*[A-Z])/);
  let out = sentences[0].trim();
  if (out.length < 60 && sentences[1]) out = `${out} ${sentences[1].trim()}`;
  return out.length > 240 ? `${out.slice(0, 237).trimEnd()}...` : out;
}

function tagValues(body, tag) {
  const re = new RegExp(`^@${tag}[ \t]+(.*)$`, 'gm');
  return [...body.matchAll(re)].map((m) => m[1].trim());
}

/** Param list rendered as a signature tail, e.g. "(amount, pat)". */
function signature(body) {
  const params = tagValues(body, 'param').map((line) => {
    // "{number | Pattern} group cut group number" -> "group"
    const withoutType = line.replace(/^\{[^}]*\}\s*/, '');
    const name = withoutType.split(/\s+/)[0] ?? '';
    return name.replace(/^\[|\]$/g, '').split('=')[0];
  });
  return params.filter(Boolean);
}

/** Names declared by the code immediately following a doc block. */
function namesFromCode(code) {
  const destructured = code.match(/^\s*export\s+const\s*\{([^}]*)\}/);
  if (destructured) {
    return destructured[1]
      .split(',')
      .map((s) => s.trim().split(':').pop().trim())
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
  }
  const single = code.match(/^\s*export\s+(?:const|let|function|async function)\s+([A-Za-z_$][\w$]*)/);
  if (single) return [single[1]];
  // A handful of core functions (struct, mask, ...) are only ever attached to
  // the prototype and re-exported elsewhere, so the doc block sits above a
  // `Pattern.prototype.x = ...` line rather than an export.
  const proto = code.match(/^\s*Pattern\.prototype\.([A-Za-z_$][\w$]*)\s*=/);
  return proto ? [proto[1]] : [];
}

/**
 * Which of the twelve buckets a name belongs to.
 *
 * Two signals, and the order between them matters. The DEFINING FILE is the
 * strongest one - @strudel groups its source by concern, so core/signal.mjs is
 * definitionally the signal generators and draw/* is definitionally visual -
 * and it is used wherever a whole file maps cleanly onto a bucket. The NAME is
 * the fallback for the audio-control files, where one file (webaudio's
 * controls) defines filters, envelopes, synth params and effects side by side
 * and only the name distinguishes them.
 *
 * Rules are ordered: the first match wins, so narrow rules must precede broad
 * ones. `pattern` sits last on purpose - core/pattern.mjs is the largest file
 * by far and would swallow anything placed after it.
 */
const oneOf = (...list) => (name) => list.includes(name);
const has = (re) => (name) => re.test(name);

const CATEGORY_RULES = [
  ['visual', (n, f) => f.startsWith('draw/') || /scope|spectrum/.test(f) || oneOf('color', 'colour', 'label')(n)],
  ['midi', (n, f) => f.startsWith('midi/') || has(/^(midi|sysex|nrp|ccn$|ccv$|control$|progNum$|channel$)/)(n)],
  ['routing', (n) => oneOf('orbit', 'bus', 'busgain', 'source', 'as', 'lock', 'dictionary', 'dict', 'gap', 'stepalt')(n)],
  ['harmony', (n, f) => f.startsWith('tonal/') || oneOf('note', 'n', 'arp', 'arpWith', 'chord', 'anchor', 'fanchor', 'mode', 'octave', 'octaves', 'freq', 'detune', 'scale')(n)],
  ['signal', (_n, f) => f === 'core/signal.mjs'],
  ['transport', (n) => oneOf('setcpm', 'setcps', 'cps', 'cpm', 'hush', 'timeline', 'nudge', 'clip', 'legato', 'duration')(n)],
  ['sample', (n) => oneOf('s', 'sound', 'bank', 'begin', 'end', 'loop', 'chop', 'striate', 'slice', 'splice', 'speed', 'cut', 'fit', 'unit', 'channels', 'stretch', 'loopBegin', 'loopEnd', 'loopAt', 'accelerate', 'scrub', 'transient')(n)],
  ['filter', (n) => has(/^(lpf|hpf|bpf|cutoff|resonance|bandf|bandq|hcutoff|hresonance|vowel|djf|ftype|lp|hp|bp)/)(n) || has(/(cutoff|resonance|band|vowel)/i)(n)],
  ['envelope', (n) => has(/^(attack|decay|sustain|release|adsr|hold)/)(n) || has(/(attack|decay|sustain|release|env$|envelope)/i)(n)],
  ['synth', (n) => has(/^(fm|osc|wave|wt|warp|noise|pw|unison|spread|voice|penv|pcurve|p(attack|decay|release|sustain)|zmod|zcrush|ztouch|density|byte)/i)(n)],
  ['fx', (n) => has(/^(room|size|dry|delay|echo|crush|coarse|shape|distort|phaser|chorus|leslie|l(rate|size|depth)$|lfo|compress|comp|tremolo|vib|dist|drive|squiz|gain|amp|velocity|pan|width|postgain|xfade|duck|ir[a-z]|iresponse)/i)(n) || has(/(reverb|delay|phaser|chorus|comp)/i)(n)],
  ['pattern', (_n, f) => ['core/pattern.mjs', 'core/euclid.mjs', 'core/pick.mjs', 'core/index.mjs', 'core/impure.mjs', 'mini/mini.mjs'].includes(f)],
];

/** Everything the rules above don't claim. A real bucket, not a failure. */
const FALLBACK_CATEGORY = 'other';

export function categorize(name, originFile) {
  const rule = CATEGORY_RULES.find(([, test]) => test(name, originFile));
  return rule ? rule[0] : FALLBACK_CATEGORY;
}

/** The buckets in the order the UI should show them: what you reach for first, first. */
export const CATEGORY_ORDER = [
  'pattern', 'harmony', 'sample', 'synth', 'fx', 'filter',
  'envelope', 'signal', 'transport', 'routing', 'midi', 'visual', 'other',
];

const docs = {};
let blocks = 0;

for (const pkg of packages) {
  const dir = join(root, 'node_modules', '@strudel', pkg);
  let files;
  try {
    files = mjsFiles(dir);
  } catch {
    console.warn(`[docs] @strudel/${pkg} not installed, skipping`);
    continue;
  }
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const re = /\/\*\*([\s\S]*?)\*\//g;
    let match;
    while ((match = re.exec(source))) {
      const body = ungutter(match[1]);
      const after = source.slice(match.index + match[0].length, match.index + match[0].length + 400);
      // Order matters: the first surviving name becomes the canonical one and
      // every other is recorded as an alias of it. @name wins when present;
      // otherwise the actual export beats the @synonyms list, because plenty
      // of blocks (e.g. `stack`) declare synonyms but never name themselves -
      // taking a synonym as canonical there would both mislabel the alias and
      // drop the real function from the index entirely.
      const all = [
        ...tagValues(body, 'name'),
        ...namesFromCode(after),
        ...tagValues(body, 'synonyms').flatMap((v) => v.split(',').map((s) => s.trim())),
      ].filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
      if (!all.length) continue;
      const description = summarize(body);
      if (!description) continue;
      blocks += 1;
      const params = signature(body);
      const example = (tagValues(body, 'example')[0] || body.split(/^@example\s*$/m)[1]?.trim().split('\n')[0] || '').trim();
      const canonical = all[0];
      for (const name of all) {
        // First writer wins: @strudel/core is listed first and holds the
        // authoritative doc for names that several packages re-export.
        if (docs[name]) continue;
        docs[name] = {
          description,
          params,
          package: pkg,
          // An alias inherits its canonical's category rather than being
          // categorized on its own name - `pr` and `polyrhythm` must land
          // wherever `stack` did, not wherever their own spelling suggests.
          category:
            name === canonical
              ? categorize(name, `${pkg}/${basename(file)}`)
              : docs[canonical]?.category ?? categorize(canonical, `${pkg}/${basename(file)}`),
          ...(name !== canonical ? { aliasOf: canonical } : {}),
          ...(example ? { example } : {}),
        };
      }
    }
  }
}

const sorted = Object.fromEntries(Object.keys(docs).sort().map((k) => [k, docs[k]]));
const out = join(root, 'src', 'strudel-docs.json');
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`[docs] ${blocks} doc blocks -> ${Object.keys(sorted).length} names -> ${relative(root, out)}`);
