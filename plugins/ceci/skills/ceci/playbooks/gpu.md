# GPU placement

Read this only when a job sets `gpu`. The preference file is the `--gpu-pref` flag. If the flag is absent, do not invent a host, a device, or a default file.

## Preference file

```yaml
hosts:
  hostname:
    "device-or-*": { priority: int, models: [string] }
```

Hostnames match `[A-Za-z0-9._-]+`. Quote every device key. A device is one of:

- a GPU or MIG UUID as `nvidia-smi -L` prints it (`GPU-…`, `MIG-…`). Prefer this: it does not change when cards move.
- an integer index. With `CUDA_DEVICE_ORDER=PCI_BUS_ID` it is the device's rank in PCI bus order, the same index `nvidia-smi` shows.
- a PCI bus id (`0000:01:00.0`). It names the device, but CUDA cannot select by it; see below.
- `*`: any device on that host, not a guessed device.

`priority` is an integer. `models` is a flow list of exact model names. `examples/gpu-prefs.yaml` (from the skill root) is a shape example with no real hostnames or UUIDs. Do not point a run at it unless that file was the supplied flag.

## Choose

`ceci resolve-gpu --work-dir PATH --gpu-pref PATH --model NAME`

- A match lists `NAME` in `models`.
- Skip entries passed with `--busy HOST:DEVICE` (repeat the flag for more than one). Those are the only busy devices. Do not probe a machine to find busy ones.
- Highest `priority` wins.
- The same priority: a specific device beats `*`, then hostname, then device, in byte order.
- No match: the command exits non-zero and the job does not start.

## CUDA

The command prints the `gpu` value and the environment to set for that job.

UUID or index:

```text
host-a:GPU-00000000-0000-0000-0000-00000000000a
CUDA_DEVICE_ORDER=PCI_BUS_ID
CUDA_VISIBLE_DEVICES=GPU-00000000-0000-0000-0000-00000000000a
```

`CUDA_VISIBLE_DEVICES` accepts only indices and UUIDs, and it hides every device from the first entry it cannot parse. So for a PCI bus id the command prints the first two lines only, and a note on stderr. Before the job starts, on that host, map the bus id to its index or UUID with `nvidia-smi --query-gpu=index,uuid,pci.bus_id --format=csv` and set `CUDA_VISIBLE_DEVICES` to that value. Better: use the UUID as the key.

Star fallback: print `hostname:*` and `CUDA_DEVICE_ORDER=PCI_BUS_ID`. Do not set `CUDA_VISIBLE_DEVICES`. There is no device to give it.

Record the first line in the job's `gpu` field before the job runs. Log the choice in that job's one log line.
