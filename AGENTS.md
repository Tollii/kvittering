# Kvitto

Kvitto is an Expo/React Native iOS app with a Convex backend. Reports describe household purchases, not consumption. Missing product identities and quantities remain unknown.

Preserve unsaved receipt drafts, queued images, and supported installed-client contracts.

Use [architecture](docs/architecture.md) for ownership and data-flow changes, [principles](docs/principles.md) for domain modeling and test design, and [README](README.md) for setup and verification. Load only what the task needs.

Code and configuration own exact values and feature behavior. Documentation should explain non-obvious constraints and decisions; task procedures belong in skills.

## UI changes

For any change that alters what a person sees, run the [visual-check](.agents/skills/visual-check/SKILL.md) skill and put before and after screenshots in the PR, with a short video for multi-step flows. The web build approximates iOS: native-only paths such as the camera, Keychain, widgets, and system icons cannot be verified this way.

## Tests

- Tautological tests are harmful.
- Change-detector tests are harmful.
- Add a regression test for a bug fix only when it closes a genuine gap in behavior testing.
