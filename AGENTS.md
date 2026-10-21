# ceci — agent instructions

## Prime Directive

**It is strictly prohibited to write or commit directly to `main`.** You must always use a new worktree. You always commit to the new worktree. When done, you push and merge to `main`.

Never edit, stage, commit, or push while checked out on `main`. The primary checkout stays on `main` and is read-only. Do not switch it to a feature branch.

For every task, create a **new branch and a new linked Git worktree** under `.worktrees/`, starting from the latest `origin/main` when it exists. Do not reuse an existing worktree for a new task. All file edits and commits happen in that worktree, on its feature branch.

When the task is done, push the feature branch and merge it into `main`. Open a pull request targeting `main`, then merge that pull request. Do not leave the work only on the feature branch, and do not push new commits straight to `main`.

If `main` has no commits yet, do not author the initial commit on `main`. Commit in the new worktree, push that branch, then publish `main` by fast-forwarding it to the worktree commit. That fast-forward is the merge. Afterwards, confirm `main` contains the commit.

Only after the merge is confirmed, fast-forward the primary checkout and remove the clean worktree and the local feature branch. Never force-remove a dirty worktree or delete an unmerged branch.

### Required workflow

Start in the primary checkout on `main`. Replace the placeholders with a unique branch and worktree name for the task.

```bash
git fetch origin
git worktree add -b <type>/<task> .worktrees/<task> origin/main
cd .worktrees/<task>

# Edit here. Stage only this task's files.
git add <task-files>
git commit -m "<message>"
git push -u origin HEAD

gh pr create --base main --head <type>/<task>
gh pr merge --merge

cd ../..
git pull --ff-only origin main
git worktree remove .worktrees/<task>
git branch -d <type>/<task>
```

Do not `git commit` while `git branch --show-current` is `main`.
