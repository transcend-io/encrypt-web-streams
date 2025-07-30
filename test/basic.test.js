import { test } from 'node:test';
import assert from 'node:assert';
import { init, createEncryptStream, createDecryptStream } from '../src/index.js';

test('should initialize WASM module', async () => {
  const wasm = await init();
  assert.ok(wasm, 'WASM module should be initialized');
});

test('should create encrypt and decrypt streams', async () => {
  const key = new Uint8Array(32).fill(1);
  const nonce = new Uint8Array(12).fill(2);
  
  const encryptStream = createEncryptStream(key, nonce);
  const decryptStream = createDecryptStream(key, nonce);
  
  assert.ok(encryptStream, 'Encrypt stream should be created');
  assert.ok(decryptStream, 'Decrypt stream should be created');
}); 