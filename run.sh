#!/bin/bash
set -e

echo "Building project..."
pnpm build

echo "Running fixture tests..."
echo "When FF_BIG_FIXTURES is not 'skip', the test will run for almost a minute."
echo "The test does not print while it's running. Wait for it to exit and print 'Finished running tests'."
pnpm exec web-test-runner --node-resolve --playwright --browsers chromium --files test/fixtures.test.ts
