'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const CLI = path.join(__dirname, 'ceci.js');
const PREFS = path.join(__dirname, '..', 'examples', 'gpu-prefs.yaml');

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-'));
}

function state(jobs) {
  const lines = ['jobs:'];
  jobs.forEach((job) => {
    lines.push(`  - id: ${job.id}`);
    lines.push(`    goal: ${JSON.stringify(job.goal)}`);
    lines.push(`    owner: ${job.owner}`);
    lines.push(`    depends_on: [${job.depends_on.join(', ')}]`);
    lines.push(`    schedule: ${job.schedule}`);
    lines.push(`    status: ${job.status}`);
    lines.push(`    done_test: ${JSON.stringify(job.done_test)}`);
    lines.push(`    artifact: ${job.artifact}`);
    lines.push(`    gpu: ${job.gpu === null ? 'null' : JSON.stringify(job.gpu)}`);
    lines.push(`    rdapq_gate: ${job.rdapq_gate === null ? 'null' : job.rdapq_gate}`);
  });
  return `${lines.join('\n')}\n`;
}

test('init writes the three templates and will not overwrite them', () => {
  const dir = tmp();
  const created = run(['init', '--work-dir', dir]);
  assert.equal(created.status, 0, created.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'brief.md'), 'utf8'), /set a price/);
  assert.equal(fs.readFileSync(path.join(dir, 'state.md'), 'utf8'), 'jobs: []\n');
  assert.equal(fs.readFileSync(path.join(dir, 'log.md'), 'utf8'), '');
  const again = run(['init', '--work-dir', dir]);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /refusing to overwrite/);
});

test('init fills a missing file and leaves an existing brief untouched', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'brief.md'), 'keep\n');
  const filled = run(['init', '--work-dir', dir]);
  assert.equal(filled.status, 0, filled.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'brief.md'), 'utf8'), 'keep\n');
  assert.equal(fs.readFileSync(path.join(dir, 'state.md'), 'utf8'), 'jobs: []\n');
  assert.equal(fs.readFileSync(path.join(dir, 'log.md'), 'utf8'), '');
  const again = run(['init', '--work-dir', dir]);
  assert.equal(again.status, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'brief.md'), 'utf8'), 'keep\n');
});

test('resolve-gpu picks the highest-priority free match and exports CUDA', () => {
  const dir = tmp();
  assert.equal(run(['init', '--work-dir', dir]).status, 0);
  const chosen = run(['resolve-gpu', '--work-dir', dir, '--gpu-pref', PREFS, '--model', 'model-large']);
  assert.equal(chosen.status, 0, chosen.stderr);
  assert.equal(chosen.stdout, [
    'host-a:0000:01:00.0',
    'CUDA_DEVICE_ORDER=PCI_BUS_ID',
    'CUDA_VISIBLE_DEVICES=0000:01:00.0',
    '',
  ].join('\n'));
  const busy = run([
    'resolve-gpu', '--work-dir', dir, '--gpu-pref', PREFS, '--model', 'model-large',
    '--busy', 'host-a:0000:01:00.0',
  ]);
  assert.equal(busy.stdout.split('\n')[0], 'host-b:0000:02:00.0');
  const miss = run(['resolve-gpu', '--work-dir', dir, '--gpu-pref', PREFS, '--model', 'model-missing']);
  assert.equal(miss.status, 1);
  const noPref = run(['resolve-gpu', '--work-dir', dir, '--model', 'model-large']);
  assert.equal(noPref.status, 2);
});

test('log appends one line and status prints ready, blocked, and gate', () => {
  const dir = tmp();
  run(['init', '--work-dir', dir]);
  const jobs = [
    {
      id: 'score', goal: 'Score the supplied sample', owner: 'self', depends_on: [],
      schedule: 'once', status: 'ready', done_test: 'gate is COMPLETE and the artifact exists',
      artifact: 'score.txt', gpu: null, rdapq_gate: null,
    },
    {
      id: 'offer', goal: 'Prepare an offer', owner: 'self', depends_on: ['score'],
      schedule: 'once', status: 'blocked', done_test: 'a human supplied the missing decision',
      artifact: 'offer.md', gpu: null, rdapq_gate: null,
    },
  ];
  fs.writeFileSync(path.join(dir, 'state.md'), state(jobs));
  assert.equal(fs.existsSync(path.join(dir, 'score.txt')), false);
  const listed = run(['status', '--work-dir', dir]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout, 'ready:\n- score\nblocked:\n- offer\ngate:\n');
  const line = '2026-10-21T02:19Z | score | ready | graph written first';
  assert.equal(run(['log', '--work-dir', dir, '--line', line]).status, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'log.md'), 'utf8'), `${line}\n`);
  assert.equal(run(['log', '--work-dir', dir, '--line', 'a\nb']).status, 2);
});

function engine() {
  if (process.env.RDAPQ && fs.existsSync(process.env.RDAPQ)) return process.env.RDAPQ;
  const found = spawnSync('sh', ['-c', 'command -v rdapq'], { encoding: 'utf8' });
  if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  return null;
}

