# ceci

[![npm](https://img.shields.io/npm/v/@actvite/ceci.svg)](https://www.npmjs.com/package/@actvite/ceci)
[![ci](https://github.com/actviteai/ceci/actions/workflows/ci.yml/badge.svg)](https://github.com/actviteai/ceci/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

**ceci is an agent skill for Claude Code, Codex, Grok, Cline, Goose, and Hermes that turns a goal into a job graph and runs it with human-in-the-loop gates.** It writes every job to `state.md` before work starts, runs ready jobs in dependency order, stops for a human before contact, posting, payment, or pricing, places GPU jobs from a preference file, and accepts a code, data, or model change only when the [`/rdap-q`](https://github.com/actviteai/rdapq) evidence gate prints `COMPLETE`.

```bash
npx --yes @actvite/ceci install --all     # install the skill for every harness
```

```text
/ceci <goal> --work-dir ./run                # invoke it in your agent
```

Zero dependencies. Node.js 22+. GPL-3.0-or-later.

`/ceci` is the parent skill for a job graph. It decomposes a goal into jobs, writes that graph before any work starts, schedules the jobs whose dependencies are done, places local GPU work from a preference file you supply, and stops for a human before contact, posting, payment, or a price.

It does not grade its own code, data, or scoring jobs. Those jobs call [`/rdap-q`](https://github.com/actviteai/rdapq) and store the gate token that engine prints. `COMPLETE` is the only token that can finish them.

ceci is standalone. It contains no bot names, project names, hostnames, or environment paths. Anything outside the skill arrives by flag or file on that invocation. If a flag is omitted, the run does not invent the value and does not mention an agent you did not name.

The instruction source is [`ceci-skill/SKILL.md`](ceci-skill/SKILL.md). This file is the operator's manual. The playbooks are the rules an agent reads while a run is in progress.

## What a run is allowed to decide

| Decision | Who decides |
| --- | --- |
| Job split, order, done test, artifact path | The skill, written into `state.md` before work starts |
| Whether code, data, or a model change is finished | `/rdap-q`, not the model |
| Which local GPU runs a named model | `ceci resolve-gpu`, from the file passed as `--gpu-pref` |
| Contact, post, pay, or a price | You. The run stops with the price line empty |

Out of scope:

- Replacing RDAP-Q's oracles or rewriting a gate token into a softer word.
- Storing secrets, API keys, or tokens in the work directory.
- Probing a machine for GPUs. Busy devices are only the ones you pass with `--busy`.
- Hardcoding another skill, host, or project into the graph.

## Repository layout

```text
ceci/
├── AGENTS.md                         # git rule for agents: never commit on main
├── README.md
└── ceci-skill/
    ├── SKILL.md                      # loaded on /ceci
    ├── examples/gpu-prefs.yaml       # shape only; no real hostnames
    ├── playbooks/
    │   ├── graph.md                  # schema, transitions, dependencies, log line
    │   ├── gates.md                  # human stops, blank price, hand-back
    │   ├── gpu.md                    # preference file, CUDA env, fallback
    │   └── rdapq.md                  # when to call /rdap-q and what may be stored
    └── tool/
        ├── ceci.js                   # zero-dependency CLI
        └── ceci.test.js
```

The repository commits no `.claude/`, `.agents/`, `.grok/`, `.cline/`, `.goose/`, `.clinerules`, or `.goosehints`; those are local to each machine and ignored. `ceci install` copies `ceci-skill/` into each harness's user skill directory (see [Harnesses](#harnesses)). Copy the `ceci-skill` directory next to `rdap-q-skill` when a harness wants both trees side by side. Do not rename the skill inside `SKILL.md`; the slash command is the frontmatter name `ceci`.

## Requirements

- Node.js 22 or newer. `ceci-skill/tool/ceci.js` has no package dependencies. `ceci-skill/package.json` sets `"type": "commonjs"` so that file still runs when an ancestor `package.json` sets `"type": "module"`.
- Git, only if you are changing this repository. See [AGENTS.md](AGENTS.md).
- `/rdap-q` available to the same harness when a job changes code, data, a pipeline, or a model. A `rdapq` binary on `PATH` is the same engine. ceci does not embed a path to it.

## Install

Pick one route. Each installs the same skill. `/ceci` is the slash command in every harness except Goose, which loads it with `/skills ceci` or when you ask for ceci by name.

### npm (all harnesses)

The npm package is [`@actvite/ceci`](https://www.npmjs.com/package/@actvite/ceci). It installs one command, `ceci`.

```bash
# Copy the skill into every harness home (Claude Code, Grok, Codex, Cline, Goose, Hermes)
npx --yes @actvite/ceci install --all

# Or name the harnesses you want
npx --yes @actvite/ceci install --claude --codex
npx --yes @actvite/ceci install --cline
npx --yes @actvite/ceci install --goose

# Or install the CLI globally
npm install -g @actvite/ceci
ceci install --all
ceci init --work-dir ./run
ceci status --work-dir ./run
```

`ceci install` replaces an existing ceci skill directory with a fresh copy. Each copy is staged first and renamed into place only after `SKILL.md` is present. Where each harness's copy lands is listed under [Harnesses](#harnesses). Every other `ceci` command (`init`, `status`, `log`, `resolve-gpu`) goes to `ceci-skill/tool/ceci.js`; see [CLI](#cli).

The same commands work straight from GitHub, without the npm registry:

```bash
npx --yes github:actviteai/ceci install --all
```

### Plugin marketplaces

This repository is also a plugin marketplace named `ceci`, holding one plugin named `ceci` ([plugins/ceci](plugins/ceci)).

Claude Code, inside a session:

```text
/plugin marketplace add actviteai/ceci
/plugin install ceci@ceci
```

Codex:

```bash
codex plugin marketplace add actviteai/ceci
codex plugin add ceci@ceci
```

Grok:

```bash
grok plugin install actviteai/ceci#plugins/ceci
```

### Hermes from a URL

```bash
hermes skills install https://raw.githubusercontent.com/actviteai/ceci/main/integrations/hermes/SKILL.md
```

### From a clone

```bash
git clone https://github.com/actviteai/ceci.git
cd ceci
node scripts/install.js --all     # or: npm run install:all
```

### Also install `/rdap-q`

Jobs that change code, data, or a model call `/rdap-q`. Install it in the same harness by following the [rdapq README](https://github.com/actviteai/rdapq#readme). Jobs that only produce documents or human gates run without it.

## Invoke `/ceci`

```text
/ceci <goal> \
  --work-dir /path/to/run \
  --gpu-pref /path/to/gpu-prefs.yaml \
  --notify-bot <agent-id> \
  --qa-bot <agent-id> \
  --deadline 48h
```

The goal is the only positional text. Everything else is a flag or a file.

| Flag | Required | Effect when present | Effect when absent |
| --- | --- | --- | --- |
| `--work-dir PATH` | Always | Directory for `brief.md`, `state.md`, and `log.md` | The run cannot start |
| `--gpu-pref PATH` | If any job sets `gpu` | Preference map for `ceci resolve-gpu` | No host is assumed. A GPU job does not start |
| `--notify-bot ID` | No | Status lines may be posted to that agent id | Nobody is notified, and no agent is named |
| `--qa-bot ID` | No | A quality check may be requested from that agent id | No check is requested, and no agent is named |
| `--deadline TIME` | No | Recorded in `brief.md` and shown when the run reports status | No deadline is invented |

`--deadline` accepts whatever clock text you pass (`48h`, `2026-10-22T18:00Z`). The skill stores that string. It does not convert time zones on its own.

There is no `--price` flag.

## Work directory

`ceci init --work-dir PATH` creates the directory if needed and writes any missing file among `brief.md`, `state.md`, and `log.md`. It does not overwrite a file that already exists. If all three exist, init exits `1` and leaves them untouched.

### `brief.md`

Read first on every run. Init writes:

```yaml
number: ""
never: ["contact without yes", "set a price", "post or pay without yes"]
deadline: ""
tools: []
```

| Field | Meaning |
| --- | --- |
| `number` | Optional label you supply (a ticket id, a batch id). It is **not** a price. Init leaves it empty. |
| `never` | Stops the run must not delete. Contact, price, and post-or-pay require an explicit yes. |
| `deadline` | Empty unless this invocation passed `--deadline`. |
| `tools` | Tools you listed for this run. Empty means the run does not assume a toolkit. |

Do not put secrets in `brief.md`.

### `state.md`

The job graph. On a new goal the skill writes the **complete** graph before it creates any artifact. Init writes `jobs: []`.

```yaml
jobs:
  - id: string
    goal: string
    owner: string
    depends_on: [string]
    schedule: once | cron
    status: ready | running | blocked | done | gate
    done_test: string
    artifact: path
    gpu: null | "host:device"
    rdapq_gate: null | COMPLETE | STALLED | BLOCKED | MISSING_TEST
```

The CLI accepts only this subset:

- The file is `jobs: []` or starts with `jobs:`.
- Each job starts with two spaces, a dash, and `id`. Later keys are indented four spaces, in the order above.
- Lists are flow lists: `[]` or `[score, offer]`.
- A plain value is read as written, spaces and colons included. Use a double-quoted, JSON-escaped string for a value that is empty, is the word `null`, starts with `"` or `[`, or is a list item that contains a comma. `ceci` itself quotes more often so the file stays valid YAML: `gpu: "host-a:GPU-00000000-0000-0000-0000-00000000000a"`.
- `gpu: null` and `rdapq_gate: null` are the empty values.
- `artifact` is relative to `--work-dir` and names something inside it. Absolute paths (POSIX or Windows), `..`, and the work dir itself (`""`, `.`) are rejected.
- Unknown keys are rejected. There is no `price` key. Adding one makes `ceci status` fail.

`owner` is an id you supplied for that job, or `self`. `schedule` is `once` or `cron`. A cron expression is not a separate field; put the cadence in `goal` or `done_test` if the job needs it.

### `log.md`

Append-only. A run is one job status change, and that change gets exactly one line:

```text
YYYY-MM-DDTHH:MMZ | job_id | status | note
```

Example:

```text
2026-10-21T02:20Z | offer | gate | price blank
```

Use `ceci log`. Do not append a second line for the same change, and do not write paragraphs into the file. Init creates `log.md` empty.

## CLI

Run it as `ceci` after `npm install -g @actvite/ceci`, as `npx --yes @actvite/ceci <command>`, or with Node from a checkout or an installed skill directory:

```bash
node ceci-skill/tool/ceci.js <command> --work-dir PATH
```

Every flag takes its value as the next argument or as `--name=value`. Use the second form for a value that starts with `--`. `--help` on any command prints the usage and exits `0`.

The skill refers to that command as `ceci`. Prefer the CLI over hand-editing when the command exists. The graph itself is still written as `state.md`; there is no `ceci add-job` command. Write the graph in the subset above, then use `status` to check it.

### `init`

```bash
node ceci-skill/tool/ceci.js init --work-dir /path/to/run
```

Creates `brief.md`, `state.md`, and `log.md`. Refuses to overwrite.

### `status`

```bash
node ceci-skill/tool/ceci.js status --work-dir /path/to/run
```

Prints stored jobs in four groups. A `running` job after an interrupted session is the one to resume. `done` jobs are not listed; they remain in `state.md`.

```text
ready:
- score
running:
blocked:
- offer
gate:
```

Exits `1` when the graph is inconsistent:

- a `ready` or `running` job still has a dependency that is not `done`
- a `done` job's artifact is missing
- a `done` job has `rdapq_gate` set to anything other than `COMPLETE` (`null` is allowed only for jobs that never needed a gate)

### `resolve-gpu`

```bash
node ceci-skill/tool/ceci.js resolve-gpu \
  --work-dir /path/to/run \
  --gpu-pref /path/to/gpu-prefs.yaml \
  --model model-large \
  --busy host-b:1
```

`--work-dir` must be an existing directory. `--gpu-pref` and `--model` are required. Repeat `--busy` for each occupied device. The command does not call `nvidia-smi` and does not read a default path.

Stdout when the winner is a UUID or an index:

```text
host-a:GPU-00000000-0000-0000-0000-00000000000a
CUDA_DEVICE_ORDER=PCI_BUS_ID
CUDA_VISIBLE_DEVICES=GPU-00000000-0000-0000-0000-00000000000a
```

The first line is what you store in the job's `gpu` field before that job runs. Export the other lines into the environment of the local process.

If the winner is the `*` entry, stdout is:

```text
host-a:*
CUDA_DEVICE_ORDER=PCI_BUS_ID
```

`CUDA_VISIBLE_DEVICES` is omitted. `*` means any device on that host, not a device the tool invented.

A PCI bus id key (`"0000:01:00.0"`) prints the first two lines only. CUDA reads `CUDA_VISIBLE_DEVICES` as indices or UUIDs and hides every device from the first entry it cannot parse, so a bus id there would leave the job with no GPU. stderr names the `nvidia-smi --query-gpu=index,uuid,pci.bus_id --format=csv` call that maps it on that host. Prefer UUID keys.

Selection order:

1. Keep entries whose `models` list contains the model name exactly.
2. Drop entries named by `--busy` as `HOST:DEVICE` (split on the first colon, so a device may contain colons).
3. Highest `priority` wins.
4. Equal priority: a specific device beats `*`, then hostname, then device, in byte order.

No match exits `1` and the GPU job does not start.

[`ceci-skill/examples/gpu-prefs.yaml`](ceci-skill/examples/gpu-prefs.yaml) shows the shape with stand-in names (`host-a`, `model-large`). Do not point a real run at it unless you passed that path yourself.

### `log`

```bash
node ceci-skill/tool/ceci.js log \
  --work-dir /path/to/run \
  --line '2026-10-21T02:20Z | offer | gate | price blank'
```

Appends that text plus one newline. `--line` must already be a single non-empty line; the CLI does not add a timestamp or a job id. `log.md` must already exist (`init` creates it).

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The command finished |
| `1` | The files or the graph refused the request (missing file, no GPU, overwrite, inconsistent status) |
| `2` | Usage: unknown command, missing flag, extra argument, or a log line that contains a newline |

## How a goal becomes jobs

On a new goal the skill decomposes it into the smallest jobs that each produce one inspectable artifact. It writes every job into `state.md` before creating any of those artifacts.

Each job needs:

| Field | What to put there |
| --- | --- |
| `id` | Stable short name. Other jobs use it in `depends_on`. |
| `goal` | One outcome, not a diary of the steps. |
| `owner` | `self`, or an id that arrived by flag or file. |
| `depends_on` | Ids that must already be `done`. No self-dependency. The graph must be acyclic. |
| `schedule` | `once` or `cron`. |
| `status` | One of the five values below. |
| `done_test` | A check a later run can apply without rereading the chat. |
| `artifact` | Relative path that will exist when the job is done. |
| `gpu` | `null`, or `host:device` from `resolve-gpu`. |
| `rdapq_gate` | `null` until `/rdap-q` prints a terminal token. |

Dependencies:

- `ready` and `running` are legal only when every dependency is `done`.
- Otherwise the job is `blocked`.
- If the next action is a human gate, the status is `gate` instead of `ready`.

Status transitions:

| From | To | When |
| --- | --- | --- |
| `blocked` | `ready` | Every dependency is `done` and the next action is not a human gate |
| `ready` | `running` | The job has started |
| `running` | `done` | The done test passed and the artifact exists. Code, data, or model jobs also need `rdapq_gate: COMPLETE` |
| `running` | `gate` | The next action is contact, post, pay, or a price. Stop. Do not invent the answer |
| `running` | `blocked` | Something external is missing and it is not a human gate |
| `gate` | `gate` | The human has not answered |
| `done` | — | Terminal. Never jump from `blocked` straight to `done` |

After each status change, update `state.md` and append one log line. If another job is `ready`, it may start. A run ends when the next action is a human gate, the deadline is reached, or no ready jobs remain.

## Human gates

The `never` list in `brief.md` is binding:

- do not contact anyone without an explicit yes
- do not set a price
- do not post or pay without an explicit yes

The run stops and hands back **before** the action. It does not draft the message, publish it, move money, or fill in an amount "so you only have to approve it."

Hand-back shapes:

```text
gate: price
job: <job-id>
price:
```

```text
gate: contact
job: <job-id>
```

```text
gate: post
job: <job-id>
```

```text
gate: pay
job: <job-id>
```

If the run is carrying a claim nobody checked, add `claim: UNVERIFIED`. Omit that line when there is nothing to mark. Then append one log line with status `gate`.

`UNVERIFIED` stays until a flag, a file, or a command output from this run checks it. Familiarity is not a check.

## Price

You do not configure a price. Nothing in the flags, the CLI, or `state.md` stores an amount.

`number` in `brief.md` is not a price. A job has no `price` field. `ceci status` rejects unknown keys, so a price cannot be hidden on the job. The playbook also forbids a filled amount anywhere in `state.md`: the model must not estimate, round, or copy a number from memory.

When a job would name an amount (an offer, a quote, a fee), the skill sets that job to `status: gate` and stops with the price line empty:

```text
gate: price
job: offer
price:
```

The offer artifact is not created yet. `ceci status` lists the job under `gate:`. The log line records the stop, for example `2026-10-21T02:20Z | offer | gate | price blank`.

What you do next:

1. Read the hand-back. The blank `price:` line is the question.
2. Reply with the amount, or refuse. Silence is not a price. A refusal is not a price.
3. Invoke `/ceci` again on the same `--work-dir`.

On that later invocation the job is still `gate` until you have stated the decision. There is no resume command and no `--price` flag.

- If your message states the amount, that sentence is the supplied decision. The offer artifact may contain **that exact text** and nothing the model added. The job can then move to `done` when its done test passes and the artifact exists.
- The amount still does not go into `state.md`.
- If you do not state an amount, the job stays `gate` and the artifact stays absent.

Pricing is not an RDAP-Q job. Do not call `/rdap-q` to justify a number.

## GPU jobs

Read [`ceci-skill/playbooks/gpu.md`](ceci-skill/playbooks/gpu.md) when a job sets `gpu`.

Preference file:

```yaml
hosts:
  hostname:
    "device-or-*": { priority: int, models: [string] }
```

Hostnames match `[A-Za-z0-9._-]+`. Quote every device key: a GPU or MIG UUID from `nvidia-smi -L` (preferred), an integer index in PCI bus order, a PCI bus id, or `*`. `priority` is an integer. `models` is a flow list of exact model names.

```yaml
hosts:
  host-a:
    "GPU-00000000-0000-0000-0000-00000000000a": { priority: 10, models: ["model-large"] }
    "*": { priority: 1, models: ["model-small"] }
  host-b:
    "1": { priority: 5, models: ["model-large", "model-small"] }
```

For `model-large` with nothing busy, the winner is `host-a:GPU-00000000-0000-0000-0000-00000000000a` (priority 10). If that device is passed as `--busy host-a:GPU-00000000-0000-0000-0000-00000000000a`, the winner is `host-b:1` (priority 5). `host-a:*` is only a `model-small` fallback at priority 1, and it does not set `CUDA_VISIBLE_DEVICES`.

Record the chosen `host:device` on the job, export the CUDA lines for the local process, and mention the choice in that job's one log line.

## `/rdap-q`

Read [`ceci-skill/playbooks/rdapq.md`](ceci-skill/playbooks/rdapq.md).

Call `/rdap-q` when the job changes code, data, a pipeline, or a model. Scoring is one of those jobs. Do not call it for a human gate. Do not replace its oracles, and do not mark the job done because the change "looks right."

Store only the terminal token the gate prints:

| Token | What ceci does |
| --- | --- |
| `COMPLETE` | The only token that may accompany `status: done`, and only if the done test passed and the artifact exists |
| `STALLED` | Record it. The job is not done |
| `BLOCKED` | Record it. The job is not done |
| `MISSING_TEST` | Record it. The job is not done |
| `CONTINUE` | Not terminal. Run the RDAP-Q loop again. Do not store this word |
| anything else | Do not store it. Leave `rdapq_gate: null`. Do not mark the job done |

Copy the token as printed. Do not shorten a paragraph into a different word. The engine's own line `Report exactly this terminal state: COMPLETE` yields the token `COMPLETE`.

The sibling skill is `rdap-q` in [actviteai/rdapq](https://github.com/actviteai/rdapq). ceci does not vendor that engine.

## Worked run

Goal: score a sample, then prepare an offer. Flags: `--work-dir`, `--gpu-pref`, `--deadline 48h`. No notify bot and no QA bot.

1. `ceci init` writes the three files. Put `48h` into `brief.md` `deadline` because the flag was passed. Leave `number` and `tools` empty. Leave `never` as init wrote it.
2. Write the whole graph before any artifact exists. `score` is `ready`. `offer` depends on `score` and is `blocked`. Both artifacts are absent. `rdapq_gate` is `null`. `gpu` is `null`.

```yaml
jobs:
  - id: score
    goal: Score the supplied sample
    owner: self
    depends_on: []
    schedule: once
    status: ready
    done_test: rdap-q gate prints COMPLETE and the artifact exists
    artifact: score.txt
    gpu: null
    rdapq_gate: null
  - id: offer
    goal: Prepare an offer
    owner: self
    depends_on: [score]
    schedule: once
    status: blocked
    done_test: a human supplied the missing decision
    artifact: offer.md
    gpu: null
    rdapq_gate: null
```

3. `ceci resolve-gpu --model <the model name you passed>`. Store the first stdout line on `score.gpu` and export the CUDA variables for the local job.
4. Run the scoring job under `/rdap-q`. Store the terminal token. Only `COMPLETE` allows `score` to become `done`, and only after `score.txt` exists. Append one log line for that status change.
5. `offer` is now unblocked, but its next action is a price. Set `status: gate`. Do not create `offer.md`. Do not write an amount. Hand back:

```text
gate: price
job: offer
price:
```

6. Append one log line: `… | offer | gate | price blank`. Stop.

`ceci status` then prints:

```text
ready:
blocked:
gate:
- offer
```

A later invocation continues only from that gate, and only with a price you actually wrote in the new request.

## Tests

```bash
npm test
```

`npm test` checks that the generated harness copies match `ceci-skill/`, then runs `ceci-skill/tool/ceci.test.js`, `scripts/harness.test.js`, and `scripts/package.test.js`. The package test covers the `ceci` bin, the npm `files` list, that a dirty checkout cannot pack untracked files, and that agent harness folders stay ignored.

`ceci-skill/tool/ceci.test.js` checks init, GPU priority, `--busy`, and the CUDA lines it may print, one-line logs, `status` grouping, `state.md` round trips, and flag parsing. The scoring scenario calls a real RDAP-Q engine when `RDAPQ` points at `rdapq.js` or when `rdapq` is on `PATH`. That scenario requires the stored token to be `COMPLETE`, requires `offer.md` to be absent, and requires `state.md` not to contain a price. Without an engine the scenario is skipped; the other tests still run. CI checks out a pinned `actviteai/rdapq` and sets `CECI_REQUIRE_RDAPQ=1`, which turns that skip into a failure.

## Harnesses

The same skill loads in Claude Code, Grok, Codex, Cline, Goose, and Hermes. Generated trees are real files. Codex and Grok copy a plugin without following a symlink that points out of it, and a Hermes URL install does not follow symlinks either.

| Harness | `ceci install` writes |
| --- | --- |
| Claude Code (`--claude`) | `$CLAUDE_HOME/skills/ceci` or `~/.claude/skills/ceci` |
| Grok (`--grok`) | `$GROK_HOME/skills/ceci` or `~/.grok/skills/ceci` |
| Codex (`--codex`) | `$CODEX_HOME/skills/ceci`, else `$AGENTS_HOME/skills/ceci`, else `~/.agents/skills/ceci` |
| Cline (`--cline`) | `$CLINE_HOME/skills/ceci` or `~/.cline/skills/ceci` |
| Goose (`--goose`) | `$AGENTS_HOME/skills/ceci` or `~/.agents/skills/ceci`, the folder Codex uses by default |
| Hermes (`--hermes`) | `$HERMES_HOME/skills/software-development/ceci` or `~/.hermes/skills/software-development/ceci`, from [integrations/hermes](integrations/hermes) |

Claude Code, Codex, and Grok can also install the marketplace plugin; the commands are under [Plugin marketplaces](#plugin-marketplaces). [.claude-plugin/marketplace.json](.claude-plugin/marketplace.json) points at [plugins/ceci](plugins/ceci), whose `skills/ceci` directory is a byte copy of `ceci-skill/`, not a symlink.

Cline and Goose have no plugin marketplace route; use `ceci install --cline` or `--goose`. Cline enables discovered skills by default (toggle them under the Skills tab) and runs ceci as `/ceci`. Goose loads skills through its built-in Skills extension, which is on by default; type `/skills ceci` in the Goose CLI or ask for ceci by name. Both also read a project's `.claude/skills/`, and Goose reads `.agents/skills/`, so a project-level copy works too.

The [Hermes URL install](#hermes-from-a-url) copy drops Claude's `disable-model-invocation` key, keeps the first sentence of the description inside Hermes' 57-character index, and names `scripts/ceci.js`, `references/*.md`, and `examples/gpu-prefs.yaml` so the installer fetches them. The slash command is `/ceci`.

After a change to `ceci-skill/`, regenerate the copies and fail if they drift:

```bash
node scripts/sync-integrations.js
node scripts/sync-integrations.js --check
```

## Agents changing this repository

[AGENTS.md](AGENTS.md) is the git rule. Do not commit on `main`. Use a new worktree, commit there, push, and merge a pull request into `main`.

## Releasing

Bump `version` in `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `plugins/ceci/plugin.json` (`npm test` fails if they differ), then push a `v*` tag. [release.yml](.github/workflows/release.yml) only verifies the tag: it runs `npm test` and checks that the tag matches `package.json`. CI holds no npm token and never publishes. A maintainer stages the package and publishes it by hand with npm two-factor authentication.

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## Contributing

Issues and pull requests are welcome. Use the [issue templates](.github/ISSUE_TEMPLATE) and the [pull request template](.github/pull_request_template.md). Run `npm test` before you open a pull request. After you change `ceci-skill/`, run `npm run sync`.

## Code of Conduct

be chill. be cool. treat others as you would want to be treated. have a sense of humor, life is too short. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

ceci is free software. You can redistribute it and modify it under the terms of the [GNU General Public License v3.0](LICENSE) as published by the Free Software Foundation, either version 3 of the License or (at your option) any later version (`GPL-3.0-or-later`).
