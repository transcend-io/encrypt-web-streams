import { esbuildPlugin } from '@web/dev-server-esbuild';

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
      timeout: 5 * 60 * 1000, // 5 minutes
    },
  },
  testsFinishTimeout: 5 * 60 * 1000, // 5 minutes
};
