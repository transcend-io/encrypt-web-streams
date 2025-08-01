import { assert } from '@esm-bundle/chai';
import {
  createDecryptStream,
  createEncryptStream,
  init,
} from '../src/index.js';

declare function it(name: string, callback: () => void): void;
declare function it(name: string, callback: () => Promise<void>): Promise<void>;

async function bufferEntireStream(
  readableStream: ReadableStream,
): Promise<Uint8Array> {
  const response = new Response(readableStream);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function createReadableStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (let index = 0; index < data.length; index += 1024) {
        controller.enqueue(data.slice(index, index + 1024));
      }
      controller.close();
    },
  });
}

it('should initialize Wasm module from exported API', async () => {
  const wasm = await init();
  assert.ok(wasm, 'Wasm module should be initialized');
});

it('should not throw if Wasm module is already initialized', async () => {
  await init();
});

it('should create encrypt and decrypt streams', () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);

  const encryptStream = createEncryptStream(key, iv);
  const decryptStream = createDecryptStream(key, iv);

  assert.ok(encryptStream, 'Encrypt stream should be created');
  assert.ok(decryptStream, 'Decrypt stream should be created');
});

it('should fail to create create encrypt and decrypt streams when key is not 32 bytes', () => {
  const key = new Uint8Array(16).fill(1); // not 32 bytes
  const iv = new Uint8Array(12).fill(2);

  assert.throws(
    () => createEncryptStream(key, iv),
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
    .pipeThrough(createEncryptStream(key, iv))
    .pipeTo(new WritableStream());
});

it('should encrypt and decrypt 1 byte of data', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const unencryptedData = new Uint8Array(1).fill(1);

  const decryptedData = await bufferEntireStream(
    createReadableStream(unencryptedData)
      .pipeThrough(createEncryptStream(key, iv))
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

  const decryptedData = await bufferEntireStream(
    createReadableStream(unencryptedData)
      .pipeThrough(createEncryptStream(key, iv))
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

it('should encrypt and decrypt several chunks of data of varying sizes', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const unencryptedData = new Uint8Array(1024 * 8 + 5).fill(1);

  const decryptedData = await bufferEntireStream(
    createReadableStream(unencryptedData)
      .pipeThrough(createEncryptStream(key, iv))
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
