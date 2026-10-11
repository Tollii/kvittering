---
name: security-triage
description: Triage Kvitto's open Dependabot pull requests, Dependabot alerts, and code scanning alerts, then fix or dismiss each one. Use for the weekly security routine or when asked to clear the Security tab or the Dependabot queue.
metadata:
  harness: [claude]
  platform: [darwin, linux]
  scope: project
---

# Security triage

Every open Dependabot pull request and security alert ends the run merged, fixed, dismissed with evidence, or reported with the reason it needs the owner. Nothing stays open without a stated reason.

## 1. Collect the queue

Run `git fetch origin main` first: cached cloud checkouts can hold an old `origin/main`. Work from a fresh branch off `origin/main`.

- **Dependabot pull requests:** `gh api 'repos/Tollii/kvittering/pulls?state=open&per_page=100' --jq '.[] | select(.user.login == "dependabot[bot]")'`.
- **Dependabot alerts:** `gh api 'repos/Tollii/kvittering/dependabot/alerts?state=open'`. Cloud sessions get 403 there. Use `npm audit --package-lock-only --json` on `origin/main` instead; it covers npm advisories but not GitHub Actions ones.
- **Code scanning alerts:** `gh api 'repos/Tollii/kvittering/code-scanning/alerts?state=open'`. Cloud sessions get 403 there too. Dispatch the [code scanning alerts workflow](../../../.github/workflows/code-scanning-alerts.yml) instead and read the JSON lines in its `list` job log:

  ```sh
  gh api -X POST repos/Tollii/kvittering/actions/workflows/code-scanning-alerts.yml/dispatches -f ref=main
  gh api 'repos/Tollii/kvittering/actions/workflows/code-scanning-alerts.yml/runs?per_page=1' --jq '.workflow_runs[0] | [.id, .created_at]'  # created after the dispatch
  gh api repos/Tollii/kvittering/actions/runs/<run-id>/jobs --jq '.jobs[0].id'
  gh api repos/Tollii/kvittering/actions/jobs/<job-id>/logs
  ```

Also check the latest CodeQL run (`dynamic/github-code-scanning/codeql`) for failed language analyses; the Security tab shows those as configuration warnings.

## 2. Decide each item

**Dependabot pull requests.** Merge when CI is green and the update fits the constraints below. When the branch is behind or conflicted, merge `origin/main` into it rather than asking Dependabot: its `@dependabot` commands do not work when posted through the integration. Regenerate the lockfile with npm 11 from main's lockfile, pinning the PR's versions (`npm install --package-lock-only <pkg>@<version>`). When CI fails because of the update, fix it on the branch if the fix is small; [PR #127](https://github.com/Tollii/kvittering/pull/127) adapted `convex/decisions.ts` to the `ai` 7.0.133 part format this way. When the update cannot land, close the PR and add an `ignore` rule with its reason to [dependabot.yml](../../../.github/dependabot.yml) in a separate PR, because a closed major-version PR comes back otherwise.

Constraints that are already settled:

- [dependabot.yml](../../../.github/dependabot.yml) records the skipped updates and why: Expo-pinned packages, ESLint majors (oxlint loads `eslint-plugin-import`, which caps ESLint at 9; ESLint 10 needs it replaced first), and Better Auth minors (Better Auth 1.7 is incompatible with the Convex adapter).
- A dependency fix must not add `package.json` scripts or files under `patches/`. They feed the Expo native fingerprint, so installed TestFlight builds would stop receiving OTA updates until a new native build ships. Use `overrides`, a direct dependency, or a Metro and Jest shim instead, and check the `Native fingerprint` CI job.

**Dependabot alerts.** Fix an alert when a patched version is reachable through an upgrade or an `overrides` entry. Dismiss it when no patch exists and the vulnerable code is unreachable in the app and its tooling, with the call path you checked as evidence. These are already accepted as "Vulnerable code is not actually used": `node-forge` (Expo CLI and expo-updates code signing, which is not configured), `braces`, and `sprintf-js` (Jest tooling). Cloud sessions cannot dismiss Dependabot alerts; list each one in the report with its reason, for the owner to dismiss in GitHub.

**Code scanning alerts.** Read the flagged code and trace whether untrusted input reaches it. Fix a real finding. Dismiss a false positive or an accepted risk with a comment of at most 280 characters naming the evidence:

```sh
gh api -X POST repos/Tollii/kvittering/actions/workflows/code-scanning-alerts.yml/dispatches \
  -f ref=main -f 'inputs[dismiss]=<number>' -f 'inputs[reason]=false positive' -f 'inputs[comment]=<evidence>'
```

`reason` is one of `false positive`, `won't fix`, or `used in tests`. Check that the dismiss run succeeded.

Alert #1, `js/request-forgery` in `tools/visual/serve.mts`, is a false positive: the dev-only proxy for the web build has its host fixed by argv and forwards only `/api/auth/` and `/receipt-image` paths.

## 3. Ship the fixes

Group the alert fixes into one pull request; each Dependabot pull request stays its own. Follow [file-pr](../file-pr/SKILL.md): a real pull request, not a draft. Run [adversarial-code-review](../adversarial-code-review/SKILL.md) on each pull request, including Dependabot ones, and fix its findings before enabling auto-merge. Then follow [babysit-pr](../babysit-pr/SKILL.md) until each one is merged. Do not deploy the backend or publish a release; backend patches take effect on the owner's next deploy.

## 4. Report

List what was merged, fixed, and dismissed with each reason, then what needs the owner: Dependabot alerts to dismiss, decisions, and pull requests still waiting. Link each pull request and alert. When the queue was empty, say so in one line.
