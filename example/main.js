import {
  init,
  createEncryptStream,
  createDecryptStream,
} from '../dist/index.js';

await init();
const key = new Uint8Array(32);
const nonce = new Uint8Array(12);

const encryptStream = createEncryptStream(key, nonce);
const decryptStream = createDecryptStream(key, nonce);

try {
  await new ReadableStream({
    start(controller) {
      for (let index = 0; index < 1000; index++) {
        controller.enqueue(new TextEncoder().encode('Hello, World!'));
      }
    },
  })
    .pipeThrough(encryptStream)
    .pipeThrough(decryptStream)
    .pipeTo(
      new WritableStream({
        write(chunk) {
          globalThis.console.log(new TextDecoder().decode(chunk));
        },
      }),
    );
} catch (error) {
  globalThis.console.error(error);
}
