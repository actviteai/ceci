#!/usr/bin/env node
'use strict';

/**
 * npm entry point.
 *
 *   ceci install [--all|--claude|--grok|--codex|--hermes]   copy the skill into harness homes
 *   ceci init|status|log|resolve-gpu --work-dir PATH ...     run the skill's tool
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INSTALL = path.join(ROOT, 'scripts', 'install.js');
const TOOL = path.join(ROOT, 'ceci-skill', 'tool', 'ceci.js');

function usage() {
  return `Usage:
  ceci install [--all] [--claude] [--grok] [--codex] [--hermes]
  ceci init|status|log|resolve-gpu --work-dir PATH [...]
  ceci --help | --version
`;
}

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(usage());
    return command ? 0 : 2;
  }
  if (command === '--version' || command === '-v') {
    process.stdout.write(`${require('../package.json').version}\n`);
    return 0;
  }
  const [script, args] = command === 'install' ? [INSTALL, rest] : [TOOL, argv];
  const res = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (res.error) {
    process.stderr.write(`${res.error.message}\n`);
    return 1;
  }
  return res.status === null ? 1 : res.status;
}

process.exit(main(process.argv.slice(2)));
