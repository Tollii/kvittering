#!/usr/bin/env bash
# Collect the mechanical facts for step 1 of the observability skill.
# Read-only. Run from the root of the repository being surveyed:
#
#   bash path/to/observability/scripts/survey.sh [since-date]
#
# With a date (YYYY-MM-DD), it also lists source files changed since then,
# which is where a maintenance pass starts reading.

set -u

since="${1:-}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository: run this from the repository being surveyed." >&2
  exit 1
fi

manifests=(
  'package.json' '**/package.json' 'go.mod' '**/go.mod'
  'pyproject.toml' '**/pyproject.toml' 'requirements*.txt' '**/requirements*.txt'
  'Cargo.toml' '**/Cargo.toml' 'Gemfile' '**/Gemfile'
  'pom.xml' '**/pom.xml' '*.gradle' '**/*.gradle' '*.gradle.kts' '**/*.gradle.kts'
  '*.csproj' '**/*.csproj'
)
sources=(
  '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.mts' '*.cts'
  '*.py' '*.go' '*.rs' '*.rb' '*.java' '*.kt' '*.cs' '*.swift'
)
# Dependencies and generated code say nothing about the project's own habits.
skip=(
  ':!node_modules' ':!**/node_modules/**' ':!vendor' ':!**/vendor/**'
  ':!dist' ':!build' ':!**/_generated/**' ':!**/generated/**'
)

section() { printf '\n== %s ==\n' "$1"; }
none() { echo "(none found)"; }

# Print the distinct matches of a pattern in the dependency manifests.
in_manifests() {
  git grep -h -i -o -E "$1" -- "${manifests[@]}" "${skip[@]}" 2>/dev/null |
    tr -d '"' | sort -u
}

# Print "count file" for a pattern in source files, largest first.
by_file() {
  git grep -c -E "$1" -- "${sources[@]}" "${skip[@]}" 2>/dev/null |
    awk -F: '{ print $NF, substr($0, 1, length($0) - length($NF) - 1) }' |
    sort -rn
}

# Print a total and the ten files with the most matches.
summarize() {
  local counts
  counts="$(by_file "$1")"
  if [ -z "$counts" ]; then
    none
    return
  fi
  echo "$counts" | awk '{ total += $1 } END { print total " in " NR " files" }'
  echo "$counts" | head -10 | sed 's/^/  /'
}

section "Repository"
echo "root: $(git rev-parse --show-toplevel)"
default_branch="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"
if [ -z "$default_branch" ]; then
  for candidate in main master; do
    if git show-ref --verify --quiet "refs/remotes/origin/$candidate"; then
      default_branch="origin/$candidate (guessed: origin/HEAD is not set)"
      break
    fi
  done
fi
echo "default branch: ${default_branch:-unknown}"

section "Earlier runs of this skill"
docs="$(git ls-files -- 'docs/observability.md' '**/observability.md' | grep -v '/skills/')"
if [ -n "$docs" ]; then echo "$docs" | sed 's/^/conventions doc: /'; else echo "conventions doc: (none found at the default path)"; fi
swept="$(git grep -n -E 'Last swept:' -- '*.md' ':!**/skills/**' 2>/dev/null)"
echo "${swept:-Last swept: (no date recorded)}"
branches="$(git branch -a --list '*observability/*' 2>/dev/null | sed 's/^[* ]*//')"
if [ -n "$branches" ]; then echo "$branches" | sed 's/^/branch: /'; else echo "branches named observability/*: (none)"; fi

section "OpenTelemetry dependencies"
found="$(in_manifests '@?opentelemetry[A-Za-z0-9_./@-]*')"
if [ -n "$found" ]; then echo "$found"; else none; fi

section "Vendor SDKs and agents"
vendors='sentry|datadog|dd-trace|ddtrace|newrelic|honeycomb|posthog|axiom|bugsnag|rollbar|elastic-apm|appsignal|logtail|baselime|dynatrace|lightstep'
found="$(in_manifests "\"?[@A-Za-z0-9_./-]*($vendors)[A-Za-z0-9_./-]*")"
if [ -n "$found" ]; then echo "$found"; else none; fi

section "Logger libraries"
loggers='pino|winston|bunyan|loglevel|consola|log4js|structlog|loguru|zerolog|logrus|go\.uber\.org/zap|slog|serilog|log4j|logback|slf4j|tracing-subscriber'
found="$(in_manifests "\"?[@A-Za-z0-9_./-]*($loggers)[A-Za-z0-9_./-]*")"
if [ -n "$found" ]; then echo "$found"; else none; fi

section "OTEL_* configuration mentioned in"
found="$(git grep -l -E 'OTEL_[A-Z_]+' -- "${skip[@]}" ':!**/skills/**' 2>/dev/null | head -20)"
if [ -n "$found" ]; then echo "$found"; else none; fi

section "console.* calls"
summarize 'console\.(log|info|warn|error|debug|trace)\('

section "Inline spans (startSpan / startActiveSpan)"
summarize '\.(startSpan|startActiveSpan)\('

if [ -n "$since" ]; then
  section "Source files changed since $since"
  changed="$(git log --since="$since" --name-only --pretty=format: -- "${sources[@]}" "${skip[@]}" | sort -u | sed '/^$/d')"
  if [ -n "$changed" ]; then
    echo "$changed" | wc -l | awk '{ print $1 " files" }'
    echo "$changed"
  else
    none
  fi
fi

echo
echo "This lists what a search can find. Stack, units of work, identity and"
echo "conventions still need reading the code."
