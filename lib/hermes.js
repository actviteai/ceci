'use strict';

/**
 * Hermes Agent render of the ceci skill.
 *
 * Hermes reads SKILL.md frontmatter and registers /<name>. The index shows
 * the first 57 characters of the description, so the first sentence must fit.
 * A URL install (`hermes skills install <raw SKILL.md>`) copies only files
 * the body names under scripts/, references/, templates/, assets/, or examples/.
 * Hermes expands ${HERMES_SKILL_DIR} before the model reads the body.
 * disable-model-invocation is Claude Code only; Hermes should load on the trigger.
 */

const CATEGORY = 'software-development';
const NAME = 'ceci';
const VERSION = '1.0.0';
const INDEX_CHARS = 57;
const PLATFORMS = ['linux', 'macos', 'windows'];
const TRIGGER = 'Use when the user invokes /ceci.';
const DESCRIPTION = `${TRIGGER} It keeps the job graph, stops before a price, and calls /rdap-q for evidence.`;
const SKILL_DIR = '${HERMES_SKILL_DIR}';

function frontmatter() {
  return [
    '---',
    `name: ${NAME}`,
    `description: ${JSON.stringify(DESCRIPTION)}`,
    `version: ${VERSION}`,
    `platforms: [${PLATFORMS.join(', ')}]`,
    'metadata:',
    '  hermes:',
    '    tags: [job-graph, human-gates, gpu, rdap-q]',
    '    requires_toolsets: [terminal]',
    '---',
    '',
  ].join('\n');
}

function split(skillMd) {
  const text = String(skillMd).replace(/\r\n/g, '\n');
  const match = /^---\n[\s\S]*?\n---\n/.exec(text);
  if (!match) throw new Error('SKILL.md has no frontmatter');
  return text.slice(match[0].length);
}

function renderHub(skillMd) {
  let body = split(skillMd)
    .replace(/\btool\/ceci\.js\b/g, 'scripts/ceci.js')
    .replace(/\bplaybooks\//g, 'references/');
  const tool = 'The skill uses `scripts/ceci.js` (zero-dependency Node):';
  if (!body.includes(tool)) throw new Error('SKILL.md no longer names tool/ceci.js in the CLI section');
  body = body.replace(
    tool,
    `The skill uses \`scripts/ceci.js\` (zero-dependency Node). Run \`node ${SKILL_DIR}/scripts/ceci.js\`.`,
  );
  const last = '- `references/rdapq.md` — when and how to call /rdap-q, how to store the gate.\n';
  if (!body.includes(last)) throw new Error('SKILL.md playbook list changed');
  body = body.replace(last, `${last}- \`examples/gpu-prefs.yaml\` — preference-file shape; no real hostnames.\n`);
  return frontmatter() + body;
}

function checkFrontmatter(skillMd) {
  const problems = [];
  const text = String(skillMd).replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return ['SKILL.md has no frontmatter'];
  const top = {};
  for (const line of match[1].split('\n')) {
    const field = /^([a-z][\w-]*):(?: (.*))?$/.exec(line);
    if (field) top[field[1]] = field[2] === undefined ? '' : field[2];
    else if (!/^ {2,}[a-z_]+:/.test(line)) problems.push(`unexpected frontmatter line: ${line}`);
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(top.name || '') || (top.name || '').length > 64) {
    problems.push(`invalid name: ${JSON.stringify(top.name || '')}`);
  }
  let description = '';
  try {
    description = JSON.parse(top.description || '');
  } catch {
    problems.push('description must be a double-quoted string');
  }
  if (typeof description !== 'string' || !description) problems.push('description is empty');
  else {
    if (description.length > 1024) problems.push(`description is ${description.length} characters; Hermes allows 1024`);
    const first = description.split(/(?<=\.) /)[0];
    if (first.length > INDEX_CHARS) problems.push(`the first sentence of description is ${first.length} characters; Hermes shows ${INDEX_CHARS}`);
  }
  if ('disable-model-invocation' in top) problems.push('disable-model-invocation is Claude Code only');
  if (top.version !== VERSION) problems.push(`version is ${top.version}, expected ${VERSION}`);
  const platforms = /^\[(.*)\]$/.exec(top.platforms || '');
  if (!platforms || platforms[1].split(',').map((item) => item.trim()).some((item) => !PLATFORMS.includes(item))) {
    problems.push(`platforms must be a list of ${PLATFORMS.join(', ')}`);
  }
  for (const needle of ['scripts/ceci.js', 'references/graph.md', 'references/gates.md', 'references/gpu.md', 'references/rdapq.md', 'examples/gpu-prefs.yaml', SKILL_DIR]) {
    if (!text.includes(needle)) problems.push(`Hermes SKILL.md does not name ${needle}`);
  }
  return problems;
}

module.exports = {
  CATEGORY,
  DESCRIPTION,
  INDEX_CHARS,
  NAME,
  TRIGGER,
  VERSION,
  checkFrontmatter,
  renderHub,
};
