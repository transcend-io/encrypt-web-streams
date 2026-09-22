import { assert } from '@esm-bundle/chai';

import {
  createDecryptionStream,
  createEncryptionStream,
  init,
  WASM_URL,
} from '../src/index.js';

/**
 * These tests exercise the custom wasm source passthrough in `init()`. They
 * live in their own file so the module-level `_wasmReady` cache starts empty
 * (web-test-runner loads each test file in a fresh page).
 */

/** The first four bytes of every wasm binary: `\0asm`. */
const WASM_MAGIC = new Uint8Array([0, 97, 115, 109]);

/** Bytes of the real wasm asset, fetched once from `WASM_URL`. */
let wasmBytes: Uint8Array;

async function bufferEntireStream(
  readableStream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  await readableStream.pipeTo(
    new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
    }),
  );
  const result = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Run `callback` while capturing `console.warn` calls.
 *
 * @param callback - The code to run
 * @returns Every warning message emitted while `callback` ran
 */
async function captureWarnings(
  callback: () => Promise<void>,
): Promise<string[]> {
  const warnings: string[] = [];
  const originalWarn = console.warn.bind(console);
  console.warn = (...messages: unknown[]) => {
    warnings.push(messages.map(String).join(' '));
  };
  try {
    await callback();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

it('should export WASM_URL pointing at the wasm asset', async () => {
  assert.match(
    WASM_URL,
    /\/wasm\/aes_gcm_stream_wasm_bg\.wasm$/,
    'WASM_URL should resolve to the packaged wasm asset',
  );

  const response = await fetch(WASM_URL);
  assert.ok(
    response.ok,
    `Fetching WASM_URL should succeed (${String(response.status)})`,
  );
  wasmBytes = new Uint8Array(await response.arrayBuffer());
  assert.deepStrictEqual(
    wasmBytes.slice(0, 4),
    WASM_MAGIC,
    'WASM_URL should serve a real wasm binary',
  );
});

it('should use the custom module source rather than the default URL', async () => {
  // If the custom source were dropped (e.g. wrong key passed to the generated
  // loader), the loader would fall back to WASM_URL and this would succeed.
  const corruptBytes = new Uint8Array(wasmBytes);
  corruptBytes.set([255, 255, 255, 255], 0);

  let error: unknown;
  try {
    await init({ moduleOrPath: corruptBytes });
  } catch (error_) {
    error = error_;
  }
  assert.instanceOf(
    error,
    WebAssembly.CompileError,
    'Corrupt custom bytes should surface as a CompileError',
  );
});

it('should initialize from custom bytes without a deprecation warning', async () => {
  const warnings = await captureWarnings(() =>
    init({ moduleOrPath: wasmBytes }),
  );
  assert.deepStrictEqual(
    warnings,
    [],
    'Object-form init() should not trigger the wasm-bindgen deprecation warning',
  );

  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const plaintext = new TextEncoder().encode('Hello, World!');
  const decrypted = await bufferEntireStream(
    new ReadableStream({
      start(controller) {
        controller.enqueue(plaintext);
        controller.close();
      },
    })
      .pipeThrough(createEncryptionStream(key, iv))
      .pipeThrough(createDecryptionStream(key, iv)),
  );
  assert.deepStrictEqual(
    decrypted,
    plaintext,
    'Module initialized from custom bytes should round-trip data',
  );
});
