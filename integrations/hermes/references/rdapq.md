# RDAP-Q gate

Call `/rdap-q` when a job changes code, data, a pipeline, or a model, including a scoring job. Do not call it for a human gate. Do not replace its oracles, and do not grade the job yourself.

The harness loads `/rdap-q` from the sibling skill `rdap-q`. If the engine is on `PATH` as `rdapq`, `rdapq gate` is that same call. Do not hardcode a filesystem path, a host, or a project.

## Store the result

Copy the terminal token the gate prints. That token is the exact value of `rdapq_gate`:

- `COMPLETE`
- `STALLED`
- `BLOCKED`
- `MISSING_TEST`

`COMPLETE` is the only accepted terminal state. The job may become `done` only when the token is `COMPLETE`, the done test passed, and the artifact exists.

`STALLED`, `BLOCKED`, and `MISSING_TEST` stay not done. Record the token and stop that job. `CONTINUE` is not terminal; run the loop again rather than storing it. A token outside the four values is not stored. Leave `rdapq_gate: null` and do not mark the job done.

The gate's wording is not rewritten and not shortened into a different token.
