'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

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

test('npm pack ships the skill, the generated copies, and no tests', () => {
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
    'plugins/ceci/skills/ceci/SKILL.md',
    'integrations/hermes/SKILL.md',
  ]) assert.ok(files.includes(want), `missing ${want}`);
  assert.deepEqual(files.filter((f) => f.endsWith('.test.js')), []);
  assert.deepEqual(files.filter((f) => /^\.(claude|grok|agents|agent|codex|copilot)\//.test(f)), []);
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
  const untracked = JSON.parse(res.stdout)[0].files.map((f) => f.path)
    .filter((rel) => rel !== 'package.json' && !tracked.has(rel));
  assert.deepEqual(untracked, []);
});

test('repository links point at actviteai, not the old coldcanuk repos', () => {
  const res = spawnSync('git', ['grep', '-nE', '(^|[^@])coldcanuk/(ceci|rdapq)', '--', '.', ':!scripts/package.test.js'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.stdout, '', res.stdout);
});

test('.gitignore keeps every agent harness folder out of the repository', () => {
  const ignored = (rel) => spawnSync('git', ['check-ignore', '-q', '--no-index', rel], { cwd: ROOT }).status === 0;
  for (const rel of [
    '.claude/settings.local.json', '.claude/commands/ceci.md', '.claude/skills/ceci/SKILL.md',
    '.grok/rules.md', '.grok/skills/ceci/SKILL.md', '.agents/skills/ceci/SKILL.md',
    '.agent/x', '.codex/x', '.copilot/x', '.ceci/x', '.rdapq/x', '.worktrees/x',
    '.cline/skills/ceci/SKILL.md', '.clinerules', '.clinerules/ceci.md', '.goose/x', '.goosehints',
  ]) assert.equal(ignored(rel), true, `${rel} should be ignored`);
  assert.equal(ignored('.claude-plugin/marketplace.json'), false, 'the plugin marketplace manifest stays tracked');
  const tracked = spawnSync('git', ['ls-files', '.claude', '.grok', '.agents', '.agent', '.codex', '.copilot', '.cline', '.goose', '.clinerules', '.goosehints'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  assert.equal(tracked, '');
  assert.equal(spawnSync('git', ['ls-files', '-ci', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).stdout, '');
});

test('package and plugin manifests name the actvite.com owner', () => {
  const author = { name: 'coldcanuk', email: 'chuck@actvite.com', url: 'https://actvite.com' };
  assert.deepEqual(pkg.author, author);
  const market = require('../.claude-plugin/marketplace.json');
  assert.equal(market.owner.email, author.email);
  assert.deepEqual(market.plugins[0].author, author);
  assert.deepEqual(require('../.claude-plugin/plugin.json').author, author);
  assert.deepEqual(require('../plugins/ceci/plugin.json').author, author);
});

test('package and plugin descriptions match and name every harness', () => {
  const market = require('../.claude-plugin/marketplace.json');
  const descriptions = [pkg.description, market.plugins[0].description, require('../.claude-plugin/plugin.json').description, require('../plugins/ceci/plugin.json').description];
  assert.equal(new Set(descriptions).size, 1);
  for (const word of ['Claude Code', 'Codex', 'Grok', 'Cline', 'Goose', 'Hermes', '/ceci', '/rdap-q']) assert.ok(pkg.description.includes(word), word);
  assert.ok(pkg.description.length <= 350, `${pkg.description.length} characters`);
});

test('README and llms.txt list the same verified install commands', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const llms = fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8');
  for (const cmd of [
    'npx --yes @coldcanuk/ceci install --all',
    '/plugin marketplace add actviteai/ceci',
    '/plugin install ceci@ceci',
    'codex plugin marketplace add actviteai/ceci',
    'codex plugin add ceci@ceci',
    'grok plugin install actviteai/ceci#plugins/ceci',
    'npx --yes @coldcanuk/ceci install --cline',
    'npx --yes @coldcanuk/ceci install --goose',
  ]) {
    assert.ok(readme.includes(cmd), `README missing ${cmd}`);
    assert.ok(llms.includes(cmd), `llms.txt missing ${cmd}`);
  }
  assert.ok(readme.includes('npx --yes github:actviteai/ceci install --all'));
  assert.ok(readme.includes('hermes skills install https://raw.githubusercontent.com/actviteai/ceci/main/integrations/hermes/SKILL.md'));
});
