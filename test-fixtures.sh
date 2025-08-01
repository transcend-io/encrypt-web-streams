#!/bin/bash

###
# This script is used to test fixtures.

# Why: The `web-test-runner` built-in server isn't fully streaming, and OOMs on multi-GB files.
#      This script starts a separate server as a background process, and then runs the tests
#      against that server, using CORS to fetch the fixtures.
#      It then kills the server background process (and has some safeguards to ensure it doesn't hang).
#
# Usage:
#   bash test-fixtures.sh
#   bash test-fixtures.sh --watch
#   bash test-fixtures.sh --browsers chromium
#   bash test-fixtures.sh --browsers webkit firefox
#
# Arguments are passed to `web-test-runner`.
# By default, the browsers are `chromium`, `webkit`, and `firefox`.
# For more arguments, see `pnpm exec web-test-runner --help`.
###########################################

stop_server() {
  kill $(lsof -t -i:8142) > /dev/null 2>&1 || true
}

# Stop the fixtures server if it's running
stop_server

# Start the fixtures server
pnpm exec http-server test/fixtures --port 8142 --cors --silent &

# Parse the browsers from the --browsers arguments, or use the default
DEFAULT_BROWSERS=("chromium" "webkit" "firefox")
OVERRIDE_BROWSERS=false
BROWSERS=()
for arg in "$@"; do
  if [[ "$arg" == --browsers* ]]; then
    OVERRIDE_BROWSERS=true
    BROWSERS+=("${arg#--browsers=}")
  fi
done
if [ "$OVERRIDE_BROWSERS" = false ]; then
  BROWSERS+=("${DEFAULT_BROWSERS[@]}")
fi

# Run the tests, and pass additional arguments to the web-test-runner
pnpm exec web-test-runner \
  --files test/fixtures.test.ts \
  --node-resolve \
  --playwright \
  --browsers "${BROWSERS[@]}" \
  "$@"

# On kill, run the cleanup function
cleanup() {
  stop_server
  exit 0
}
trap cleanup EXIT

stop_server
