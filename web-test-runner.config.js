import { esbuildPlugin } from '@web/dev-server-esbuild';

const timeout = 5 * 60 * 1000;

/** @type {import('@web/test-runner').TestRunnerConfig} */
export default {
  plugins: [esbuildPlugin({ ts: true })],
  testRunnerHtml: (testFramework) => `
    <html>
      <head>
        <script>
          window.global = window;
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
      timeout,
    },
  },
  testsFinishTimeout: timeout,
  concurrentBrowsers: 3,
};
