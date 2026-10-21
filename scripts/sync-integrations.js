'use strict';

/**
 * Generated copies of ceci-skill/ for readers that do not follow symlinks.
 *
 * integrations/hermes/  Hermes Agent URL install. Raw GitHub URLs do not
 *   follow symlinks, and a URL install only fetches files SKILL.md names
 *   under scripts/, references/, templates/, assets/, or examples/.
 *
 * plugins/ceci/skills/ceci/  Marketplace plugin skill. Claude Code, Codex,
 *   and Grok copy the plugin directory and drop a symlink that leaves it,
 *   so this is every file of ceci-skill/, byte for byte.
 *
 *   node scripts/sync-integrations.js          rewrite the copies
 *   node scripts/sync-integrations.js --check  exit 1 if a copy is stale
 */

const fs = require('fs');
const path = require('path');
const hermes = require('../lib/hermes');

const ROOT = path.resolve(__dirname, '..');
const HERMES_OUT = 'integrations/hermes';
const PLUGIN_OUT = 'plugins/ceci/skills/ceci';
const POSIX = process.platform !== 'win32';
const JUNK = /^(\.DS_Store|Thumbs\.db|[Dd]esktop\.ini|__pycache__|.*\.py[cod])$/;

function listFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (JUNK.test(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

const isExec = (file) => (fs.statSync(file).mode & 0o111) !== 0;
const lf = (text) => text.replace(/\r\n/g, '\n');

function hermesFiles(root = ROOT) {
  const skill = path.join(root, 'ceci-skill');
  const files = new Map();
  files.set('SKILL.md', { text: hermes.renderHub(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8')), exec: false });
  files.set('scripts/ceci.js', { text: fs.readFileSync(path.join(skill, 'tool', 'ceci.js'), 'utf8'), exec: false });
  files.set('scripts/package.json', { text: fs.readFileSync(path.join(skill, 'package.json'), 'utf8'), exec: false });
  for (const name of fs.readdirSync(path.join(skill, 'playbooks')).sort()) {
    files.set(`references/${name}`, { text: fs.readFileSync(path.join(skill, 'playbooks', name), 'utf8'), exec: false });
  }
  files.set('examples/gpu-prefs.yaml', { text: fs.readFileSync(path.join(skill, 'examples', 'gpu-prefs.yaml'), 'utf8'), exec: false });
  return files;
}

function pluginFiles(root = ROOT) {
  const skill = path.join(root, 'ceci-skill');
  const files = new Map();
  for (const rel of listFiles(skill)) {
    const src = path.join(skill, rel);
    files.set(rel, { text: fs.readFileSync(src, 'utf8'), exec: isExec(src) });
  }
  return files;
}

function targets(root = ROOT) {
  return [
    { out: HERMES_OUT, why: 'a Hermes URL install does not follow it', modes: false, files: hermesFiles(root) },
    { out: PLUGIN_OUT, why: 'Codex and Grok do not copy it', modes: true, files: pluginFiles(root) },
  ];
}

function isLink(file) {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

function drift(root = ROOT) {
  const problems = [];
  for (const target of targets(root)) {
    const dir = path.join(root, target.out);
    if (isLink(dir)) {
      problems.push(`${target.out} is a symlink; ${target.why}`);
      continue;
    }
    for (const [rel, want] of target.files) {
      const file = path.join(dir, rel);
      if (!fs.existsSync(file)) problems.push(`${target.out}/${rel} is missing`);
      else if (isLink(file)) problems.push(`${target.out}/${rel} is a symlink; ${target.why}`);
      else if (lf(fs.readFileSync(file, 'utf8')) !== lf(want.text)) problems.push(`${target.out}/${rel} is stale`);
      else if (target.modes && POSIX && isExec(file) !== want.exec) problems.push(`${target.out}/${rel} ${want.exec ? 'must' : 'must not'} be executable`);
    }
    for (const rel of listFiles(dir)) {
      if (!target.files.has(rel)) problems.push(`${target.out}/${rel} is not generated; remove it or add it to scripts/sync-integrations.js`);
    }
  }
  return problems;
}

function write(root = ROOT) {
  const done = [];
  for (const target of targets(root)) {
    const dir = path.join(root, target.out);
    if (isLink(dir)) fs.unlinkSync(dir);
    for (const rel of listFiles(dir)) {
      if (!target.files.has(rel)) fs.rmSync(path.join(dir, rel), { recursive: true, force: true });
    }
    for (const [rel, want] of target.files) {
      const file = path.join(dir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (isLink(file)) fs.unlinkSync(file);
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== want.text) fs.writeFileSync(file, want.text);
      if (target.modes && POSIX) fs.chmodSync(file, want.exec ? 0o755 : 0o644);
    }
    done.push({ out: target.out, count: target.files.size });
  }
  return done;
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const problems = drift();
    if (problems.length) {
      process.stderr.write(`${problems.join('\n')}\nrun: node scripts/sync-integrations.js\n`);
      process.exit(1);
    }
    for (const target of targets()) process.stdout.write(`${target.out} is up to date\n`);
  } else {
    for (const { out, count } of write()) process.stdout.write(`wrote ${count} file(s) to ${out}\n`);
  }
}

module.exports = { HERMES_OUT, PLUGIN_OUT, drift, pluginFiles, targets, write };
