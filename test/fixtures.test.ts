import { assert } from '@esm-bundle/chai';
import fixturesJson from '../fixtures/files/fixtures.json' with { type: 'json' };
import { createDecryptStream, init } from '../src/index.js';
import type { Fixture } from '../fixtures/rebuild-fixtures.js';
import { createSHA256 } from 'hash-wasm';

declare function it(
  name: string,
  callback: () => Promise<void>,
): Promise<void> | void;

// Constants
const LOCAL_FIXTURES_BASE_PATHNAME = '/fixtures';
const REMOTE_FIXTURES_BASE_PATHNAME =
  'https://fixtures-for-conflux-and-penumbra.s3.us-east-1.amazonaws.com';

// Features
const FF_LOCAL_MODE = true as boolean;
const FF_BIG_FIXTURES = 'skip' as 'include' | 'skip' | 'only';

// Test fixtures
const fixtures = fixturesJson.filter((fixture) =>
  FF_BIG_FIXTURES === 'include'
    ? true
    : // eslint-disable-next-line unicorn/no-nested-ternary
      FF_BIG_FIXTURES === 'skip'
      ? !fixture.filePrefix.includes('big')
      : fixture.filePrefix.includes('big'),
) as Fixture[];
const fixturesBasePathname = FF_LOCAL_MODE
  ? LOCAL_FIXTURES_BASE_PATHNAME
  : REMOTE_FIXTURES_BASE_PATHNAME;

// Initialize WASM
await init();

function base64ToUint8Array(base64: string) {
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

function getDecryptionInfo(fixture: Fixture) {
  return {
    key: base64ToUint8Array(fixture.decryptionOptions.key),
    nonce: base64ToUint8Array(fixture.decryptionOptions.iv),
    authTag: base64ToUint8Array(fixture.decryptionOptions.authTag),
  };
}

for (const fixture of fixtures) {
  await it(`should decrypt ${fixture.filePrefix}`, async () => {
    const url = `${fixturesBasePathname}${fixture.url}`;

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
      decryptionInfo.authTag, // authTag
    );

    const sha256 = await createSHA256();
    sha256.init();

    const decryptedChecksumHex = await new Promise<string>(
      (resolve, reject) => {
        void sourceStream.pipeThrough(decryptStream).pipeTo(
          new WritableStream({
            write(chunk) {
              sha256.update(chunk);
            },
            close() {
              resolve(sha256.digest('hex'));
            },
            abort(reason) {
              reject(
                reason instanceof Error
                  ? reason
                  : // eslint-disable-next-line unicorn/no-nested-ternary
                    typeof reason === 'string'
                    ? new Error(reason)
                    : new Error('Unknown error'),
              );
            },
          }),
        );
      },
    );

    assert.equal(decryptedChecksumHex, fixture.unencryptedChecksum);
  });
}
