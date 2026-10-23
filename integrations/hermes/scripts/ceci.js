#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const STATUSES = new Set(['ready', 'running', 'blocked', 'done', 'gate']);
const GATES = new Set(['COMPLETE', 'STALLED', 'BLOCKED', 'MISSING_TEST']);
const SCHEDULES = new Set(['once', 'cron']);
const JOB_KEYS = ['id', 'goal', 'owner', 'depends_on', 'schedule', 'status', 'done_test', 'artifact', 'gpu', 'rdapq_gate'];

const BRIEF = [
  'number: ""',
  'never: ["contact without yes", "set a price", "post or pay without yes"]',
  'deadline: ""',
  'tools: []',
  '',
].join('\n');

const STATE = 'jobs: []\n';

const USAGE = `usage: ceci init --work-dir PATH
       ceci status --work-dir PATH
       ceci log --work-dir PATH --line TEXT
       ceci resolve-gpu --work-dir PATH --gpu-pref PATH --model NAME [--busy HOST:DEVICE ...]
Flags take a value as the next argument or as --name=value.
`;

function die(message, code) {
  process.stderr.write(`${message}\n`);
  process.exit(code === undefined ? 2 : code);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!key) die('empty flag');
    let value;
    if (eq !== -1) value = arg.slice(eq + 1);
    else {
      value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) die(`missing value for --${key}`);
      i += 1;
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = [].concat(out[key], value);
    else out[key] = value;
  }
  return out;
}

function list(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function workDir(args) {
  const dir = args['work-dir'];
  if (!dir || Array.isArray(dir)) die('--work-dir is required');
  return dir;
}

function quote(value) {
  if (value === null) return 'null';
  const text = String(value);
  if (text === '') return '""';
  if (/^(null|true|false|once|cron|ready|running|blocked|done|gate|COMPLETE|STALLED|BLOCKED|MISSING_TEST)$/.test(text)) {
    return JSON.stringify(text);
  }
  if (/[:#{}[\],&*!|>%@`"'\n]/.test(text) || /^\s|\s$/.test(text)) return JSON.stringify(text);
  return text;
}

function parseScalar(raw) {
  if (raw === 'null') return null;
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`bad string ${raw}`);
    }
  }
  if (raw.startsWith('[')) return parseFlow(raw);
  if (raw === '') throw new Error('empty scalar');
  return raw;
}

function parseFlow(raw) {
  if (!raw.endsWith(']')) throw new Error(`bad list ${raw}`);
  const inner = raw.slice(1, -1).trim();
  if (inner === '') return [];
  // Split on commas outside double quotes, so a quoted item may hold a comma.
  const parts = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < inner.length; i += 1) {
    if (quoted && inner[i] === '\\') i += 1;
    else if (inner[i] === '"') quoted = !quoted;
    else if (!quoted && inner[i] === ',') {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  if (quoted) throw new Error(`bad list ${raw}`);
  parts.push(inner.slice(start));
  return parts.map((part) => parseScalar(part.trim()));
}

function parseState(text) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  if (lines[0] === 'jobs: []') {
    if (lines.slice(1).some((line) => line.trim() !== '')) throw new Error('jobs: [] must be the only line');
    return [];
  }
  if (lines[0] !== 'jobs:') throw new Error('state.md must start with jobs:');
  const jobs = [];
  let current = null;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const start = /^ {2}- id: (.*)$/.exec(line);
    if (start) {
      if (current) jobs.push(current);
      current = { id: parseScalar(start[1]) };
      continue;
    }
    const field = /^ {4}([a-z_]+):(?: (.*))?$/.exec(line);
    if (!field || !current) throw new Error(`bad state.md line ${i + 1}`);
    try {
      current[field[1]] = parseScalar(field[2] === undefined ? '' : field[2]);
    } catch (err) {
      throw new Error(`state.md line ${i + 1}: ${err.message}`);
    }
  }
  if (current) jobs.push(current);
  jobs.forEach(checkJob);
  checkGraph(jobs);
  return jobs;
}

