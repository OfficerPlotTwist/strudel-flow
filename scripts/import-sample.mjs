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

  for (const src of wavFiles) {
    const filename = path.basename(src);
    const dest = path.join(destDir, filename);
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
}

main();
