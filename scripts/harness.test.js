'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const hermes = require('../lib/hermes');
const sync = require('./sync-integrations');
const installer = require('./install');

const ROOT = path.resolve(__dirname, '..');

test('Hermes, Claude, Grok, and Codex copies match the skill', () => {
  assert.deepEqual(sync.drift(ROOT), []);
  const hub = fs.readFileSync(path.join(ROOT, 'integrations/hermes/SKILL.md'), 'utf8');
  assert.deepEqual(hermes.checkFrontmatter(hub), []);
  assert.equal(hub.includes('disable-model-invocation'), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'integrations/hermes/scripts/ceci.js')), true);
  for (const name of ['graph.md', 'gates.md', 'gpu.md', 'rdapq.md']) {
    const copy = fs.readFileSync(path.join(ROOT, 'integrations/hermes/references', name), 'utf8');
    assert.equal(copy, fs.readFileSync(path.join(ROOT, 'ceci-skill/playbooks', name), 'utf8'));
  }
  const pluginSkill = path.join(ROOT, 'plugins/ceci/skills/ceci');
  assert.equal(fs.lstatSync(pluginSkill).isSymbolicLink(), false);
  assert.equal(
    fs.readFileSync(path.join(pluginSkill, 'SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'ceci-skill/SKILL.md'), 'utf8'),
  );
  assert.equal((fs.statSync(path.join(pluginSkill, 'tool/ceci.js')).mode & 0o111) !== 0, true);
});

test('install writes a real skill tree for each harness', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-homes-'));
  const layout = {
    claude: path.join(root, 'claude', 'skills', 'ceci'),
    grok: path.join(root, 'grok', 'skills', 'ceci'),
    codex: path.join(root, 'agents', 'skills', 'ceci'),
    hermes: path.join(root, 'hermes', 'skills', 'software-development', 'ceci'),
  };
  installer.install({ root: ROOT, layout, harnesses: installer.IDS });
  for (const id of ['claude', 'grok', 'codex']) {
    const skill = path.join(layout[id], 'SKILL.md');
    assert.equal(fs.lstatSync(skill).isSymbolicLink(), false, id);
    assert.equal(fs.readFileSync(skill, 'utf8'), fs.readFileSync(path.join(ROOT, 'ceci-skill/SKILL.md'), 'utf8'));
    assert.equal(fs.existsSync(path.join(layout[id], 'tool/ceci.js')), true);
  }
  const hermesSkill = fs.readFileSync(path.join(layout.hermes, 'SKILL.md'), 'utf8');
  assert.deepEqual(hermes.checkFrontmatter(hermesSkill), []);
  assert.equal(fs.existsSync(path.join(layout.hermes, 'scripts/ceci.js')), true);
  assert.equal(fs.existsSync(path.join(layout.hermes, 'tool/ceci.js')), false);
});

test('installed engine runs under an ancestor package.json type module', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-esm-parent-'));
  fs.writeFileSync(path.join(parent, 'package.json'), '{"type":"module"}\n');
  const layout = {
    claude: path.join(parent, 'claude', 'skills', 'ceci'),
    grok: path.join(parent, 'grok', 'skills', 'ceci'),
    codex: path.join(parent, 'agents', 'skills', 'ceci'),
    hermes: path.join(parent, 'hermes', 'skills', 'software-development', 'ceci'),
  };
  installer.install({ root: ROOT, layout, harnesses: installer.IDS });
  for (const file of [
    path.join(layout.grok, 'tool/ceci.js'),
    path.join(layout.claude, 'tool/ceci.js'),
    path.join(layout.codex, 'tool/ceci.js'),
    path.join(layout.hermes, 'scripts/ceci.js'),
  ]) {
    const result = spawnSync(process.execPath, [file], { encoding: 'utf8' });
    assert.equal(result.status, 2, `${file}\n${result.stderr}`);
    assert.match(result.stderr, /usage: ceci/);
  }
});
