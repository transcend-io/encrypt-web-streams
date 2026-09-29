import { assert } from '@esm-bundle/chai';

import { getEmbeddedWasmBytes } from '../src/embedded-wasm.js';
import {
  createDecryptionStream,
  createEncryptionStream,
  init,
  WASM_URL,
} from '../src/index.js';

/**
 * These tests exercise the default (embedded) `init()` path. They live in their
 * own file so the module-level init cache starts empty (web-test-runner loads
 * each test file in a fresh page).
 */

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

it('should embed the same bytes as the packaged wasm asset', async () => {
  const response = await fetch(WASM_URL);
  assert.ok(
    response.ok,
    `Fetching WASM_URL should succeed (${String(response.status)})`,
  );
  const fromUrl = new Uint8Array(await response.arrayBuffer());
  assert.deepStrictEqual(
    getEmbeddedWasmBytes(),
    fromUrl,
    'Embedded bytes should be byte-identical to wasm/aes_gcm_stream_wasm_bg.wasm',
  );
});

it('should not cache a failed init()', async () => {
  const corruptBytes = getEmbeddedWasmBytes();
  corruptBytes.set([255, 255, 255, 255], 0);

  let error: unknown;
  try {
    await init({ module_or_path: corruptBytes });
  } catch (error_) {
    error = error_;
  }
  assert.instanceOf(error, WebAssembly.CompileError);

  // The next test's default init() must still be able to succeed.
  let secondError: unknown;
  try {
    await init({ module_or_path: corruptBytes });
  } catch (error_) {
    secondError = error_;
  }
  assert.instanceOf(
    secondError,
    WebAssembly.CompileError,
    'A retried init() should re-attempt instantiation rather than reuse the failure',
  );
});

it('should init() from embedded bytes without fetching, sharing one instantiation across concurrent callers', async () => {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const originalInstantiate = WebAssembly.instantiate.bind(WebAssembly);
  const fetchedUrls: string[] = [];
  let instantiateCalls = 0;

  globalThis.fetch = ((input: RequestInfo | URL, init_?: RequestInit) => {
    fetchedUrls.push(String(input instanceof Request ? input.url : input));
    return originalFetch(input, init_);
  }) as typeof fetch;
  WebAssembly.instantiate = ((
    bytes: BufferSource,
    imports?: WebAssembly.Imports,
  ) => {
    instantiateCalls += 1;
    return originalInstantiate(bytes, imports);
  }) as typeof WebAssembly.instantiate;

  try {
    await Promise.all([init(), init(), init()]);
  } finally {
    globalThis.fetch = originalFetch;
    WebAssembly.instantiate = originalInstantiate;
  }

  assert.deepStrictEqual(
    fetchedUrls.filter((url) => url.includes('.wasm')),
    [],
    'Default init() must not request the .wasm asset over the network',
  );
  assert.strictEqual(
    instantiateCalls,
    1,
    'Concurrent init() calls should share a single WebAssembly.instantiate',
  );

  const key = new Uint8Array(32).fill(1);
  const iv = new Uint8Array(12).fill(2);
  const plaintext = new TextEncoder().encode('embedded-init-round-trip');
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
    'Module initialized from embedded bytes should round-trip data',
  );
});
