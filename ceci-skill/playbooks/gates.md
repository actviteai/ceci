# Human gates

Stop and hand the run back before any of these:

- contact
- post
- pay
- setting a price

`brief.md` carries the same stops in `never`. Do not delete them. If `--deadline` was passed, it is already recorded there. Do not add a price, a recipient, or a channel that was not in the flags or files for this run.

## Blank price

Leave the price blank. Do not estimate, round, or copy a number from memory. An offer job stays `status: gate` with no price field and no filled amount anywhere in `state.md`.

## UNVERIFIED

A claim that this run did not check is `UNVERIFIED`. Do not upgrade it because it sounds familiar. Verified claims name the flag, file, or command output that checked them.

## Hand-back

Print this and stop. The price line has no value.

```text
gate: price
job: <job-id>
price:
claim: UNVERIFIED
```

Use `claim: UNVERIFIED` when the run is carrying an unchecked claim. Omit the claim line when there is nothing to mark. Then append one log line for this job, with status `gate`.

Contact, post, and pay use the same shape with `gate: contact`, `gate: post`, or `gate: pay`, and they also stop.
