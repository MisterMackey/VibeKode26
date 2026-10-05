#!/usr/bin/env bash
# QA gate: lint, typecheck, build, test. Run before calling a task done.
# Output of passing sections goes only to the log; failing sections are printed.
# Log file: $QA_LOG (default .qa/qa.log).
set -u
cd "$(dirname "$0")/.."

export NO_COLOR=1
export FORCE_COLOR=0
unset CLICOLOR_FORCE

LOG="${QA_LOG:-.qa/qa.log}"
mkdir -p "$(dirname "$LOG")"
: >"$LOG"

summary=""
failed=0

section() {
  local name="$1"
  shift
  local out
  out="$(mktemp)"
  echo "== $name: $*" >>"$LOG"
  if "$@" >"$out" 2>&1; then
    cat "$out" >>"$LOG"
    echo "PASS $name"
    summary="$summary
PASS $name"
  else
    cat "$out" >>"$LOG"
    echo "FAIL $name"
    cat "$out"
    summary="$summary
FAIL $name"
    failed=1
  fi
  rm -f "$out"
}

section lint npm run --silent lint
# Build before typecheck: Next generates global types (e.g. LayoutProps) in .next/types.
section build npm run --silent build
section build-cli npm run --silent build --workspace todo-cat-cli
section typecheck npm run --silent typecheck
section test npm test --silent

echo
echo "SUMMARY$summary"
echo "log: $LOG"
if [ "$failed" -ne 0 ]; then
  echo "QA FAILED"
  exit 1
fi
echo "QA PASSED"
