# Workday Extend Development Rules

## Documentation Reference

Whenever a request involves Workday Extend (pages, widgets, orchestrations, scripts, cards, flows, data bindings, PMD/AMD/SMD files, or any Workday platform development), you MUST first consult the documentation folder in the root of this project "Documentation and Forum Content":


Search this folder for relevant documentation on best practices before implementing or advising on any Workday Extend work. Use the docs to guide structure, naming conventions, API usage, and platform patterns.

## What it is

A Workday Extend app project with a GitHub Actions deploy workflow
(`deploy-on-merge.yml`) that deploys the app on merge. Deploy auth runs through
the Workday CLI (`wdcli`): the secrets `WDCLI_CLIENT_ID` / `WDCLI_CLIENT_SECRET`
are stored in **GitHub repo Settings → Secrets** (not in the repo, not in
`.env`) and injected into the workflow at deploy time.

## Local dev

There is **no documented local run/test step yet** — this is a known gap. The
only proven path today is the GitHub Actions deploy-on-merge pipeline; there is
no recorded `wdcli` command, emulator, or local-preview procedure for iterating
on the app outside of a merge. Flag this when picking the project up: document a
local loop (e.g. `wdcli` auth + deploy to a sandbox tenant) before relying on
fast local iteration.

## Last turn / Pending

- **Secret-setup assumption:** `WDCLI_CLIENT_ID` / `WDCLI_CLIENT_SECRET` are
  assumed to originate from a **Workday system user** (an integration/API
  credential created in the tenant), not from a personal login. Confirm the
  system user and its scopes if a deploy fails on auth.
- **TODO:** write the local-dev instructions (see "Local dev" above) — currently
  the deploy-on-merge workflow is the only documented way to run/ship the app.
