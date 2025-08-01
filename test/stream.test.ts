import { assert } from '@esm-bundle/chai';
import {
  createDecryptStream,
  createEncryptStream,
  init,
} from '../src/index.js';

declare function it(name: string, callback: () => void): void;
declare function it(name: string, callback: () => Promise<void>): Promise<void>;

async function streamToUint8Array(
  readableStream: ReadableStream,
): Promise<Uint8Array> {
  const response = new Response(readableStream);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function createReadableStream(data: Uint8Array): ReadableStream<Uint8Array> {
  function* chunkIterator(desiredSize: number) {
    for (let index = 0; index < data.length; index += desiredSize) {
      yield data.slice(index, index + desiredSize);
    }
  }
  let iterator: Generator<Uint8Array, void, unknown> | undefined;
  return new ReadableStream({
    pull(controller) {
      const { desiredSize } = controller;

      iterator ??= chunkIterator(desiredSize ?? 1024);
      const { value, done } = iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

it('should initialize WASM module from exported API', async () => {
  const wasm = await init();
  assert.ok(wasm, 'WASM module should be initialized');
});

it('should not throw if WASM module is already initialized', async () => {
  await init();
});

it('should create encrypt and decrypt streams', () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);

  const encryptStream = createEncryptStream(key, iv, false);
  const decryptStream = createDecryptStream(key, iv);

  assert.ok(encryptStream, 'Encrypt stream should be created');
  assert.ok(decryptStream, 'Decrypt stream should be created');
});

it('should fail to create create encrypt and decrypt streams when key is not 32 bytes', () => {
  const key = new Uint8Array(16).fill(1); // not 32 bytes
  const iv = new Uint8Array(12).fill(2);

  assert.throws(
    () => createEncryptStream(key, iv, false),
    /Key must be 32 bytes/,
    'createEncryptStream should fail when key is not 32 bytes',
  );
  assert.throws(
    () => createDecryptStream(key, iv),
    /Key must be 32 bytes/,
    'createDecryptStream should fail when key is not 32 bytes',
  );
});

it('should encrypt a single chunk of data', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const data = new Uint8Array(1024).fill(1);

  await new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  })
    .pipeThrough(createEncryptStream(key, iv, false))
    .pipeTo(new WritableStream());
});

it('should encrypt and decrypt 1 byte of data', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const unencryptedData = new Uint8Array(1).fill(1);

  const decryptedData = await streamToUint8Array(
    createReadableStream(unencryptedData)
      .pipeThrough(createEncryptStream(key, iv, false))
      .pipeThrough(createDecryptStream(key, iv)),
  );

  assert.strictEqual(
    decryptedData.length,
    unencryptedData.length,
    'Decrypted data should have same length as unencrypted data',
  );
  assert.deepStrictEqual(
    decryptedData,
    unencryptedData,
    'Decrypted data should match unencrypted data',
  );
});

it('when encrypting and decrypting 0 bytes of data, the decrypted data should have length 0', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const unencryptedData = new Uint8Array(0);

  const decryptedData = await streamToUint8Array(
    createReadableStream(unencryptedData)
      .pipeThrough(createEncryptStream(key, iv, false))
      .pipeThrough(createDecryptStream(key, iv)),
  );

  assert.strictEqual(
    decryptedData.length,
    unencryptedData.length,
    'Decrypted data should have same length as unencrypted data',
  );
  assert.deepStrictEqual(
    decryptedData,
    unencryptedData,
    'Decrypted data should match unencrypted data',
  );
});
