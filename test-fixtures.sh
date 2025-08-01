#!/bin/bash

kill $(lsof -t -i:8142) || true

# Start the fixtures server
pnpm exec http-server test/fixtures -p 8142 --cors &

# Build the project
pnpm run build

# # Run the tests, and pass additional arguments to the web-test-runner
pnpm exec web-test-runner --files test/fixtures.test.ts --node-resolve --playwright --browsers chromium firefox webkit "$@"

cleanup() {
  # Kill whatever is running on port 8142
  kill $(lsof -t -i:8142) || true
  # Add your cleanup commands here
  exit 0
}

# On kill, run the cleanup function
trap cleanup EXIT

# Run the cleanup function
cleanup