function completeGate(enginePath) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-rdapq-'));
  const git = (args) => {
    const res = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
  };
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'test']);
  fs.mkdirSync(path.join(repo, 'src'));
  fs.mkdirSync(path.join(repo, 'test'));
  fs.writeFileSync(path.join(repo, 'src', 'n.js'), 'exports.n = 1;\n');
  fs.writeFileSync(path.join(repo, 'test', 'n.test.js'), 'const assert = require("assert"); const { n } = require("../src/n.js"); assert.equal(n, 1);\n');
  git(['add', 'src', 'test']);
  git(['commit', '-q', '-m', 'init']);
  const rdapq = enginePath === 'rdapq' || enginePath.endsWith(`${path.sep}rdapq`)
    ? (args) => spawnSync(enginePath, args, { cwd: repo, encoding: 'utf8' })
    : (args) => spawnSync(process.execPath, [enginePath, ...args], { cwd: repo, encoding: 'utf8' });
  const started = rdapq(['start', '--risk', 'LOW', '--files', 'src/n.js,test/n.test.js', '--run', 'node test/n.test.js', '--no-defect']);
  assert.equal(started.status, 0, started.stderr);
  fs.writeFileSync(path.join(repo, 'src', 'n.js'), 'exports.n = 2;\n');
  fs.writeFileSync(path.join(repo, 'test', 'n.test.js'), 'const assert = require("assert"); const { n } = require("../src/n.js"); assert.equal(n, 2);\n');
  const checked = rdapq(['check']);
  assert.equal(checked.status, 0, checked.stderr);
  const gate = rdapq(['gate']);
  assert.equal(gate.status, 0, gate.stderr);
  return gate.stdout;
}

test('a scoring job stores the rdap-q token and the run stops with a blank price', (t) => {
  const bin = engine();
  if (!bin) {
    t.skip('rdap-q engine not supplied');
    return;
  }
  const gateText = completeGate(bin);
  const token = /Report exactly this terminal state: ([A-Z_]+)/.exec(gateText);
  assert.ok(token, gateText);
  assert.equal(token[1], 'COMPLETE');

  const dir = tmp();
  assert.equal(run(['init', '--work-dir', dir]).status, 0);
  const deadline = '48h';
  fs.writeFileSync(path.join(dir, 'brief.md'), [
    'number: ""',
    'never: ["contact without yes", "set a price", "post or pay without yes"]',
    `deadline: "${deadline}"`,
    'tools: []',
    '',
  ].join('\n'));

  const jobs = [
    {
      id: 'score', goal: 'Score the supplied sample', owner: 'self', depends_on: [],
      schedule: 'once', status: 'ready', done_test: 'rdap-q gate prints COMPLETE and the artifact exists',
      artifact: 'score.txt', gpu: null, rdapq_gate: null,
    },
    {
      id: 'offer', goal: 'Prepare an offer', owner: 'self', depends_on: ['score'],
      schedule: 'once', status: 'blocked', done_test: 'a human supplied the missing decision',
      artifact: 'offer.md', gpu: null, rdapq_gate: null,
    },
  ];
  fs.writeFileSync(path.join(dir, 'state.md'), state(jobs));
  assert.equal(fs.existsSync(path.join(dir, 'score.txt')), false);
  assert.equal(fs.existsSync(path.join(dir, 'offer.md')), false);

  const chosen = run(['resolve-gpu', '--work-dir', dir, '--gpu-pref', PREFS, '--model', 'model-large']);
  assert.equal(chosen.status, 0, chosen.stderr);
  jobs[0].gpu = chosen.stdout.split('\n')[0];
  jobs[0].rdapq_gate = token[1];
  jobs[0].status = 'done';
  fs.writeFileSync(path.join(dir, 'score.txt'), `${gateText}`);
  fs.writeFileSync(path.join(dir, 'state.md'), state(jobs));
  assert.equal(run(['log', '--work-dir', dir, '--line', '2026-10-21T02:19Z | score | done | rdapq_gate COMPLETE']).status, 0);

  jobs[1].status = 'gate';
  fs.writeFileSync(path.join(dir, 'state.md'), state(jobs));
  const hand = 'gate: price\njob: offer\nprice:\n';
  assert.equal(hand.split('\n')[2], 'price:');
  assert.equal(fs.existsSync(path.join(dir, 'offer.md')), false);
  assert.equal(run(['log', '--work-dir', dir, '--line', '2026-10-21T02:20Z | offer | gate | price blank']).status, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'log.md'), 'utf8').trim().split('\n').length, 2);
  assert.equal(run(['status', '--work-dir', dir]).stdout, 'ready:\nblocked:\ngate:\n- offer\n');
  const stored = fs.readFileSync(path.join(dir, 'state.md'), 'utf8');
  assert.match(stored, /rdapq_gate: COMPLETE/);
  assert.doesNotMatch(stored, /price/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'brief.md'), 'utf8'), /notify|qa-bot|@/);
});
