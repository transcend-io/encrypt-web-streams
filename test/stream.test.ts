import { assert } from '@esm-bundle/chai';
import {
  createDecryptionStream,
  createEncryptionStream,
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

  const encryptionStream = createEncryptionStream(key, iv);
  const decryptionStream = createDecryptionStream(key, iv);

  assert.ok(encryptionStream, 'Encrypt stream should be created');
  assert.ok(decryptionStream, 'Decrypt stream should be created');
});

it('should fail to create create encrypt and decrypt streams when key is not 32 bytes', () => {
  const key = new Uint8Array(16).fill(1); // not 32 bytes
  const iv = new Uint8Array(12).fill(2);

  assert.throws(
    () => createEncryptionStream(key, iv),
    /Key must be 32 bytes/,
    'createEncryptionStream should fail when key is not 32 bytes',
  );
  assert.throws(
    () => createDecryptionStream(key, iv),
    /Key must be 32 bytes/,
    'createDecryptionStream should fail when key is not 32 bytes',
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
    .pipeThrough(createEncryptionStream(key, iv))
    .pipeTo(new WritableStream());
});

it('should encrypt and decrypt 1 byte of data', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const unencryptedData = new Uint8Array(1).fill(1);

  const decryptedData = await bufferEntireStream(
    createReadableStream(unencryptedData)
      .pipeThrough(createEncryptionStream(key, iv))
      .pipeThrough(createDecryptionStream(key, iv)),
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
      .pipeThrough(createEncryptionStream(key, iv))
      .pipeThrough(createDecryptionStream(key, iv)),
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
      .pipeThrough(createEncryptionStream(key, iv))
      .pipeThrough(createDecryptionStream(key, iv)),
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

it('should throw an error if getAuthTag() is called before the encryption stream is complete', () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const encryptionStream = createEncryptionStream(key, iv, {
    detachAuthTag: true,
  });

  assert.throws(
    () => encryptionStream.getAuthTag(),
    /The authentication tag is not available until the encryption stream has finished./,
  );
});

it('should throw a TypeError if getAuthTag() is called without having specified detachAuthTag: true', () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const encryptionStream = createEncryptionStream(key, iv);

  assert.throws(
    () => encryptionStream.getAuthTag(),
    /The authentication tag is not available when `detachAuthTag` is false./,
  );
});

it('should successfully handle a detached auth tag', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const unencryptedData = new Uint8Array(1024).fill(1);

  // Encrypt
  const encryptionStream = createEncryptionStream(key, iv, {
    detachAuthTag: true,
  });
  const readableStream = createReadableStream(unencryptedData);
  const encryptedData = await bufferEntireStream(
    readableStream.pipeThrough(encryptionStream),
  );

  // Get the auth tag after encryption is complete
  const authTag = encryptionStream.getAuthTag();
  assert.strictEqual(authTag.length, 16, 'Auth tag should be 16 bytes');

  // Decrypt 1: Provide the auth tag directly
  const decryptedData1 = await bufferEntireStream(
    createReadableStream(encryptedData).pipeThrough(
      createDecryptionStream(key, iv, {
        authTag,
      }),
    ),
  );
  assert.strictEqual(
    decryptedData1.length,
    unencryptedData.length,
    'Decrypted data (1) should have same length as unencrypted data',
  );
  assert.deepStrictEqual(
    decryptedData1,
    unencryptedData,
    'Decrypted data (1) should match unencrypted data',
  );

  // Decrypt 2: Defer the auth tag
  const decryptionStream2 = createDecryptionStream(key, iv, {
    authTag: 'defer',
  });
  const decryptedDataPromise = bufferEntireStream(
    createReadableStream(encryptedData).pipeThrough(decryptionStream2),
  );
  decryptionStream2.setAuthTag(authTag);
  const decryptedData2 = await decryptedDataPromise;
  assert.strictEqual(
    decryptedData2.length,
    unencryptedData.length,
    'Decrypted data should have same length as unencrypted data',
  );
  assert.deepStrictEqual(
    decryptedData2,
    unencryptedData,
    'Decrypted data should match unencrypted data',
  );
});
