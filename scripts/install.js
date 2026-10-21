'use strict';

/**
 * Copy ceci into the skill directories Hermes, Claude Code, Grok, and Codex read.
 * Writes real files. Never follows or publishes a symlink.
 *
 *   node scripts/install.js --all
 *   node scripts/install.js --claude --grok --codex --hermes
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const hermes = require('../lib/hermes');
const sync = require('./sync-integrations');

const IDS = ['claude', 'grok', 'codex', 'hermes'];

function exists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
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
  if ((st.mode & 0o111) !== 0) fs.chmodSync(dest, 0o755);
}

function publish(src, dest) {
  const parent = path.dirname(dest);
  fs.mkdirSync(parent, { recursive: true });
  const staging = path.join(parent, `.${path.basename(dest)}.staging-${process.pid}`);
  fs.rmSync(staging, { recursive: true, force: true });
  copyReal(src, staging);
  if (!exists(path.join(staging, 'SKILL.md'))) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error(`staged copy is missing SKILL.md (${src})`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(staging, dest);
}

function layoutFrom(env, platform = process.platform) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const hermesHome = env.HERMES_HOME
    || (platform === 'win32'
      ? path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'hermes')
      : path.join(home, '.hermes'));
  return {
    claude: path.join(env.CLAUDE_HOME || path.join(home, '.claude'), 'skills', 'ceci'),
    grok: path.join(env.GROK_HOME || path.join(home, '.grok'), 'skills', 'ceci'),
    codex: path.join(env.CODEX_HOME || env.AGENTS_HOME || path.join(home, '.agents'), 'skills', 'ceci'),
    hermes: path.join(hermesHome, 'skills', hermes.CATEGORY, hermes.NAME),
  };
}

function stageHermes(root) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceci-hermes-'));
  for (const [rel, file] of sync.targets(root)[0].files) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.text);
  }
  return dir;
}

function install({ root, layout, harnesses, log = () => {} }) {
  const skill = path.join(root, 'ceci-skill');
  if (!exists(path.join(skill, 'SKILL.md'))) throw new Error(`missing ${skill}`);
  const installed = [];
  for (const id of harnesses) {
    if (!IDS.includes(id)) throw new Error(`unknown harness ${id}`);
    const dest = layout[id];
    if (id === 'hermes') {
      const staged = stageHermes(root);
      try {
        publish(staged, dest);
      } finally {
        fs.rmSync(staged, { recursive: true, force: true });
      }
    } else {
      publish(skill, dest);
    }
    log(`${id}: ${dest}`);
    installed.push({ id, dest });
  }
  return installed;
}

function parseArgs(argv) {
  const flags = { help: false, harnesses: [] };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--all') flags.harnesses = IDS.slice();
    else if (arg.startsWith('--') && IDS.includes(arg.slice(2))) {
      const id = arg.slice(2);
      if (!flags.harnesses.includes(id)) flags.harnesses.push(id);
    } else throw new Error(`unknown option: ${arg}`);
  }
  return flags;
}

function helpText() {
  return `Usage: node scripts/install.js [--all] [--claude] [--grok] [--codex] [--hermes]

Copy the ceci skill into the directory each harness reads.
Existing skill directories are replaced with a fresh copy.

  --claude   ~/.claude/skills/ceci          (or $CLAUDE_HOME/skills/ceci)
  --grok     ~/.grok/skills/ceci            (or $GROK_HOME/skills/ceci)
  --codex    ~/.agents/skills/ceci          (or $CODEX_HOME/skills/ceci, else $AGENTS_HOME)
  --hermes   ~/.hermes/skills/software-development/ceci
  --all      all four
`;
}

if (require.main === module) {
  try {
    const flags = parseArgs(process.argv.slice(2));
    if (flags.help || flags.harnesses.length === 0) {
      process.stdout.write(helpText());
      process.exit(flags.help ? 0 : 2);
    }
    install({
      root: path.resolve(__dirname, '..'),
      layout: layoutFrom(process.env),
      harnesses: flags.harnesses,
      log: (line) => process.stdout.write(`${line}\n`),
    });
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { IDS, install, layoutFrom };
