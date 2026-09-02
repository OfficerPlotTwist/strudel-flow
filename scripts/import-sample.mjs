#!/usr/bin/env node
// Imports local .wav files into public/samples/<name>/ and registers them in
// public/samples/local.json, a Strudel sample map (see superdough's
// sampler.mjs `samples()` / `processSampleMap()`): an object of
// { soundName: [relativePath, ...] } plus a `_base` key that is prepended to
// every relative path. An array of N paths under one name plays as
// s("name") .. s("name:N-1"). `_base` is set to "/samples/" here so the map
// resolves from the site root in both `vite` dev and a `vite build` output,
// since files under public/ are served at "/" and copied into dist/ as-is.
//
// Usage:
//   node scripts/import-sample.mjs <file-or-folder>... --name <soundName>
//
// Node built-ins only - no dependencies added.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const samplesRoot = path.join(projectRoot, 'public', 'samples');
const mapPath = path.join(samplesRoot, 'local.json');

function fail(message) {
  console.error(`[import-sample] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const inputs = [];
  let name = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--name') {
      name = argv[i + 1];
      i++;
    } else {
      inputs.push(arg);
    }
  }
  return { inputs, name };
}

function isWavFile(filePath) {
  return path.extname(filePath).toLowerCase() === '.wav';
}

/** Resolves each CLI input (file or folder) to a flat list of .wav file paths. */
function resolveWavFiles(inputs) {
  const wavFiles = [];
  for (const input of inputs) {
    const abs = path.resolve(input);
    if (!fs.existsSync(abs)) {
      fail(`path does not exist: "${input}"`);
    }
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      const entries = fs
        .readdirSync(abs, { withFileTypes: true })
        .filter((e) => e.isFile() && isWavFile(e.name))
        .map((e) => path.join(abs, e.name));
      if (entries.length === 0) {
        fail(`folder contains no .wav files: "${input}"`);
      }
      wavFiles.push(...entries);
    } else {
      if (!isWavFile(abs)) {
        fail(`not a .wav file: "${input}"`);
      }
      wavFiles.push(abs);
    }
  }
  return wavFiles;
}

function validateSoundName(name) {
  if (!name) {
    fail('missing required --name <soundName>');
  }
  if (!/^[a-zA-Z0-9]+$/.test(name)) {
    fail(`invalid --name "${name}": sound names must be alphanumeric only (no spaces or punctuation)`);
  }
  return name;
}

/** True if two files have identical contents (size check first, then bytes). */
function filesEqual(a, b) {
  const statA = fs.statSync(a);
  const statB = fs.statSync(b);
  if (statA.size !== statB.size) {
    return false;
  }
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

function loadOrInitMap() {
  if (!fs.existsSync(mapPath)) {
    return { _base: '/samples/' };
  }
  const raw = fs.readFileSync(mapPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`could not parse existing ${mapPath}: ${err.message}`);
  }
}

function main() {
  const { inputs, name: rawName } = parseArgs(process.argv.slice(2));
  if (inputs.length === 0) {
    fail('missing required <file-or-folder> argument(s)');
  }
  const name = validateSoundName(rawName);
  const wavFiles = resolveWavFiles(inputs);

  const destDir = path.join(samplesRoot, name);
  fs.mkdirSync(destDir, { recursive: true });

  // Two different source files can share a basename (e.g. two unrelated
  // "hit.wav"s). Copying either would silently overwrite the other's bytes
  // (and the JSON dedup can't tell them apart either, since both produce the
  // same relative-path string). Check every destination BEFORE copying
  // anything or touching local.json, so a conflict aborts cleanly with the
  // user's audio and the existing map both untouched.
  for (const src of wavFiles) {
    const dest = path.join(destDir, path.basename(src));
    if (fs.existsSync(dest) && !filesEqual(src, dest)) {
      fail(
        `refusing to overwrite "${path.relative(projectRoot, dest)}" - it already exists ` +
          `with different contents than source "${src}". Pass a different --name, or rename ` +
          `the source file so it doesn't collide.`,
      );
    }
  }

  for (const src of wavFiles) {
    const dest = path.join(destDir, path.basename(src));
    if (fs.existsSync(dest)) {
      // Already verified identical above - this is just a normal idempotent
      // re-run, skip the redundant copy.
      continue;
    }
    fs.copyFileSync(src, dest);
  }

  const map = loadOrInitMap();
  if (!map._base) {
    map._base = '/samples/';
  }
  const existing = Array.isArray(map[name]) ? map[name] : [];
  const relPaths = wavFiles.map((src) => `${name}/${path.basename(src)}`);
  const merged = Array.from(new Set([...existing, ...relPaths])).sort();
  map[name] = merged;

  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf8');

  console.log(`[import-sample] registered "${name}" -> ${merged.length} file(s) in ${path.relative(projectRoot, mapPath)}`);
  merged.forEach((rel, i) => {
    const pattern = i === 0 ? `s("${name}")` : `s("${name}:${i}")`;
    console.log(`  [${i}] ${rel}  ->  ${pattern}`);
  });

  // Indices are assigned by lexicographic sort, not import order, so a file
  // that sorts before existing entries shifts every later index. That's not
  // cosmetic - a saved pattern referencing s("name:n") would now resolve to
  // a different sample. Warn loudly; no auto-migration.
  const oldIndex = new Map(existing.map((rel, i) => [rel, i]));
  const shifted = [];
  merged.forEach((rel, newIdx) => {
    const oldIdx = oldIndex.get(rel);
    if (oldIdx !== undefined && oldIdx !== newIdx) {
      shifted.push({ rel, oldIdx, newIdx });
    }
  });
  if (shifted.length > 0) {
    console.warn(`[import-sample] WARNING: import shifted existing indices for "${name}":`);
    shifted.forEach(({ rel, oldIdx, newIdx }) => {
      console.warn(`  ${rel}: s("${name}:${oldIdx}") -> s("${name}:${newIdx}")`);
    });
    console.warn(
      `  Saved patterns referencing s("${name}:<n>") may now play a different sample. ` +
        `No files were changed to compensate - update any saved patterns manually.`,
    );
  }
}

main();
