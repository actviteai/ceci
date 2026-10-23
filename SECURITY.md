# Security Policy

## Supported versions

Only the latest release of `@actvite/ceci` receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include the version, the command you ran, and what happened. You will get a reply as soon as a maintainer can look at it.

## Scope

ceci is a local CLI and agent skill with no network access and no package dependencies. Reports we care about most:

- `ceci install` or `ceci init` writing, replacing, or deleting files outside the paths they document.
- A crafted `state.md`, `brief.md`, or `gpu-prefs.yaml` that makes the tool read or write outside `--work-dir`.
- Anything in the published npm package that should not be there.

## Releases

CI holds no npm token and cannot publish. A maintainer stages each release and publishes it by hand with npm two-factor authentication.
