---
name: ceci
description: Parent skill that maintains a job graph (brief.md, state.md, log.md), enforces human gates, schedules work, places GPU jobs, and calls /rdap-q for evidence. Invoke with /ceci.
disable-model-invocation: true
---
# ceci
ceci owns the job graph and human gates. It calls /rdap-q only when a job needs an evidence gate on code, data, or scoring. It is standalone: no hardcoded names, hosts, or projects. All external information arrives by flag or file.
## Files
In `--work-dir` (required):
- `brief.md` — number, never-list, deadline, tools. Read first every run.
- `state.md` — jobs as nodes. Update after every job.
- `log.md` — append-only, one line per run.
`gpu-prefs.yaml` is required when any job sets `gpu`. Pass it with `--gpu-pref`.
## Flags
- `--work-dir PATH` (required)
- `--gpu-pref PATH` (required if any job has a gpu field)
- `--notify-bot ID` (optional; post status if present)
- `--qa-bot ID` (optional; request check if present)
- `--deadline TIME` (optional; record in brief.md)
If a flag is absent, do not assume a value and do not reference any external agent.
## Rules
1. Read `brief.md` and `state.md` first. If either is missing, run init behavior and stop.
2. On a new goal, decompose into the smallest jobs that produce one inspectable artifact. Write the complete graph to `state.md` before starting any job. Each job has id, goal, owner, depends_on, schedule, status, done_test, artifact, gpu, and rdapq_gate (gpu and rdapq_gate are null when unused).
3. A job is done only when its done_test passes and the artifact exists. Update status and append one line to `log.md`.
4. Human gates: stop and hand back before contact, post, pay, or setting a price. Leave the price blank. Mark unverified claims UNVERIFIED.
5. For any job that changes code, data, or a model, call /rdap-q and store the exact gate output in rdapq_gate. COMPLETE is the only accepted terminal state for those jobs.
6. GPU jobs: run `ceci resolve-gpu` with the preference map, record its first line in the job's gpu field, and export the CUDA lines it prints for that job only. If it prints no CUDA_VISIBLE_DEVICES for a specific device, follow its stderr note before the job starts.
7. After every job, update state.md and append exactly one line to log.md. Schedule the next ready job if one exists.
## State schema
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
## CLI
The skill uses `tool/ceci.js` (zero-dependency Node):
- `ceci init --work-dir PATH` — creates any missing `brief.md`, `state.md`, or `log.md`. It does not overwrite a file that exists. It does not record a deadline.
- `ceci status --work-dir PATH` — lists ready, running, blocked, and gate jobs; exits 1 if the graph is inconsistent.
- `ceci resolve-gpu --work-dir PATH --gpu-pref PATH --model NAME [--busy HOST:DEVICE]`
- `ceci log --work-dir PATH --line TEXT`
Prefer these commands over free-form file writes.
## Playbooks
- `playbooks/graph.md` — schema, transitions, dependency rules.
- `playbooks/gates.md` — stop conditions, blank-price rule, hand-back format.
- `playbooks/gpu.md` — preference YAML, CUDA env, fallback, logging.
- `playbooks/rdapq.md` — when and how to call /rdap-q, how to store the gate.
## Done
A run ends when the next action is a human gate, the deadline is reached, or no ready jobs remain. Hand back the current state.md and the blank-price line if an offer exists.
