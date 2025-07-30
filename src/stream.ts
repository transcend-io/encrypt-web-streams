import initWasm, {
  Decryptor,
  Encryptor,
  type InitOutput,
} from '../pkg/aes_gcm_stream_wasm.js';

let _wasmReady: Promise<InitOutput> | undefined;
export function init(): Promise<InitOutput> {
  _wasmReady ??= initWasm();
  return _wasmReady;
}

/**
 * Create a native TransformStream that encrypts via the WASM Encryptor.
 */
export function createEncryptStream(
  key: Uint8Array,
  nonce: Uint8Array,
  adata?: Uint8Array,
): TransformStream<Uint8Array, Uint8Array> {
  const enc = new Encryptor(key, nonce);
  if (adata) enc.init_adata(adata);

  let hasData = false;

  return new TransformStream({
    transform(chunk, controller) {
      // ensure Uint8Array
      const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      const out = enc.update(buf);
      hasData = true;
      // Only enqueue if there's actual output
      if (out.length > 0) {
        controller.enqueue(out);
      }
    },
    flush(controller) {
      if (hasData) {
        const final = enc.finalize();
        controller.enqueue(final);
      }
    },
  });
}

/**
 * Create a native TransformStream that decrypts via the WASM Decryptor.
 *
 * @param key - 32-byte encryption key
 * @param nonce - 12-byte nonce (recommended)
 * @param adata - Optional additional authenticated data
 * @param authTag - Optional authentication tag to append to ciphertext (for Node.js compatibility)
 */
export function createDecryptStream(
  key: Uint8Array,
  nonce: Uint8Array,
  authTag?: Uint8Array,
  adata?: Uint8Array,
): TransformStream<Uint8Array, Uint8Array> {
  const dec = new Decryptor(key, nonce);
  if (adata) dec.init_adata(adata);

  let hasData = false;

  return new TransformStream({
    transform(chunk, controller) {
      const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      const out = dec.update(buf);
      hasData = true;
      // Only enqueue if there's actual output
      if (out.length > 0) {
        controller.enqueue(out);
      }
    },
    flush(controller) {
      if (hasData) {
        if (authTag) {
          // Append the auth tag as the final chunk
          const out = dec.update(authTag);
          if (out.length > 0) {
            controller.enqueue(out);
          }
        }
        // might throw on auth failure
        const last = dec.finalize();
        controller.enqueue(last);
      }
    },
  });
}
