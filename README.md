# ceci has moved to ceciCela

This repository is archived. ceci is now developed in **[actviteai/cecicela](https://github.com/actviteai/cecicela)**, together with cela (the evidence gate) and trouble (the debug protocol): *ceci plans this, cela proves that, trouble fixes what breaks.*

```bash
npx --yes @actvite/cecicela install --all   # /ceci, /cela, and /trouble
npx --yes @actvite/ceci install --all       # /ceci alone (2.x)
```

`@actvite/ceci` 1.x is deprecated; 2.0.0 is the first release from ceciCela. The one breaking change: the job field `rdapq_gate` is now `cela_gate`, and ceci calls `/cela` instead of `/rdap-q`. To move a 1.x work directory:

```bash
sed -i.bak 's/^    rdapq_gate:/    cela_gate:/' state.md
```

The four gate tokens are unchanged. Issues and pull requests: [actviteai/cecicela](https://github.com/actviteai/cecicela/issues).
