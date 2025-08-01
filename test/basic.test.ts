/* eslint-disable @typescript-eslint/no-misused-promises */
import { assert } from '@esm-bundle/chai';
import { Decryptor, Encryptor } from '../wasm/aes_gcm_stream_wasm.js';
import {
  createDecryptStream,
  createEncryptStream,
  init,
} from '../src/index.js';

declare function it(name: string, callback: () => void): Promise<void> | void;

void it('should initialize WASM module', async () => {
  const wasm = await init();
  assert.ok(wasm, 'WASM module should be initialized');
});

void it('should create encrypt and decrypt streams', () => {
  const key = new Uint8Array(32).fill(1);
  const nonce = new Uint8Array(12).fill(2);

  const encryptStream = createEncryptStream(key, nonce, false);
  const decryptStream = createDecryptStream(key, nonce);

  assert.ok(encryptStream, 'Encrypt stream should be created');
  assert.ok(decryptStream, 'Decrypt stream should be created');
});

void it('should encrypt data directly with Encryptor', () => {
  const key = new Uint8Array(32).fill(1);
  const nonce = new Uint8Array(12).fill(2);
  const plaintext = new TextEncoder().encode('Hello, World!');

  const encryptor = new Encryptor(key, nonce);
  encryptor.update(plaintext);
  const final = encryptor.finalize();

  // The update method might return empty data (buffering), but finalize should produce output
  assert.ok(final.length > 0, 'Should produce final encrypted data');
  assert.notStrictEqual(
    final,
    plaintext,
    'Final encrypted data should be different from plaintext',
  );
});

void it('should decrypt data directly with Decryptor', () => {
  const key = new Uint8Array(32).fill(1);
  const nonce = new Uint8Array(12).fill(2);
  const plaintext = new TextEncoder().encode('Hello, World!');

  // First encrypt
  const encryptor = new Encryptor(key, nonce);
  encryptor.update(plaintext);
  const encrypted = encryptor.finalize();

  // Then decrypt
  const decryptor = new Decryptor(key, nonce);
  const decrypted = decryptor.update(encrypted);
  const final = decryptor.finalize();

  // Combine decrypted chunks
  const result = new Uint8Array(decrypted.length + final.length);
  result.set(decrypted, 0);
  result.set(final, decrypted.length);

  assert.strictEqual(
    result.length,
    plaintext.length,
    'Decrypted data should have same length as original',
  );
  assert.deepStrictEqual(
    result,
    plaintext,
    'Decrypted data should match original plaintext',
  );
});

void it('should handle multiple chunks correctly', () => {
  const key = new Uint8Array(32).fill(1);
  const nonce = new Uint8Array(12).fill(2);
  const chunk1 = new TextEncoder().encode('Hello, ');
  const chunk2 = new TextEncoder().encode('World!');

  // Encrypt multiple chunks
  const encryptor = new Encryptor(key, nonce);
  const encrypted1 = encryptor.update(chunk1);
  const encrypted2 = encryptor.update(chunk2);
  const final = encryptor.finalize();

  // Combine all encrypted data
  const totalLength = encrypted1.length + encrypted2.length + final.length;
  const encrypted = new Uint8Array(totalLength);
  let offset = 0;
  encrypted.set(encrypted1, offset);
  offset += encrypted1.length;
  encrypted.set(encrypted2, offset);
  offset += encrypted2.length;
  encrypted.set(final, offset);

  // Decrypt
  const decryptor = new Decryptor(key, nonce);
  const decrypted1 = decryptor.update(encrypted);
  const decrypted2 = decryptor.finalize();

  // Combine decrypted data
  const result = new Uint8Array(decrypted1.length + decrypted2.length);
  result.set(decrypted1, 0);
  result.set(decrypted2, decrypted1.length);

  const expected = new TextEncoder().encode('Hello, World!');
  assert.strictEqual(
    result.length,
    expected.length,
    'Decrypted data should have same length as original',
  );
  assert.deepStrictEqual(
    result,
    expected,
    'Decrypted data should match original plaintext',
  );
});
