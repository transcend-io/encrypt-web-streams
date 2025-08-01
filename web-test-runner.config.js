import { esbuildPlugin } from '@web/dev-server-esbuild';

/** The timeout for all tests in milliseconds */
const TIMEOUT_MS = 5 * 60 * 1000;

/** @type {import('@web/test-runner').TestRunnerConfig} */
export default {
  plugins: [esbuildPlugin({ ts: true })],
  testRunnerHtml: (testFramework) => `
    <html>
      <head>
        <script>
          window.process = { env: {} };
        </script>
      </head>
      <body>
        <script type="module" src="${testFramework}"></script>
      </body>
    </html>
  `,
  testFramework: {
    config: {
      timeout: TIMEOUT_MS,
    },
  },
  testsFinishTimeout: TIMEOUT_MS,
  concurrentBrowsers: 3,
};
