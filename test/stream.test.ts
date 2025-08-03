import { assert } from '@esm-bundle/chai';
import {
  createDecryptionStream,
  createEncryptionStream,
  init,
} from '../src/index.js';

declare function it(name: string, callback: () => void): void;
declare function it(name: string, callback: () => Promise<void>): Promise<void>;

async function bufferEntireStream(
  readableStream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = readableStream.getReader();
  const chunks = [];
  let totalLength = 0;

  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      totalLength += value.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } finally {
    reader.releaseLock();
  }
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
  await init();
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

it('should handle a detached auth tag', async () => {
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

  // Decrypt 3: Defer the auth tag for a long time
  const decryptionStream3 = createDecryptionStream(key, iv, {
    authTag: 'defer',
  });
  const decryptedDataPromise3 = bufferEntireStream(
    createReadableStream(encryptedData).pipeThrough(decryptionStream3),
  );
  setTimeout(() => {
    decryptionStream3.setAuthTag(authTag);
  }, 10_000);
  const decryptedData3 = await decryptedDataPromise3;
  assert.strictEqual(
    decryptedData3.length,
    unencryptedData.length,
    'Decrypted data should have same length as unencrypted data',
  );
  assert.deepStrictEqual(
    decryptedData3,
    unencryptedData,
    'Decrypted data should match unencrypted data',
  );
});

/**
 * Export the CryptoKey as a Uint8Array, after validating it for its intended
 * use
 */
async function getAesKey(
  key: CryptoKey,
  operation: 'encrypt' | 'decrypt',
): Promise<Uint8Array> {
  const errors: string[] = [];
  if (key.algorithm.name !== 'AES-GCM') {
    errors.push('Key is not an AES-GCM key');
  }
  if ((key.algorithm as AesKeyAlgorithm).length !== 256) {
    errors.push('Key is not a 256-bit key');
  }
  if (!key.usages.includes(operation)) {
    errors.push(`Key is not used for the requested operation: ${operation}`);
  }
  if (!key.extractable) {
    errors.push('Key is not extractable');
  }
  if (errors.length > 0) {
    throw new TypeError(
      `The provided CryptoKey is not appropriate for the requested operation:\n - ${errors.join('\n - ')}`,
    );
  }

  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

for (const length of [1, 1024, 1024 * 8 + 5]) {
  it(`should decrypt ${length.toLocaleString()} bytes of data from WebCrypto`, async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const unencryptedData = new Uint8Array(length).fill(1);

    // Encrypt with WebCrypto, decrypt with this library
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      unencryptedData,
    );

    const encryptedDataUint8Array = new Uint8Array(encryptedData);

    const decryptionStream = createDecryptionStream(
      await getAesKey(key, 'decrypt'),
      iv,
    );
    const decryptedData = await bufferEntireStream(
      createReadableStream(encryptedDataUint8Array).pipeThrough(
        decryptionStream,
      ),
    );

    assert.deepStrictEqual(
      decryptedData,
      unencryptedData,
      'Decrypted data should match unencrypted data',
    );
  });

  it(`should encrypt ${length.toLocaleString()} bytes of data that can be decrypted by WebCrypto`, async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const unencryptedData = new Uint8Array(length).fill(1);

    // Encrypt with this library
    const encryptionStream = createEncryptionStream(
      await getAesKey(key, 'encrypt'),
      iv,
    );
    const encryptedData = await bufferEntireStream(
      createReadableStream(unencryptedData).pipeThrough(encryptionStream),
    );

    // Decrypt with WebCrypto
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData,
    );

    const decryptedDataUint8Array = new Uint8Array(decryptedData);

    assert.deepStrictEqual(
      decryptedDataUint8Array,
      unencryptedData,
      'WebCrypto decrypted data should match unencrypted data',
    );
  });
}

