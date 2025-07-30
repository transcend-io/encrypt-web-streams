/* eslint-disable @typescript-eslint/no-misused-promises */
import { assert } from '@esm-bundle/chai';
import fixturesJson from '../fixtures/files/fixtures.json' with { type: 'json' };
import { createDecryptStream, init } from '../src/index.js';
import type { Fixture } from '../fixtures/rebuild-fixtures.js';
import { createSHA256 } from 'hash-wasm';

declare function it(name: string, callback: () => void): Promise<void> | void;
const fixtures = fixturesJson as Fixture[];
const REMOTE_FIXTURES_URL =
  'https://fixtures-for-conflux-and-penumbra.s3.us-east-1.amazonaws.com';

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

void it('should decrypt fixtures', async () => {
  for (const fixture of fixtures) {
    if (fixture.url === '/files/encrypted/big.zip.enc') {
      // TODO: debug checksum mismatch
      continue;
    }

    const url =
      fixture.url === '/files/encrypted/big.zip.enc'
        ? `${REMOTE_FIXTURES_URL}/files/encrypted/big.zip.enc`
        : `fixtures/${fixture.url}`;

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

    const decryptedChecksumHex = await new Promise<string>((resolve) => {
      void sourceStream.pipeThrough(decryptStream).pipeTo(
        new WritableStream({
          write(chunk) {
            sha256.update(chunk);
          },
          close() {
            resolve(sha256.digest('hex'));
          },
        }),
      );
    });

    assert.equal(decryptedChecksumHex, fixture.unencryptedChecksum);
  }
});
