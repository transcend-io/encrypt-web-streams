import initWasm, {
  Decryptor,
  Encryptor,
  type InitOutput,
} from '../wasm/aes_gcm_stream_wasm.js';

let _wasmReady: Promise<InitOutput> | undefined;

/**
 * Initialize the WebAssembly module.
 *
 * @returns A promise that resolves to the Wasm module.
 */
export function init(): Promise<InitOutput> {
  _wasmReady ??= initWasm();
  return _wasmReady;
}

/**
 * An encrypted TransformStream with an additional method to retrieve the
 * authentication tag.
 */
export interface EncryptStream extends TransformStream<Uint8Array, Uint8Array> {
  /**
   * Get the authentication tag.
   *
   * The getAuthTag() method should ONLY be called if:
   *
   * 1. `options.detachAuthTag` was true when the stream was created.
   * 2. The encryption stream has been fully read.
   *
   * `getAuthTag()` will throw a TypeError if `options.detachAuthTag` was false.
   * `getAuthTag()` will return `undefined` if the encryption stream has not
   * completed.
   */
  getAuthTag(): Uint8Array | undefined;
}

/**
 * Create a native TransformStream that encrypts via the Wasm Encryptor.
 *
 * @param key - 32-byte encryption key
 * @param iv - 12-byte iv (recommended)
 * @param options - Optional options
 * @param options.detachAuthTag - Defaults to false. If true, the authentication
 *   tag will not be appended to the ciphertext and must be retrieved with
 *   `getAuthTag()` after the stream is complete.
 * @param options.additionalData - Optional additional authenticated data
 * @returns An `EncryptStream`, which is a `TransformStream` with an added
 *   `getAuthTag()` method.
 */
export function createEncryptStream(
  key: Uint8Array,
  iv: Uint8Array,
  {
    detachAuthTag = false,
    additionalData,
  }: {
    /**
     * If true, the authentication tag will not be appended to the ciphertext
     * and must be retrieved with `getAuthTag()` after the stream is complete.
     */
    detachAuthTag?: boolean;
    /** Optional additional authenticated data */
    additionalData?: Uint8Array;
  } = {},
): EncryptStream {
  try {
    const enc = new Encryptor(key, iv);
    if (additionalData) enc.init_adata(additionalData);

    let hasData = false;
    let authTag: Uint8Array | undefined;

    const stream = new TransformStream<Uint8Array, Uint8Array>({
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
          const finalAuthTag = final.slice(-16);

          // Enqueue remaining bytes
          controller.enqueue(remainingBytes);

          if (detachAuthTag) {
            // Store auth tag separately
            authTag = finalAuthTag;
          } else {
            // Append auth tag
            controller.enqueue(finalAuthTag);
          }
        }
      },
    });

    // Augment the stream with the getAuthTag method
    const encryptStream = stream as EncryptStream;
    encryptStream.getAuthTag = () => {
      if (!detachAuthTag) {
        throw new TypeError(
          'The authentication tag is not available when `detachAuthTag` is false.' +
            '\nIt will be appended to the ciphertext.',
        );
      }
      return authTag;
    };

    return encryptStream;
  } catch (error) {
    if (error instanceof Error) {
      throw new TypeError(`Failed to create encrypt stream:`, { cause: error });
    }
    throw new TypeError(`Failed to create encrypt stream: ${String(error)}`);
  }
}

/**
 * Create a native TransformStream that decrypts via the Wasm Decryptor.
 *
 * @param key - 32-byte encryption key
 * @param iv - 12-byte iv (recommended)
 * @param detachedAuthTag - Optional detached authentication tag to append to
 *   ciphertext (for Node.js `createCipheriv` compatibility)
 * @param additionalData - Optional additional authenticated data
 *
 *   If an authentication tag is not provided, it is assumed that the authTag is
 *   appended to the ciphertext
 */
export function createDecryptStream(
  key: Uint8Array,
  iv: Uint8Array,
  detachedAuthTag?: Uint8Array,
  additionalData?: Uint8Array,
): TransformStream<Uint8Array, Uint8Array> {
  try {
    const dec = new Decryptor(key, iv);
    if (additionalData) dec.init_adata(additionalData);

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
          if (detachedAuthTag) {
            // Append the auth tag as the final chunk (else assume it's appended to the ciphertext)
            const out = dec.update(detachedAuthTag);
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
  } catch (error) {
    if (error instanceof Error) {
      throw new TypeError(`Failed to create encrypt stream:`, { cause: error });
    }
    throw new TypeError(`Failed to create encrypt stream: ${String(error)}`);
  }
}