function checkJob(job) {
  JOB_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(job, key)) throw new Error(`job ${job.id || '?'} missing ${key}`);
  });
  Object.keys(job).forEach((key) => {
    if (!JOB_KEYS.includes(key)) throw new Error(`job ${job.id} has unknown key ${key}`);
  });
  if (typeof job.id !== 'string' || !job.id) throw new Error('job id must be a string');
  ['goal', 'owner', 'done_test', 'artifact'].forEach((key) => {
    if (typeof job[key] !== 'string') throw new Error(`job ${job.id} ${key} must be a string`);
  });
  if (!Array.isArray(job.depends_on) || job.depends_on.some((item) => typeof item !== 'string')) {
    throw new Error(`job ${job.id} depends_on must be a list of strings`);
  }
  if (!SCHEDULES.has(job.schedule)) throw new Error(`job ${job.id} has bad schedule`);
  if (!STATUSES.has(job.status)) throw new Error(`job ${job.id} has bad status`);
  if (job.gpu !== null && typeof job.gpu !== 'string') throw new Error(`job ${job.id} gpu must be null or a string`);
  if (job.rdapq_gate !== null && !GATES.has(job.rdapq_gate)) throw new Error(`job ${job.id} has bad rdapq_gate`);
  if (path.posix.isAbsolute(job.artifact) || path.win32.isAbsolute(job.artifact) || job.artifact.split(/[\\/]/).includes('..')) {
    throw new Error(`job ${job.id} artifact must stay inside the work dir`);
  }
  if (job.artifact.split(/[\\/]/).every((part) => part === '' || part === '.')) {
    throw new Error(`job ${job.id} artifact must name a file or directory, not the work dir`);
  }
}

function checkGraph(jobs) {
  const ids = new Set();
  jobs.forEach((job) => {
    if (ids.has(job.id)) throw new Error(`duplicate job ${job.id}`);
    ids.add(job.id);
  });
  jobs.forEach((job) => {
    job.depends_on.forEach((dep) => {
      if (dep === job.id) throw new Error(`job ${job.id} depends on itself`);
      if (!ids.has(dep)) throw new Error(`job ${job.id} depends on unknown ${dep}`);
    });
  });
  const color = new Map();
  function visit(id) {
    const seen = color.get(id) || 0;
    if (seen === 1) throw new Error('state.md has a cycle');
    if (seen === 2) return;
    color.set(id, 1);
    const job = jobs.find((item) => item.id === id);
    job.depends_on.forEach(visit);
    color.set(id, 2);
  }
  jobs.forEach((job) => visit(job.id));
}

function formatState(jobs) {
  if (!jobs.length) return STATE;
  const lines = ['jobs:'];
  jobs.forEach((job) => {
    lines.push(`  - id: ${quote(job.id)}`);
    JOB_KEYS.slice(1).forEach((key) => {
      const value = key === 'depends_on'
        ? `[${job.depends_on.map((item) => quote(item)).join(', ')}]`
        : quote(job[key]);
      lines.push(`    ${key}: ${value}`);
    });
  });
  return `${lines.join('\n')}\n`;
}

function readState(dir) {
  const file = path.join(dir, 'state.md');
  if (!fs.existsSync(file)) die(`missing ${file}`, 1);
  try {
    return parseState(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    die(err.message, 1);
  }
}

function parsePrefs(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let host = null;
  let sawHosts = false;
  lines.forEach((line, index) => {
    if (line.trim() === '' || line.trim().startsWith('#')) return;
    if (!sawHosts) {
      if (line !== 'hosts:') throw new Error('gpu prefs must start with hosts:');
      sawHosts = true;
      return;
    }
    const hostLine = /^ {2}([A-Za-z0-9._-]+):\s*$/.exec(line);
    if (hostLine) {
      host = hostLine[1];
      return;
    }
    const busLine = /^ {4}"([^"]+)": \{ priority: (-?\d+), models: (\[.*\]) \}$/.exec(line);
    if (!busLine || !host) throw new Error(`bad gpu prefs line ${index + 1}`);
    const models = parseFlow(busLine[3]);
    if (models.some((model) => typeof model !== 'string')) throw new Error(`bad models on line ${index + 1}`);
    entries.push({ host, bus: busLine[1], priority: Number(busLine[2]), models });
  });
  if (!sawHosts) throw new Error('gpu prefs must start with hosts:');
  return entries;
}

function chooseGpu(entries, model, busy) {
  const skipped = new Set(busy);
  const matches = entries.filter((entry) => entry.models.includes(model) && !skipped.has(`${entry.host}:${entry.bus}`));
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    const rank = (entry) => (entry.bus === '*' ? 1 : 0);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.host !== b.host) return a.host < b.host ? -1 : 1;
    if (a.bus !== b.bus) return a.bus < b.bus ? -1 : 1;
    return 0;
  });
  return matches[0] || null;
}

// CUDA_VISIBLE_DEVICES takes an index or a GPU/MIG UUID. It stops at the first
// entry it cannot parse, so a PCI bus id there would hide every device.
function cudaDevice(bus) {
  if (/^\d+$/.test(bus) || /^(GPU|MIG)-[A-Za-z0-9/-]+$/.test(bus)) return bus;
  return null;
}