it('should handle a detached auth tag with an empty stream', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const unencryptedData = new Uint8Array(0);

  // Encrypt
  const encryptionStream = createEncryptionStream(key, iv, {
    detachAuthTag: true,
  });
  const readableStream = createReadableStream(unencryptedData);
  const encryptedData = await bufferEntireStream(
    readableStream.pipeThrough(encryptionStream),
  );
  assert.strictEqual(
    encryptedData.length,
    0,
    'Encrypted data for an empty stream should be empty',
  );

  // Get the auth tag after encryption is complete
  const authTag = encryptionStream.getAuthTag();
  assert.strictEqual(authTag.length, 16, 'Auth tag should be 16 bytes');

  // Decrypt: Provide the auth tag directly
  const decryptedData = await bufferEntireStream(
    createReadableStream(encryptedData).pipeThrough(
      createDecryptionStream(key, iv, {
        authTag,
      }),
    ),
  );
  assert.strictEqual(
    decryptedData.length,
    0,
    'Decrypted data for an empty stream should be empty',
  );
});

it('should throw an error if setAuthTag() is called more than once', async () => {
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

  // Defer the auth tag
  const decryptionStream = createDecryptionStream(key, iv, {
    authTag: 'defer',
  });
  // Start the stream, but don't wait for it to finish
  void bufferEntireStream(
    createReadableStream(encryptedData).pipeThrough(decryptionStream),
  );

  // Set the auth tag
  decryptionStream.setAuthTag(authTag);
  assert.throws(() => {
    // Set the auth tag again
    decryptionStream.setAuthTag(authTag);
  }, /Unexpected call to `setAuthTag\(\)`/);
});

it('should throw an error if setAuthTag() is called after the stream is finished', async () => {
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

  // Defer the auth tag
  const decryptionStream = createDecryptionStream(key, iv, {
    authTag: 'defer',
  });
  // Start the stream, but don't wait for it to finish
  const bufferPromise = bufferEntireStream(
    createReadableStream(encryptedData).pipeThrough(decryptionStream),
  );

  // Set the auth tag
  decryptionStream.setAuthTag(authTag);
  await bufferPromise;
  assert.throws(() => {
    decryptionStream.setAuthTag(authTag);
  }, /The decryption stream has already finished/);
});

it('should encrypt and decrypt with additionalData', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const unencryptedData = new Uint8Array(1024).fill(3);
  const additionalData = new Uint8Array(32).fill(4);

  const encryptedData = await bufferEntireStream(
    createReadableStream(unencryptedData).pipeThrough(
      createEncryptionStream(key, iv, { additionalData }),
    ),
  );

  const decryptedData = await bufferEntireStream(
    createReadableStream(encryptedData).pipeThrough(
      createDecryptionStream(key, iv, { additionalData }),
    ),
  );

  assert.deepStrictEqual(
    decryptedData,
    unencryptedData,
    'Decrypted data should match unencrypted data',
  );
});

it('should fail decryption if additionalData is missing', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const unencryptedData = new Uint8Array(1024).fill(3);
  const additionalData = new Uint8Array(32).fill(4);

  const encryptedData = await bufferEntireStream(
    createReadableStream(unencryptedData).pipeThrough(
      createEncryptionStream(key, iv, { additionalData }),
    ),
  );

  const decryptionPromise = bufferEntireStream(
    createReadableStream(encryptedData)
      // No additionalData here
      .pipeThrough(createDecryptionStream(key, iv)),
  );

  try {
    await decryptionPromise;
    assert.fail('Decryption should have failed');
  } catch (error) {
    assert.instanceOf(error, Error, 'Error should be an Error instance');
    assert.match(
      error.message,
      /Failed to finalize decryption stream/,
      'Error message should indicate finalization failure',
    );
  }
});

it('should fail decryption if additionalData is different', async () => {
  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const unencryptedData = new Uint8Array(1024).fill(3);
  const additionalData = new Uint8Array(32).fill(4);
  const wrongAdditionalData = new Uint8Array(32).fill(5);

  const encryptedData = await bufferEntireStream(
    createReadableStream(unencryptedData).pipeThrough(
      createEncryptionStream(key, iv, { additionalData }),
    ),
  );

  const decryptionPromise = bufferEntireStream(
    createReadableStream(encryptedData).pipeThrough(
      createDecryptionStream(key, iv, { additionalData: wrongAdditionalData }),
    ),
  );

  try {
    await decryptionPromise;
    assert.fail('Decryption should have failed');
  } catch (error) {
    assert.instanceOf(error, Error, 'Error should be an Error instance');
    assert.match(
      error.message,
      /Failed to finalize decryption stream/,
      'Error message should indicate finalization failure',
    );
  }
});
