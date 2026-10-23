# ceci

[![npm](https://img.shields.io/npm/v/@coldcanuk/ceci.svg)](https://www.npmjs.com/package/@coldcanuk/ceci)
[![ci](https://github.com/actviteai/ceci/actions/workflows/ci.yml/badge.svg)](https://github.com/actviteai/ceci/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

`/ceci` is the parent skill for a job graph. It decomposes a goal into jobs, writes that graph before any work starts, schedules the jobs whose dependencies are done, places local GPU work from a preference file you supply, and stops for a human before contact, posting, payment, or a price.

It does not grade its own code, data, or scoring jobs. Those jobs call [`/rdap-q`](https://github.com/coldcanuk/rdapq) and store the gate token that engine prints. `COMPLETE` is the only token that can finish them.

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

[`.agents/skills/ceci`](.agents/skills/ceci) is a symlink to `ceci-skill/`. Harnesses that scan `.agents/skills/` load `/ceci` the same way they load `/rdap-q` from a sibling checkout of `rdap-q-skill`. Copy the `ceci-skill` directory next to `rdap-q-skill` when a harness wants both trees side by side. Do not rename the skill inside `SKILL.md`; the slash command is the frontmatter name `ceci`.

## Requirements

- Node.js 22 or newer. `ceci-skill/tool/ceci.js` has no package dependencies. `ceci-skill/package.json` sets `"type": "commonjs"` so that file still runs when an ancestor `package.json` sets `"type": "module"`.
- Git, only if you are changing this repository. See [AGENTS.md](AGENTS.md).
- `/rdap-q` available to the same harness when a job changes code, data, a pipeline, or a model. A `rdapq` binary on `PATH` is the same engine. ceci does not embed a path to it.

## Install

The npm package is [`@coldcanuk/ceci`](https://www.npmjs.com/package/@coldcanuk/ceci). It installs one command, `ceci`.

```bash
# Copy the skill into every harness home (Claude Code, Grok, Codex, Hermes)
npx --yes @coldcanuk/ceci install --all

# Or name the harnesses you want
npx --yes @coldcanuk/ceci install --claude --codex

# Or install the CLI globally
npm install -g @coldcanuk/ceci
ceci install --all
ceci init --work-dir ./run
ceci status --work-dir ./run
```

`ceci install` replaces an existing ceci skill directory with a fresh copy. Each copy is staged first and renamed into place only after `SKILL.md` is present. Every other `ceci` command (`init`, `status`, `log`, `resolve-gpu`) goes to `ceci-skill/tool/ceci.js`; see [CLI](#cli).

To install from GitHub instead of the npm registry:

```bash
npx --yes github:actviteai/ceci install --all
```

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
    gpu: null | "host:bus-id"
    rdapq_gate: null | COMPLETE | STALLED | BLOCKED | MISSING_TEST
```

The CLI accepts only this subset:

- The file is `jobs: []` or starts with `jobs:`.
- Each job starts with two spaces, a dash, and `id`. Later keys are indented four spaces, in the order above.
- Lists are flow lists: `[]` or `[score, offer]`.
- Quote a scalar that contains `:`, a space, or is empty. Quote `gpu` whenever the bus id contains colons: `gpu: "host-a:0000:01:00.0"`.
- `gpu: null` and `rdapq_gate: null` are the empty values.
- `artifact` is relative to `--work-dir`. Absolute paths and `..` are rejected.
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

Run it with Node from a checkout:

```bash
node ceci-skill/tool/ceci.js <command> --work-dir PATH
```

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

Prints stored jobs in three groups. Jobs in `running` or `done` are not listed; they remain in `state.md`.

```text
ready:
- score
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
  --busy host-a:0000:01:00.0
```

`--work-dir` must be an existing directory. `--gpu-pref` and `--model` are required. Repeat `--busy` for each occupied device. The command does not call `nvidia-smi` and does not read a default path.

Stdout on a specific bus:

```text
host-a:0000:01:00.0
CUDA_DEVICE_ORDER=PCI_BUS_ID
CUDA_VISIBLE_DEVICES=0000:01:00.0
```

The first line is what you store in the job's `gpu` field before that job runs. Export the other lines into the environment of the local process.

If the winner is the `*` entry, stdout is:

```text
host-a:*
CUDA_DEVICE_ORDER=PCI_BUS_ID
```

`CUDA_VISIBLE_DEVICES` is omitted. `*` means any device on that host, not a PCI address the tool invented.

Selection order:

1. Keep entries whose `models` list contains the model name exactly.
2. Drop entries named by `--busy` as `HOST:BUS` (split on the first colon, so bus ids may contain colons).
3. Highest `priority` wins.
4. Equal priority: a real bus id beats `*`, then hostname, then bus id, in byte order.

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
| `gpu` | `null`, or `host:bus-id` from `resolve-gpu`. |
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
    "bus-id-or-*": { priority: int, models: [string] }
```

Hostnames match `[A-Za-z0-9._-]+`. Quote every bus id. `priority` is an integer. `models` is a flow list of exact model names.

```yaml
hosts:
  host-a:
    "0000:01:00.0": { priority: 10, models: ["model-large"] }
    "*": { priority: 1, models: ["model-small"] }
  host-b:
    "0000:02:00.0": { priority: 5, models: ["model-large", "model-small"] }
```

For `model-large` with nothing busy, the winner is `host-a:0000:01:00.0` (priority 10). If that bus is passed as `--busy host-a:0000:01:00.0`, the winner is `host-b:0000:02:00.0` (priority 5). `host-a:*` is only a `model-small` fallback at priority 1, and it does not set `CUDA_VISIBLE_DEVICES`.

Record the chosen `host:bus-id` on the job, export the CUDA lines for the local process, and mention the choice in that job's one log line.

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

The sibling skill is `rdap-q` in [coldcanuk/rdapq](https://github.com/coldcanuk/rdapq). ceci does not vendor that engine.

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

`npm test` checks that the generated harness copies match `ceci-skill/`, then runs `ceci-skill/tool/ceci.test.js`, `scripts/harness.test.js`, and `scripts/package.test.js`. The package test covers the `ceci` bin, the npm `files` list, and the `prepack` step that turns the `.claude`, `.agents`, and `.grok` skill symlinks into real directories for the tarball.

`ceci-skill/tool/ceci.test.js` checks init, GPU priority and `--busy`, one-line logs, and `status` grouping. The scoring scenario calls a real RDAP-Q engine when `RDAPQ` points at `rdapq.js` or when `rdapq` is on `PATH`. That scenario requires the stored token to be `COMPLETE`, requires `offer.md` to be absent, and requires `state.md` not to contain a price. Without an engine the scenario is skipped; the other tests still run.

## Harnesses

The same skill loads in Hermes, Claude Code, Grok, and Codex. Generated trees are real files. Codex and Grok copy a plugin without following a symlink that points out of it, and a Hermes URL install does not follow symlinks either.

| Harness | In this repository | Install command writes |
| --- | --- | --- |
| Claude Code | `.claude/skills/ceci` → `ceci-skill`, plus `.claude/commands/ceci.md` and [CLAUDE.md](CLAUDE.md) | `$CLAUDE_HOME/skills/ceci` or `~/.claude/skills/ceci` |
| Grok | `.grok/skills/ceci` → `ceci-skill`, plus [.grok/rules.md](.grok/rules.md) | `$GROK_HOME/skills/ceci` or `~/.grok/skills/ceci` |
| Codex | `.agents/skills/ceci` → `ceci-skill`, plus the skill section of [AGENTS.md](AGENTS.md) | `$CODEX_HOME/skills/ceci`, else `$AGENTS_HOME/skills/ceci`, else `~/.agents/skills/ceci` |
| Hermes | [integrations/hermes](integrations/hermes) (`scripts/`, `references/`, `examples/`) | `$HERMES_HOME/skills/software-development/ceci` or `~/.hermes/skills/software-development/ceci` |

Claude Code, Codex, and Grok can also install the marketplace plugin. [.claude-plugin/marketplace.json](.claude-plugin/marketplace.json) points at [plugins/ceci](plugins/ceci), whose `skills/ceci` directory is a byte copy of `ceci-skill/`, not a symlink.

```bash
npx --yes @coldcanuk/ceci install --claude
npx --yes @coldcanuk/ceci install --grok
npx --yes @coldcanuk/ceci install --codex
npx --yes @coldcanuk/ceci install --hermes
npx --yes @coldcanuk/ceci install --all
```

From a clone, `node scripts/install.js --all` (or `npm run install:all`) does the same thing.

Hermes from a URL, when the raw file is reachable:

```text
hermes skills install https://raw.githubusercontent.com/actviteai/ceci/main/integrations/hermes/SKILL.md
```

That copy drops Claude's `disable-model-invocation` key, keeps the first sentence of the description inside Hermes' 57-character index, and names `scripts/ceci.js`, `references/*.md`, and `examples/gpu-prefs.yaml` so the installer fetches them. The slash command is `/ceci`.

After a change to `ceci-skill/`, regenerate the copies and fail if they drift:

```bash
node scripts/sync-integrations.js
node scripts/sync-integrations.js --check
```

## Agents changing this repository

[AGENTS.md](AGENTS.md) is the git rule. Do not commit on `main`. Use a new worktree, commit there, push, and merge a pull request into `main`.

## Releasing

Bump `version` in `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `plugins/ceci/plugin.json`, then push a `v*` tag. [release.yml](.github/workflows/release.yml) runs `npm test`, and it publishes with npm provenance only when the repository variable `NPM_PUBLISH` is `true` and an npm Trusted Publisher is set up for this repository.

## Contributing

Issues and pull requests are welcome. Use the [issue templates](.github/ISSUE_TEMPLATE) and the [pull request template](.github/pull_request_template.md). Run `npm test` before you open a pull request. After you change `ceci-skill/`, run `npm run sync`.

## Code of Conduct

be chill. be cool. treat others as you would want to be treated. have a sense of humor, life is too short. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

ceci is free software. You can redistribute it and modify it under the terms of the [GNU General Public License v3.0](LICENSE) as published by the Free Software Foundation, either version 3 of the License or (at your option) any later version (`GPL-3.0-or-later`).
