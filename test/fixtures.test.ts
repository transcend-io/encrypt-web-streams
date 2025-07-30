/* eslint-disable @typescript-eslint/no-misused-promises */
import { assert } from '@esm-bundle/chai';
import fixturesJson from '../fixtures/files/fixtures.json' with { type: 'json' };
import { createDecryptStream, init } from '../src/index.js';
import type { Fixture } from '../fixtures/rebuild-fixtures.js';

declare function it(name: string, callback: () => void): Promise<void> | void;
const fixtures = fixturesJson as Fixture[];

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
    // Skip the big.zip.enc file as it doesn't exist
    if (fixture.url === '/files/encrypted/big.zip.enc') {
      continue;
    }
    // Get encrypted fixture
    const response = await fetch(`fixtures/${fixture.url}`);
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

    const decryptedResponse = new Response(
      sourceStream.pipeThrough(decryptStream),
    );

    let blob: Blob;
    try {
      blob = await decryptedResponse.blob();
    } catch (error) {
      console.error('Error getting blob:', error);
      console.error('Response status:', decryptedResponse.status);
      console.error('Response statusText:', decryptedResponse.statusText);
      throw error;
    }

    // Check if the blob is the same as the fixture
    const arrayBuffer = await blob.arrayBuffer();
    const decryptedChecksum = await crypto.subtle.digest(
      'SHA-256',
      arrayBuffer,
    );
    // Hex encode the decrypted checksum
    const decryptedChecksumHex = [...new Uint8Array(decryptedChecksum)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    assert.equal(decryptedChecksumHex, fixture.unencryptedChecksum);
  }
});
