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
 * A `TransformStream` with an additional method to retrieve the authentication
 * tag.
 */
export interface EncryptionStream
  extends TransformStream<Uint8Array, Uint8Array> {
  /**
   * Get the authentication tag.
   *
   * The getAuthTag() method should ONLY be called if:
   *
   * 1. `options.detachAuthTag` was true when the stream was created.
   * 2. The encryption stream has been fully read.
   *
   * Otherwise, `getAuthTag()` will throw an error. It throws a TypeError if
   * `options.detachAuthTag` was false, and an Error if the encryption stream
   * has not completed.
   */
  getAuthTag(): Uint8Array;
}

/**
 * Create a native TransformStream that encrypts via a Wasm AES-GCM encryption
 * implementation.
 *
 * @param {Uint8Array} key - 32-byte encryption key
 * @param {Uint8Array} iv - 12-byte iv (recommended)
 * @param {Object} options - Optional options
 * @param {Uint8Array} options.additionalData - Optional additional
 *   authenticated data
 * @param {boolean} [options.detachAuthTag=false] - If `true`, the
 *   authentication tag will not be appended to the ciphertext and must be
 *   retrieved with `getAuthTag()` after the stream is complete. Default is
 *   `false`
 * @returns {EncryptionStream} An `EncryptionStream`, which is a
 *   `TransformStream` with an added `getAuthTag()` method
 */
export function createEncryptionStream(
  key: Uint8Array,
  iv: Uint8Array,
  {
    additionalData,
    detachAuthTag = false,
  }: {
    /**
     * If `true`, the authentication tag will not be appended to the ciphertext
     * and must be retrieved with `getAuthTag()` after the stream is complete.
     * Default is `false`
     */
    detachAuthTag?: boolean;
    /** Optional additional authenticated data */
    additionalData?: Uint8Array;
  } = {},
): EncryptionStream {
  try {
    const enc = new Encryptor(key, iv);
    if (additionalData) enc.init_adata(additionalData);

    let hasData = false;
    let detachedAuthTag: Uint8Array | undefined;

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
            detachedAuthTag = finalAuthTag;
          } else {
            // Append auth tag
            controller.enqueue(finalAuthTag);
          }
        }
      },
    });

    // Augment the stream with the getAuthTag() method
    const encryptionStream = stream as EncryptionStream;
    encryptionStream.getAuthTag = () => {
      if (!detachAuthTag) {
        throw new TypeError(
          'The authentication tag is not available when `detachAuthTag` is false.' +
            '\nThe authentication tag will be appended to the ciphertext.',
        );
      }
      if (!detachedAuthTag) {
        throw new Error(
          'The authentication tag is not available until the encryption stream has finished.',
        );
      }
      return detachedAuthTag;
    };

    return encryptionStream;
  } catch (error) {
    if (error instanceof Error) {
      throw new TypeError(`Failed to create encrypt stream:`, { cause: error });
    }
    throw new TypeError(`Failed to create encrypt stream: ${String(error)}`);
  }
}

/** A `TransformStream` with an additional method to set the authentication tag. */
export interface DecryptStream extends TransformStream<Uint8Array, Uint8Array> {
  /** Set the authentication tag. */
  setAuthTag(authTag: Uint8Array): void;
}

/**
 * Create a native TransformStream that decrypts via a Wasm AES-GCM decryption
 * implementation.
 *
 * @param {Uint8Array} key - 32-byte encryption key
 * @param {Uint8Array} iv - 12-byte iv (recommended)
 * @param {Object} options - Optional options
 * @param {Uint8Array} options.additionalData - Optional additional
 *   authenticated data
 * @param {Uint8Array} options.detachedAuthTag - Optional detached
 *   authentication tag to append to ciphertext, if the ciphertext does not
 *   already contain an appended authentication tag.
 * @returns {TransformStream} A `TransformStream` that decrypts the ciphertext
 *   and verifies the authentication tag.
 */
export function createDecryptionStream(
  key: Uint8Array,
  iv: Uint8Array,
  {
    additionalData,
    authTag,
  }: {
    /** Optional additional authenticated data */
    additionalData?: Uint8Array;
    /**
     * The detached authentication tag, if the ciphertext does not have it
     * appended.
     *
     * If `authTag` is set to `'defer'`, the authentication tag must be set
     * later by calling `setAuthTag()`. The decryption stream will not finalize
     * until it is set.
     *
     * @see {EncryptionStream.getAuthTag}
     */
    authTag?: Uint8Array | 'defer';
  } = {},
): DecryptStream {
  try {
    const dec = new Decryptor(key, iv);
    if (additionalData) dec.init_adata(additionalData);
    if (authTag && authTag !== 'defer' && authTag.length !== 16) {
      throw new TypeError('The `detachedAuthTag` must be 16 bytes long.');
    }

    let detachedAuthTagPromise: Promise<Uint8Array> | undefined =
      authTag === 'defer'
        ? new Promise<Uint8Array>(() => {
            // Do not settle the promise. Waiting indefinitely until setAuthTag() is called.
          })
        : // eslint-disable-next-line unicorn/no-nested-ternary
          authTag
          ? Promise.resolve(authTag)
          : undefined;

    let hasData = false;

    const stream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        const out = dec.update(buf);
        hasData = true;
        // Only enqueue if there's actual output
        if (out.length > 0) {
          controller.enqueue(out);
        }
      },
      async flush(controller) {
        if (hasData) {
          if (detachedAuthTagPromise !== undefined) {
            const timeout = setTimeout(() => {
              console.warn(
                'The decryption stream finished 10 seconds ago, but the authentication tag has still not been set.',
              );
            }, 10_000);
            // Wait for the auth tag to be set
            const detachedAuthTag = await detachedAuthTagPromise;
            clearTimeout(timeout);

            // Append the auth tag as the final chunk (else assume it's already appended to the ciphertext)
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

    const decryptStream = stream as DecryptStream;
    decryptStream.setAuthTag = (authTag: Uint8Array) => {
      if (authTag.length !== 16) {
        throw new TypeError('The `authTag` must be 16 bytes long.');
      }
      // Resolve the promise for the detached authentication tag, allowing the decipher to finalize.
      detachedAuthTagPromise = Promise.resolve(authTag);
    };

    return decryptStream;
  } catch (error) {
    if (error instanceof Error) {
      throw new TypeError(`Failed to create decrypt stream:`, { cause: error });
    }
    throw new TypeError(`Failed to create decrypt stream: ${String(error)}`);
  }
}