function graphProblems(dir, jobs) {
  const problems = [];
  const byId = new Map(jobs.map((job) => [job.id, job]));
  jobs.forEach((job) => {
    if ((job.status === 'ready' || job.status === 'running') && job.depends_on.some((id) => byId.get(id).status !== 'done')) {
      problems.push(`${job.id} is ${job.status} with an unfinished dependency`);
    }
    if (job.status === 'done') {
      if (job.rdapq_gate !== null && job.rdapq_gate !== 'COMPLETE') problems.push(`${job.id} is done without COMPLETE`);
      const artifact = path.join(dir, job.artifact);
      if (!fs.existsSync(artifact)) problems.push(`${job.id} is done but ${job.artifact} is missing`);
    }
  });
  return problems;
}

function commandInit(args) {
  const dir = workDir(args);
  fs.mkdirSync(dir, { recursive: true });
  const files = ['brief.md', 'state.md', 'log.md'];
  const existing = files.filter((name) => fs.existsSync(path.join(dir, name)));
  if (existing.length === files.length) die(`refusing to overwrite ${existing.join(', ')}`, 1);
  if (!existing.includes('brief.md')) fs.writeFileSync(path.join(dir, 'brief.md'), BRIEF);
  if (!existing.includes('state.md')) fs.writeFileSync(path.join(dir, 'state.md'), STATE);
  if (!existing.includes('log.md')) fs.writeFileSync(path.join(dir, 'log.md'), '');
}

function commandStatus(args) {
  const dir = workDir(args);
  const jobs = readState(dir);
  const problems = graphProblems(dir, jobs);
  ['ready', 'running', 'blocked', 'gate'].forEach((status) => {
    process.stdout.write(`${status}:\n`);
    jobs.filter((job) => job.status === status).forEach((job) => process.stdout.write(`- ${job.id}\n`));
  });
  if (problems.length) die(problems.join('\n'), 1);
}

function commandLog(args) {
  const dir = workDir(args);
  const file = path.join(dir, 'log.md');
  if (!fs.existsSync(file)) die(`missing ${file}`, 1);
  const line = args.line;
  if (typeof line !== 'string' || Array.isArray(line) || line.length === 0 || /[\r\n]/.test(line)) {
    die('--line must be one non-empty line');
  }
  fs.appendFileSync(file, `${line}\n`);
}

function commandGpu(args) {
  const dir = workDir(args);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) die(`missing work dir ${dir}`, 1);
  const pref = args['gpu-pref'];
  const model = args.model;
  if (!pref || Array.isArray(pref)) die('--gpu-pref is required');
  if (!model || Array.isArray(model)) die('--model is required');
  let entries;
  try {
    entries = parsePrefs(fs.readFileSync(pref, 'utf8'));
  } catch (err) {
    die(err.code === 'ENOENT' ? `missing ${pref}` : err.message, 1);
  }
  const chosen = chooseGpu(entries, model, list(args.busy));
  if (!chosen) die(`no gpu for ${model}`, 1);
  const value = `${chosen.host}:${chosen.bus}`;
  process.stdout.write(`${value}\nCUDA_DEVICE_ORDER=PCI_BUS_ID\n`);
  if (chosen.bus === '*') return;
  const device = cudaDevice(chosen.bus);
  if (device) process.stdout.write(`CUDA_VISIBLE_DEVICES=${device}\n`);
  else {
    process.stderr.write(`${chosen.bus} is a PCI bus id; CUDA_VISIBLE_DEVICES takes an index or UUID. `
      + `On ${chosen.host}, find its index or uuid with: nvidia-smi --query-gpu=index,uuid,pci.bus_id --format=csv\n`);
  }
}

function main(argv) {
  const [command, ...rest] = argv;
  if ([command, ...rest].some((arg) => arg === '--help' || arg === '-h')) {
    process.stdout.write(USAGE);
    return;
  }
  const args = parseArgs(rest);
  if (args._.length) die(`unexpected argument ${args._[0]}`);
  if (command === 'init') commandInit(args);
  else if (command === 'status') commandStatus(args);
  else if (command === 'log') commandLog(args);
  else if (command === 'resolve-gpu') commandGpu(args);
  else {
    die(USAGE.trimEnd());
  }
}

if (require.main === module) {
  // A reader that closes early (status | head) is not an error.
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') process.exit(0);
    throw err;
  });
  main(process.argv.slice(2));
}
else {
  module.exports = { chooseGpu, formatState, parsePrefs, parseState };
}
