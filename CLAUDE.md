# ceci

When the user types `/ceci`, read the ceci skill before doing anything else, then follow it for that task only. Do not use it for other requests.

Skill: `ceci-skill/SKILL.md` in this repository.

The skill's tool is `tool/ceci.js` in the same folder as `SKILL.md`.

Git rule: [AGENTS.md](AGENTS.md). Do not commit on `main`.

GitHub account: push, PR, and merge as `actviteai` only. See the "GitHub account" section of [AGENTS.md](AGENTS.md); prefix `gh` commands with `GH_TOKEN=$(gh auth token --user actviteai)`.
