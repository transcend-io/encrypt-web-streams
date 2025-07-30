import initWasm, { Encryptor, Decryptor, type InitOutput } from "./pkg/aes_gcm_stream_wasm.js";

let _wasmReady: Promise<InitOutput> | null = null;
export function init() {
  if (!_wasmReady) _wasmReady = initWasm();
  return _wasmReady;
}

/**
 * Create a native TransformStream that encrypts via the WASM Encryptor.
 */
export function createEncryptStream(
  key: Uint8Array,
  nonce: Uint8Array,
  adata?: Uint8Array
): TransformStream<Uint8Array, Uint8Array> {
  const enc = new Encryptor(key, nonce);
  if (adata) enc.init_adata(adata);

  return new TransformStream({
    transform(chunk, controller) {
      // ensure Uint8Array
      const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      const out = enc.update(buf);
      controller.enqueue(out);
    },
    flush(controller) {
      const final = enc.finalize();
      controller.enqueue(final);
    },
  });
}

/**
 * Create a native TransformStream that decrypts via the WASM Decryptor.
 */
export function createDecryptStream(
  key: Uint8Array,
  nonce: Uint8Array,
  adata?: Uint8Array
): TransformStream<Uint8Array, Uint8Array> {
  const dec = new Decryptor(key, nonce);
  if (adata) dec.init_adata(adata);

  return new TransformStream({
    transform(chunk, controller) {
      const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      const out = dec.update(buf);
      controller.enqueue(out);
    },
    async flush(controller) {
      // might throw on auth failure
      const last = await dec.finalize();
      controller.enqueue(last);
    },
  });
}