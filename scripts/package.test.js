'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const links = require('./materialize-skill-links');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'ceci.js');
const pkg = require('../package.json');

function ceci(args, env = process.env) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env });
}

test('package.json is the published npm package', () => {
  assert.equal(pkg.name, '@coldcanuk/ceci');
  assert.equal(pkg.license, 'GPL-3.0-or-later');
  assert.equal(pkg.bin.ceci, './bin/ceci.js');
  assert.equal(pkg.publishConfig.access, 'public');
  assert.equal(pkg.version, require('../.claude-plugin/plugin.json').version);
  assert.equal(pkg.version, require('../plugins/ceci/plugin.json').version);
  assert.equal(pkg.version, require('../.claude-plugin/marketplace.json').plugins[0].version);
  assert.match(fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8'), /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  assert.equal((fs.statSync(BIN).mode & 0o111) !== 0, true);
});

test('bin prints its version and usage', () => {
  const version = ceci(['--version']);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), pkg.version);
  assert.equal(ceci([]).status, 2);
  assert.match(ceci(['--help']).stdout, /ceci install/);
});

test('bin forwards task commands to the skill tool', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-bin-'));
  assert.equal(ceci(['init', '--work-dir', work]).status, 0);
  for (const name of ['brief.md', 'state.md', 'log.md']) assert.equal(fs.existsSync(path.join(work, name)), true);
  const status = ceci(['status', '--work-dir', work]);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /ready:/);
  assert.notEqual(ceci(['bogus']).status, 0);
});

test('bin install writes the skill into the harness home', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-home-'));
  const env = { ...process.env, CLAUDE_HOME: path.join(home, 'claude') };
  const res = ceci(['install', '--claude'], env);
  assert.equal(res.status, 0, res.stderr);
  const skill = path.join(home, 'claude', 'skills', 'ceci');
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), fs.readFileSync(path.join(ROOT, 'ceci-skill', 'SKILL.md'), 'utf8'));
  assert.notEqual(ceci(['install', '--nope'], env).status, 0);
});

test('materialize replaces skill links with real trees and restore puts them back', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-pack-'));
  fs.mkdirSync(path.join(root, 'ceci-skill', 'tool'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ceci-skill', 'SKILL.md'), '# ceci\n');
  fs.writeFileSync(path.join(root, 'ceci-skill', 'tool', 'ceci.js'), '');
  fs.chmodSync(path.join(root, 'ceci-skill', 'tool', 'ceci.js'), 0o755);
  for (const rel of links.LINKS) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.symlinkSync('../../ceci-skill', path.join(root, rel));
  }
  links.materialize(root);
  links.materialize(root);
  for (const rel of links.LINKS) {
    const abs = path.join(root, rel);
    assert.equal(fs.lstatSync(abs).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(path.join(abs, 'SKILL.md'), 'utf8'), '# ceci\n');
    assert.equal((fs.statSync(path.join(abs, 'tool', 'ceci.js')).mode & 0o111) !== 0, true);
  }
  links.restore(root);
  for (const rel of links.LINKS) {
    assert.equal(fs.readlinkSync(path.join(root, rel)), '../../ceci-skill');
  }
  assert.equal(fs.existsSync(path.join(root, path.basename(links.STATE))), false);
});

test('materialize refuses a link that leaves the repo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-pack-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-outside-'));
  fs.writeFileSync(path.join(outside, 'SKILL.md'), '# x\n');
  fs.mkdirSync(path.join(root, '.agents', 'skills'), { recursive: true });
  fs.symlinkSync(outside, path.join(root, '.agents', 'skills', 'ceci'));
  assert.throws(() => links.materialize(root), /outside the repo/);
  assert.equal(fs.lstatSync(path.join(root, '.agents', 'skills', 'ceci')).isSymbolicLink(), true);
  assert.equal(fs.existsSync(path.join(root, path.basename(links.STATE))), false);
});

test('npm pack ships the skill, the harness mounts, and no tests', () => {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const files = JSON.parse(res.stdout)[0].files.map((f) => f.path);
  for (const want of [
    'LICENSE',
    'README.md',
    'package.json',
    'bin/ceci.js',
    'ceci-skill/SKILL.md',
    'ceci-skill/tool/ceci.js',
    'ceci-skill/package.json',
    'scripts/install.js',
    'lib/hermes.js',
    '.claude/skills/ceci/SKILL.md',
    '.agents/skills/ceci/SKILL.md',
    '.grok/skills/ceci/SKILL.md',
    'plugins/ceci/skills/ceci/SKILL.md',
    'integrations/hermes/SKILL.md',
  ]) assert.ok(files.includes(want), `missing ${want}`);
  assert.deepEqual(files.filter((f) => f.endsWith('.test.js')), []);
  for (const rel of links.LINKS) assert.equal(fs.lstatSync(path.join(ROOT, rel)).isSymbolicLink(), true);
  assert.equal(fs.existsSync(links.STATE), false);
});

test('npm pack ships only tracked files, even from a dirty checkout', (t) => {
  const planted = ['.claude/settings.local.json', '.claude/sessions/planted.txt', '.agents/planted.txt', '.grok/sessions/planted.txt']
    .filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  t.after(() => {
    for (const rel of planted) {
      fs.rmSync(path.join(ROOT, rel), { force: true });
      const dir = path.dirname(path.join(ROOT, rel));
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    }
  });
  for (const rel of planted) {
    fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, rel), 'planted\n');
  }
  const tracked = new Set(spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean));
  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const untracked = JSON.parse(res.stdout)[0].files.map((f) => f.path).filter((rel) => {
    if (rel === 'package.json' || tracked.has(rel)) return false;
    const link = links.LINKS.find((l) => rel.startsWith(`${l}/`));
    return !(link && tracked.has(`ceci-skill/${rel.slice(link.length + 1)}`));
  });
  assert.deepEqual(untracked, []);
});
