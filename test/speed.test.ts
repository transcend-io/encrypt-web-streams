import { Bench } from 'tinybench';
import {
  init,
  createEncryptStream,
  createDecryptStream,
} from '../src/index.js';

// Initialize the WASM module
await init();

// Create a key and nonce
const key = new Uint8Array(32);
const nonce = new Uint8Array(12);

// Crypto key
const cryptoKey = await crypto.subtle.importKey(
  'raw',
  key,
  { name: 'AES-GCM' },
  false,
  ['encrypt', 'decrypt'],
);

const NUM_CHUNKS = 1000;
const CHUNK_SIZE = 1024;

function makeReadableStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (let index = 0; index < NUM_CHUNKS; index++) {
        const chunk = new Uint8Array(CHUNK_SIZE);
        for (let index = 0; index < chunk.length; index++) {
          chunk[index] = Math.floor(Math.random() * 256);
        }
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

// Benchmark
const bench = new Bench({ name: 'simple benchmark', time: 100 });
bench
  .add('aes_gcm_stream_wasm', async () => {
    // Streams
    const readableStream = makeReadableStream();
    const encryptStream = createEncryptStream(key, nonce);
    const decryptStream = createDecryptStream(key, nonce);

    await readableStream
      .pipeThrough(encryptStream)
      .pipeThrough(decryptStream)
      .pipeTo(new WritableStream());
  })
  .add(
    'crypto.subtle (cannot stream; use separately encrypted chunks)',
    async () => {
      const readableStream = makeReadableStream();
      const reader = readableStream.getReader();

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: nonce },
          cryptoKey,
          value,
        );
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: nonce },
          cryptoKey,
          encrypted,
        );
      }
    },
  );

await bench.run();
const table = bench.table();
console.log(table);
