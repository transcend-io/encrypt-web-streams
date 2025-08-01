#!/bin/bash

kill $(lsof -t -i:8142) || true

# Start the fixtures server
pnpm exec http-server test/fixtures -p 8142 --cors &

# # Run the tests, and pass additional arguments to the web-test-runner
pnpm exec web-test-runner --files test/fixtures.test.ts --node-resolve --playwright --browsers chromium firefox webkit "$@"

stop_server() {
  kill $(lsof -t -i:8142) || true
}

# On kill, run the cleanup function
cleanup() {
  stop_server
  exit 0
}
trap cleanup EXIT

stop_server
