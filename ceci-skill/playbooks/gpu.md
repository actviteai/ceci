# GPU placement

Read this only when a job sets `gpu`. The preference file is the `--gpu-pref` flag. If the flag is absent, do not invent a host, a bus id, or a default file.

## Preference file

```yaml
hosts:
  hostname:
    "bus-id-or-*": { priority: int, models: [string] }
```

Hostnames match `[A-Za-z0-9._-]+`. Quote every bus id. `*` means any device on that host, not a guessed PCI id. `priority` is an integer. `models` is a flow list of exact model names. `examples/gpu-prefs.yaml` (from the skill root) is a shape example with no real hostnames. Do not point a run at it unless that file was the supplied flag.

## Choose

`ceci resolve-gpu --work-dir PATH --gpu-pref PATH --model NAME`

- A match lists `NAME` in `models`.
- Skip entries passed with `--busy HOST:BUS` (repeat the flag for more than one). Those are the only busy devices. Do not probe a machine.
- Highest `priority` wins.
- The same priority: a specific bus id beats `*`, then hostname, then bus id, in byte order.
- No match: the command exits non-zero and the job does not start.

## CUDA

The command prints the `gpu` value and the environment to set for that job.

Specific bus:

```text
host-a:0000:01:00.0
CUDA_DEVICE_ORDER=PCI_BUS_ID
CUDA_VISIBLE_DEVICES=0000:01:00.0
```

Star fallback: print `hostname:*` and `CUDA_DEVICE_ORDER=PCI_BUS_ID`. Do not set `CUDA_VISIBLE_DEVICES`. There is no bus id to give it.

Record the first line in the job's `gpu` field before the job runs. Log the choice in that job's one log line.
