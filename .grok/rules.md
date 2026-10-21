# ceci

When the user types `/ceci`, read the ceci skill before doing anything else, then follow it for that task only. Do not use it for other requests.

Skill: `.grok/skills/ceci/SKILL.md` in this repository.
Fallback: `ceci-skill/SKILL.md`

The skill's tool is `tool/ceci.js` in the same folder as `SKILL.md`.

Git rule: `AGENTS.md`. Do not commit on `main`.
