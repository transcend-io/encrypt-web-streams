import { assert } from '@esm-bundle/chai';
import {
  createDecryptStream,
  createEncryptStream,
  init,
} from '../src/index.js';

declare function it(name: string, callback: () => void): void;
declare function it(name: string, callback: () => Promise<void>): Promise<void>;

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
