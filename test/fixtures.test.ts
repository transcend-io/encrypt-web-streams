import { assert } from '@esm-bundle/chai';
import fixturesJson from './fixtures/files/fixtures.json' with { type: 'json' };
import { createDecryptStream, init } from '../src/index.js';
import type { Fixture } from './fixtures/rebuild-fixtures.js';
import { createSHA256 } from 'hash-wasm';
import prettyMilliseconds from 'pretty-ms';
import prettyBytes from 'pretty-bytes';

declare function it(
  name: string,
  callback: () => Promise<void>,
): Promise<void> | void;

// Constants
const FIXTURES_SERVER_URL = 'http://127.0.0.1:8142';

// Feature flags
const FF_BIG_FIXTURES = 'include' as 'include' | 'skip' | 'only';

// Test fixtures
const fixtures = fixturesJson.filter((fixture) =>
  FF_BIG_FIXTURES === 'include'
    ? true
    : // eslint-disable-next-line unicorn/no-nested-ternary
      FF_BIG_FIXTURES === 'skip'
      ? !fixture.filePrefix.includes('big')
      : fixture.filePrefix.includes('big'),
) as Fixture[];

// Initialize WASM
await init();

/** Helper to convert base64-encoded string to Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64); // decode to binary string
  const length = bin.length;
  const bytes = new Uint8Array(length); // allocate 32-byte array

  for (let index = 0; index < length; index++) {
    const char = bin.codePointAt(index);
    if (char === undefined) {
      throw new Error(`Invalid base64 string: ${base64}`);
    }
    bytes[index] = char; // map each char to its byte value
  }

  return bytes;
}

/** Helper to get decryption info from fixture. This is the metadata from the encryption process. */
function getDecryptionInfo(fixture: Fixture) {
  return {
    key: base64ToUint8Array(fixture.decryptionOptions.key),
    nonce: base64ToUint8Array(fixture.decryptionOptions.iv),
    authTag: base64ToUint8Array(fixture.decryptionOptions.authTag),
  };
}

// Decrypt every fixture
for (const fixture of fixtures) {
  await it(`should decrypt ${fixture.filePrefix}, pass authentication tag verification, and match unencrypted file checksum`, async () => {
    const url = new URL(fixture.url, FIXTURES_SERVER_URL).toString();

    // Get encrypted fixture
    const response = await fetch(url);
    const sourceStream = response.body;
    if (!sourceStream) {
      throw new Error(`Failed to fetch fixture ${fixture.url}`);
    }

    // Decrypt fixture
    const decryptionInfo = getDecryptionInfo(fixture);

    const decryptStream = createDecryptStream(
      decryptionInfo.key,
      decryptionInfo.nonce,
      decryptionInfo.authTag,
    );

    const sha256 = await createSHA256();
    sha256.init();

    const startTime = performance.now();

    // Stream decrypt the file and compute a checksum (in addition to built-in verification of the authentication tag)
    let decryptedChecksum: string | undefined;
    await sourceStream.pipeThrough(decryptStream).pipeTo(
      new WritableStream({
        write(chunk) {
          sha256.update(chunk);
        },
        close() {
          decryptedChecksum = sha256.digest('hex');
        },
        abort(reason) {
          const error =
            reason instanceof Error
              ? reason
              : // eslint-disable-next-line unicorn/no-nested-ternary
                typeof reason === 'string'
                ? new Error(reason)
                : new Error('Unknown error');
          error.message = `Stream was aborted: ${error.message}`;
          error.name = 'StreamAbortedError';
          throw error;
        },
      }),
    );

    assert.equal(
      decryptedChecksum,
      fixture.unencryptedChecksum,
      'The decryption stream was successful and passed authentication tag verification, yet our own checksums did not match',
    );

    const endTime = performance.now();
    const timingMs = endTime - startTime;
    const timingPretty = prettyMilliseconds(timingMs);
    const sizePretty = prettyBytes(fixture.encryptedSize);
    const bitratePretty = prettyBytes(
      fixture.encryptedSize / (timingMs / 1000),
    );
    console.log(
      `Successfully decrypted ${fixture.filePrefix} in ${timingPretty} (${bitratePretty}/s) - ${sizePretty} total.`,
    );
  });
}

await it('should fail authentication for malformed auth tag', async () => {
  const fixture = fixtures[0];
  if (!fixture) {
    throw new TypeError('No fixture found');
  }
  const url = new URL(fixture.url, FIXTURES_SERVER_URL).toString();

  // Get encrypted fixture
  const response = await fetch(url);
  const sourceStream = response.body;
  if (!sourceStream) {
    throw new Error(`Failed to fetch fixture ${fixture.url}`);
  }

  // Decrypt fixture
  const decryptionInfo = getDecryptionInfo(fixture);

  const malformedAuthTag = new Uint8Array(decryptionInfo.authTag.length).fill(
    decryptionInfo.authTag.length,
  );

  const decryptStream = createDecryptStream(
    decryptionInfo.key,
    decryptionInfo.nonce,
    malformedAuthTag,
  );

  let expectedError: Error | undefined;
  try {
    await sourceStream.pipeThrough(decryptStream).pipeTo(
      new WritableStream({
        write() {
          // Do nothing
        },
        close() {
          // Do nothing
        },
        abort(reason) {
          const error =
            reason instanceof Error
              ? reason
              : // eslint-disable-next-line unicorn/no-nested-ternary
                typeof reason === 'string'
                ? new Error(reason)
                : new Error('Unknown error');
          error.message = `Stream was aborted: ${error.message}`;
          error.name = 'StreamAbortedError';
          expectedError = error;
        },
      }),
    );
  } catch {
    // Do nothing
  }

  assert.instanceOf(
    expectedError,
    Error,
    'The decryption stream did not throw an error when the authentication tag was malformed',
  );
  assert.match(
    expectedError.message,
    /Tag mismatch, expected/,
    'The decryption stream threw an error, but the error message was unexpected for a malformed authentication tag error',
  );
});
