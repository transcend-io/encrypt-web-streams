import initWasm, {
  Decryptor,
  Encryptor,
  type InitOutput,
} from '../wasm/aes_gcm_stream_wasm.js';
import { promiseWithResolvers } from './helpers.js';

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

    let detachedAuthTag: Uint8Array | undefined;
    let streamFinished = false;

    const stream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        // ensure Uint8Array
        const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        const out = enc.update(buf);
        // Only enqueue if there's actual output
        if (out.length > 0) {
          controller.enqueue(out);
        }
      },
      flush(controller) {
        try {
          const final = enc.finalize();
          const remainingBytes = final.slice(0, -16);
          const finalAuthTag = final.slice(-16);

          // Enqueue remaining bytes
          if (remainingBytes.length > 0) {
            controller.enqueue(remainingBytes);
          }

          if (detachAuthTag) {
            // Store auth tag separately
            detachedAuthTag = finalAuthTag;
          } else {
            // Append auth tag
            controller.enqueue(finalAuthTag);
          }
        } finally {
          streamFinished = true;
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
      if (!streamFinished) {
        throw new Error(
          'The authentication tag is not available until the encryption stream has finished.',
        );
      }
      if (!detachedAuthTag) {
        // This should be impossible, but it makes TypeScript happy
        throw new Error('The authentication tag is missing.');
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
export interface DecryptionStream
  extends TransformStream<Uint8Array, Uint8Array> {
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
    authTag: originalAuthTagArgument,
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
): DecryptionStream {
  let authTagIsDeferred = false;
  try {
    const dec = new Decryptor(key, iv);
    if (additionalData) dec.init_adata(additionalData);

    // Validate the authTag
    if (
      originalAuthTagArgument !== undefined &&
      originalAuthTagArgument !== 'defer' &&
      !(originalAuthTagArgument instanceof Uint8Array)
    ) {
      throw new TypeError(
        'The `authTag` must be a Uint8Array, undefined, or "defer".',
      );
    }
    if (
      originalAuthTagArgument instanceof Uint8Array &&
      originalAuthTagArgument.length !== 16
    ) {
      throw new TypeError('The `authTag` must be 16 bytes long.');
    }

    const {
      promise: authTagArgumentPromise,
      resolve: resolveAuthTagArgument,
      reject: rejectAuthTagArgument,
    } = promiseWithResolvers<Uint8Array | undefined>();

    // Resolve the authTag result right away if the auth tag is not deferred.
    if (originalAuthTagArgument === 'defer') {
      authTagIsDeferred = true;
    } else {
      resolveAuthTagArgument(originalAuthTagArgument);
    }

    let hasData = false;
    let streamFinished = false;

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
        let timeout: number | undefined;
        try {
          if (hasData) {
            // Wait for the auth tag to be set, if not already
            timeout = setTimeout(() => {
              console.warn(
                'The decryption stream finished 10 seconds ago, but the authentication tag has still not been set.',
              );
            }, 10_000);
            const authTagArgument = await authTagArgumentPromise;
            clearTimeout(timeout);

            if (authTagArgument !== undefined) {
              // Append the auth tag as the final chunk (else assume it's already appended to the ciphertext)
              const out = dec.update(authTagArgument);
              if (out.length > 0) {
                controller.enqueue(out);
              }
            }

            // Note: `finalize()` throws on auth failure
            const last = dec.finalize();
            if (last.length > 0) {
              controller.enqueue(last);
            }
          }
        } finally {
          // If the stream is aborted, clear the timeout
          clearTimeout(timeout);
          streamFinished = true;
        }
      },
    });

    const decryptionStream = stream as DecryptionStream;
    decryptionStream.setAuthTag = (authTag: Uint8Array) => {
      try {
        if (!authTagIsDeferred) {
          throw new TypeError(
            'Unexpected call to setAuthTag(), the `authTag` passed to `createDecryptionStream()` must be "defer" when using this library in the "defer" mode.',
          );
        }
        if (streamFinished) {
          throw new Error(
            'The decryption stream has already finished, so the authentication tag cannot be set.',
          );
        }
        // Validate the authTag
        const deferredAuthTag = authTag as unknown;
        if (
          !(deferredAuthTag instanceof Uint8Array) ||
          deferredAuthTag.length !== 16
        ) {
          throw new TypeError(
            'The `authTag` must be a Uint8Array and 16 bytes long.',
          );
        }
        // From this point on, the auth tag is no longer deferred
        authTagIsDeferred = false;
        // Resolve the promise for the detached authentication tag, allowing the decipher to finalize.
        resolveAuthTagArgument(deferredAuthTag);
      } catch (error) {
        rejectAuthTagArgument(error); // Reject the promise to error the stream
        throw error; // Also throw synchronously for the caller
      }
    };

    return decryptionStream;
  } catch (error) {
    if (error instanceof Error) {
      throw new TypeError(`Failed to create decrypt stream:`, { cause: error });
    }
    throw new TypeError(`Failed to create decrypt stream: ${String(error)}`);
  }
}
