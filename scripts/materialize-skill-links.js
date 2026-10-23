'use strict';

/**
 * npm does not pack symlinks. Replace the project skill mounts with real
 * trees before `npm pack` / `npm publish`, then restore the symlinks.
 * Re-entrant: a second materialize is a no-op while the state file exists
 * (prepack can run twice). plugins/ceci/skills/ceci is not a link: it is a
 * committed copy (scripts/sync-integrations.js).
 *
 *   node scripts/materialize-skill-links.js materialize|restore
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE = path.join(ROOT, '.ceci-pack-state.json');
const LINKS = [
  '.agents/skills/ceci',
  '.claude/skills/ceci',
  '.grok/skills/ceci',
];

function assertInsideRepo(root, resolved) {
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`refusing to materialize a link outside the repo: ${resolved}`);
  }
}

function copyReal(src, dest) {
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) throw new Error(`refusing to copy symlink ${src}`);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copyReal(path.join(src, name), path.join(dest, name));
    return;
  }
  if (!st.isFile()) throw new Error(`unsupported filesystem entry: ${src}`);
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, st.mode & 0o777);
}

function restore(root = ROOT) {
  const stateFile = path.join(root, path.basename(STATE));
  if (!fs.existsSync(stateFile)) return;
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  for (const entry of state) {
    const abs = path.join(root, entry.rel);
    fs.rmSync(abs, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.symlinkSync(entry.target, abs);
  }
  fs.unlinkSync(stateFile);
}

function materialize(root = ROOT) {
  const stateFile = path.join(root, path.basename(STATE));
  if (fs.existsSync(stateFile)) return;
  const state = [];
  fs.writeFileSync(stateFile, '[]\n');
  try {
    for (const rel of LINKS) {
      const abs = path.join(root, rel);
      if (!fs.lstatSync(abs).isSymbolicLink()) {
        throw new Error(`${rel} is not a symlink; refusing to pack an unexpected tree`);
      }
      const target = fs.readlinkSync(abs);
      const resolved = path.resolve(path.dirname(abs), target);
      assertInsideRepo(root, resolved);
      if (!fs.existsSync(path.join(resolved, 'SKILL.md'))) {
        throw new Error(`symlink ${rel} does not point at a skill tree`);
      }
      fs.unlinkSync(abs);
      copyReal(resolved, abs);
      state.push({ rel, target });
      fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
    }
  } catch (err) {
    restore(root);
    throw err;
  }
}

if (require.main === module) {
  const cmd = process.argv[2];
  try {
    if (cmd === 'materialize') materialize();
    else if (cmd === 'restore') restore();
    else {
      process.stderr.write('usage: node scripts/materialize-skill-links.js materialize|restore\n');
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { LINKS, STATE, materialize, restore };
