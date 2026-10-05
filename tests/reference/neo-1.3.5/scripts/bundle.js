#!/usr/bin/env node
'use strict';

// npm run bundle
//
// Takes the newest .bundle file in Downloads (what Claude sends), checks it,
// brings its changes into main and pushes them to GitHub. Stops with a plain
// sentence (and changes nothing) when something isn't right.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitLoud = (...args) => execFileSync('git', args, { cwd: root, stdio: 'inherit' });
const stop = (msg) => { console.error('\n✋ ' + msg + '\n'); process.exit(1); };
const say = (msg) => console.log('→ ' + msg);

// the bundle: one named on the line, or the newest in Downloads
const downloads = path.join(os.homedir(), 'Downloads');
let file = process.argv[2];
if (!file) {
  const found = fs.existsSync(downloads)
    ? fs.readdirSync(downloads).filter((f) => f.endsWith('.bundle'))
      .map((f) => ({ f: path.join(downloads, f), t: fs.statSync(path.join(downloads, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    : [];
  if (!found.length) stop('There\'s no .bundle file in your Downloads folder. Save the one Claude sent there first.');
  file = found[0].f;
}
if (!fs.existsSync(file)) stop(`Can't find ${file}.`);
say(`Using ${path.basename(file)}`);

// on main, with nothing half-done, up to date
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') stop(`You're on "${branch}", not main. Type: git checkout main   then try again.`);
const changed = git('status', '--porcelain', '--untracked-files=no');
if (changed) stop('Some NEO files have changes that aren\'t committed yet:\n' + changed + '\nAsk Claude what to do with them first.');
say('Getting the latest from GitHub…');
try { git('pull', '--ff-only'); } catch { stop('Couldn\'t get the latest from GitHub cleanly. Ask Claude to take a look.'); }

// the bundle must fit on top of what's here
try { git('bundle', 'verify', file); } catch {
  stop('This bundle doesn\'t fit the NEO you have. It may be an old one. Ask Claude for a fresh bundle.');
}
const heads = git('bundle', 'list-heads', file).split('\n').filter(Boolean);
if (!heads.length) stop('This bundle is empty.');
const [sha, ref] = heads[0].split(/\s+/);
let fresh = true;
try { git('merge-base', '--is-ancestor', sha, 'HEAD'); fresh = false; } catch { /* not in yet: good */ }
if (!fresh) { console.log('\n✅ You already have everything in this bundle. Nothing to do.\n'); process.exit(0); }

say('Bringing the changes in…');
try {
  git('pull', '--no-rebase', '--no-edit', file, ref.replace(/^refs\/heads\//, ''));
} catch {
  try { git('merge', '--abort'); } catch { /* nothing to undo */ }
  stop('The changes didn\'t fit cleanly, so nothing was changed. Ask Claude for a fresh bundle.');
}
say('Sending them to GitHub…');
gitLoud('push', 'origin', 'main');
console.log('\n✅ Done. NEO Pocket rebuilds by itself; type  npm run release  when you want desktop users to get it.\n');
