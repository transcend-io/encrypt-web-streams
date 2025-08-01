import initWasm, {
  Decryptor,
  Encryptor,
  type InitOutput,
} from '../wasm/aes_gcm_stream_wasm.js';

let _wasmReady: Promise<InitOutput> | undefined;
/**
 * Initialize the WASM module.
 *
 * @returns A promise that resolves to the WASM module.
 */
export function init(): Promise<InitOutput> {
  _wasmReady ??= initWasm();
  return _wasmReady;
}

class EncryptStream extends TransformStream<Uint8Array, Uint8Array> {
  /** Whether the authentication tag is detached from the ciphertext. */
  private _detachAuthTag: boolean;
  /** The authentication tag, if it was detached. */
  private _authTag: Uint8Array | undefined;

  /**
   * Get the authentication tag.
   *
   * The getAuthTag() method should ONLY be called if:
   *   1. `detachAuthTag` was true in the constructor.
   *   2. The encryption stream has been fully read.
   *
   * getAuthTag() will throw a TypeError if `detachAuthTag` was false in the constructor.
   * getAuthTag() will return `undefined` if the encryption stream has not completed.
   */
  public getAuthTag(): Uint8Array | undefined {
    if (!this._detachAuthTag) {
      throw new TypeError(
        'The authentication tag is not available when `detachAuthTag` is false.' +
          '\nIt will be appended to the ciphertext.',
      );
    }
    return this._authTag;
  }

  private constructor(
    transformer: Transformer<Uint8Array, Uint8Array>,
    detachAuthTag: boolean,
  ) {
    super(transformer);
    this._detachAuthTag = detachAuthTag;
  }

  static create(
    key: Uint8Array,
    nonce: Uint8Array,
    detachAuthTag: boolean,
    adata?: Uint8Array,
  ): EncryptStream {
    const enc = new Encryptor(key, nonce);
    if (adata) enc.init_adata(adata);

    let hasData = false;
    // eslint-disable-next-line prefer-const
    let stream: EncryptStream;

    const transformer: Transformer<Uint8Array, Uint8Array> = {
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
          const remainingBytes = final.slice(0, -16);
          const authTag = final.slice(-16);

          // Enqueue remaining bytes
          controller.enqueue(remainingBytes);

          if (detachAuthTag) {
            // Store auth tag separately
            stream._authTag = authTag;
          } else {
            // Append auth tag
            controller.enqueue(authTag);
          }
        }
      },
    };

    stream = new EncryptStream(transformer, detachAuthTag);

    return stream;
  }
}

/**
 * Create a native TransformStream that encrypts via the WASM Encryptor.
 */
export function createEncryptStream(
  key: Uint8Array,
  nonce: Uint8Array,
  detachAuthTag: boolean,
  adata?: Uint8Array,
): EncryptStream {
  return EncryptStream.create(key, nonce, detachAuthTag, adata);
}

/**
 * Create a native TransformStream that decrypts via the WASM Decryptor.
 *
 * @param key - 32-byte encryption key
 * @param nonce - 12-byte nonce (recommended)
 * @param authTag - Optional authentication tag to append to ciphertext (for Node.js `createCipheriv` compatibility)
 * @param adata - Optional additional authenticated data
 *
 * If an authentication tag is not provided, it is assumed that the authTag is appended to the ciphertext
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
          // Append the auth tag as the final chunk (else assume it's appended to the ciphertext)
          const out = dec.update(authTag);
          if (out.length > 0) {
            controller.enqueue(out);
          }
        }
        // might throw on auth failure
        const last = dec.finalize();
        if (last.length > 0) {
          controller.enqueue(last);
        }
      }
    },
  });
}
