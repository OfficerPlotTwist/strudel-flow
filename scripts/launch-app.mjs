#!/usr/bin/env node
/**
 * Launches the editor as a chromeless desktop-style window: no URL bar, no tab
 * strip, no browser menus - just the CRT UI.
 *
 * This is Chrome's `--app=<url>` mode (also supported by Edge and Chromium,
 * which are the same engine). It is the only way to get a chromeless window
 * without shipping an Electron/Tauri wrapper, and it costs nothing: the app
 * stays an ordinary web page, served by the same dev server.
 *
 * It also uses a dedicated profile directory rather than the user's normal
 * Chrome profile. Two reasons that matter here: the Web MIDI permission this
 * app needs is remembered per-profile (so it is granted once, not every
 * launch), and a separate profile means launching the instrument never touches
 * the browser session the user is actually working in.
 *
 * Usage:
 *   node scripts/launch-app.mjs [--port 5173] [--build] [--no-serve]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : true;
}

const port = Number(flag('port', 5173));
const url = `http://localhost:${port}`;
const serve = !process.argv.includes('--no-serve');

/** First existing Chromium-family browser, in preference order. */
function findBrowser() {
  const candidates = {
    win32: [
      join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
      join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
      join(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
      join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
    ],
  }[platform()] ?? [];
  return candidates.find((path) => path && existsSync(path)) ?? null;
}

/**
 * Resolves once the dev server can actually SERVE THE APP, or rejects after
 * `timeoutMs`.
 *
 * Answering the port is not the same thing. Vite accepts connections within
 * about half a second of starting, but it has not pre-bundled dependencies
 * yet; it does that lazily, discovering more as it crawls the module graph,
 * and every re-optimization invalidates the requests already in flight with a
 * 504 "Outdated Optimize Dep".
 *
 * Opening the window on the first successful HEAD therefore raced the
 * optimizer on any cold cache: the page's module requests 504'd, main.js never
 * ran, and the app sat on the boot screen making no sound - with no error
 * anywhere, because a 504 on a module is not a page error. Worse, Vite's
 * answer to that is a full reload, and the boot screen's click listener is
 * `once`, so a reload lands the user on a boot screen whose click has already
 * been spent.
 *
 * So gate on the entry module returning 200. A 504 means "still optimizing" -
 * keep waiting rather than treating it as up.
 */
async function waitForServer(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'no connection';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/src/main.js`, { cache: 'no-store' });
      if (res.ok) return;
      lastStatus = `HTTP ${res.status}`;
    } catch {
      lastStatus = 'no connection';
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`dev server did not become serveable on ${url} (last: ${lastStatus})`);
}

/**
 * Is the server on this port able to serve the app, not merely to accept a
 * connection? Fetches the entry module and follows one of its dependency
 * imports, because a stale optimizer serves the entry happily and only fails
 * on the dep bundles it rewrote the imports to point at.
 */
async function isHealthy() {
  let entry;
  try {
    entry = await fetch(`${url}/src/main.js`, { cache: 'no-store' });
  } catch {
    return false; // nothing listening
  }
  if (!entry.ok) return false;
  const body = await entry.text();
  const dep = body.match(/from\s+"(\/node_modules\/\.vite\/deps\/[^"]+)"/)?.[1];
  if (!dep) return true; // no pre-bundled deps to go stale
  try {
    return (await fetch(url + dep, { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

/** Free the port so a fresh server can take it (a --strictPort clash is fatal). */
async function killPort(target) {
  if (platform() !== 'win32') {
    // lsof/kill differ per distro; on POSIX a dead-but-listening vite is far
    // rarer, so leave the port alone and let --strictPort report the clash.
    return;
  }
  const { execSync } = await import('node:child_process');
  try {
    const pids = execSync(
      `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${target} -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique"`,
      { encoding: 'utf8' },
    ).trim();
    for (const pid of pids.split(/\s+/).filter(Boolean)) {
      console.log(`[launch] replacing unhealthy dev server (pid ${pid})`);
      execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`);
    }
    if (pids) await new Promise((r) => setTimeout(r, 1500));
  } catch {
    // Nothing listening, or no permission to ask - let the spawn below try.
  }
}

let server = null;
if (serve) {
  // Reuse a server that is already up (a `npm run dev` in another terminal)
  // rather than failing on a port clash - but only if it is actually HEALTHY.
  //
  // A vite process outlives the directory it optimizes into. Delete
  // node_modules/.vite (an npm install, a config change, a stale process left
  // over from a previous session) and the survivor keeps serving import
  // rewrites that point at dep bundles no longer on disk. Every module request
  // then comes back 504 "Outdated Optimize Dep", main.js never runs, and the
  // app sits on the boot screen in silence - with nothing in the console that
  // looks like an error, because a 504 on a module is not a page error.
  //
  // Reusing that is worse than not reusing it, so probe before trusting it.
  const alreadyUp = await isHealthy();
  if (!alreadyUp) {
    await killPort(port);
    console.log(`[launch] starting dev server on ${url}`);
    // Spawn vite's JS entry with this same node binary rather than the `vite`
    // shim: Node on Windows refuses to spawn a .cmd without a shell, and going
    // through a shell would drag in quoting rules that differ per platform.
    server = spawn(
      process.execPath,
      [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'],
      { cwd: root, stdio: 'inherit' },
    );
  } else {
    console.log(`[launch] reusing dev server already on ${url}`);
  }
  await waitForServer();
}

const browser = findBrowser();
if (!browser) {
  console.error('[launch] no Chrome/Edge/Chromium found - open this in a browser instead:');
  console.error(`         ${url}`);
  process.exit(1);
}

const profile = join(homedir(), '.strudel-stack-browser');
console.log(`[launch] ${browser}\n[launch] --app=${url}`);

const child = spawn(
  browser,
  [
    `--app=${url}`,
    `--user-data-dir=${profile}`,
    // The boot screen is a click, so audio unlocks normally - this only stops
    // Chrome from second-guessing the very first sound of a set.
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--no-default-browser-check',
  ],
  { stdio: 'ignore', detached: true },
);
child.unref();

// Closing the window should take the dev server with it, but only when this
// script is the one that started it.
if (server) {
  child.on('exit', () => server.kill());
  console.log('[launch] dev server will stop when this process is interrupted (Ctrl+C)');
} else {
  process.exit(0);
}
