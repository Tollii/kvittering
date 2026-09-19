# Upstream source

Source: https://github.com/dmmulroy/anti-slop

Revision: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`

The general plugin, rules, shared helpers, and third-party notices are copied
without source changes. Effect-specific rules and upstream test files are omitted.
The local package.json declares ES modules for Node's TypeScript loader.

All exported general rules are enabled by `oxlint.policy.config.mjs`. When updating,
review the upstream diff, preserve licenses, and run the complete quality checks.
Do not add a baseline to hide findings.
