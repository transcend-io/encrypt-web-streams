import initWasm, {
  Decryptor,
  Encryptor,
  type InitOutput,
} from '../wasm/aes_gcm_stream_wasm.js';
import { promiseWithResolvers } from './helpers.js';

/** The required length of the authentication tag in bytes. */
const AUTH_TAG_LENGTH = 16;

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
        const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        // Process in smaller chunks to avoid a single large allocation in Wasm
        const wasmChunkSize = 65_536; // 64 KiB
        for (let index = 0; index < buf.length; index += wasmChunkSize) {
          const out = enc.update(buf.subarray(index, index + wasmChunkSize));
          if (out.length > 0) {
            controller.enqueue(out);
          }
        }
      },
      flush(controller) {
        try {
          const final = enc.finalize();
          const remainingBytes = final.slice(0, -AUTH_TAG_LENGTH);
          const finalAuthTag = final.slice(-AUTH_TAG_LENGTH);

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
        // This error should be unreachable
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

/** Options for `createDecryptionStream`. */
export interface DecryptionStreamOptions {
  /** Optional additional authenticated data */
  additionalData?: Uint8Array;
  /**
   * The detached authentication tag, if the ciphertext does not have it
   * appended.
   *
   * If `authTag` is set to `'defer'`, the authentication tag must be set later
   * by calling `setAuthTag()`. The decryption stream will not finalize until it
   * is set.
   *
   * @see {EncryptionStream.getAuthTag}
   */
  authTag?: Uint8Array | 'defer';
}

/**
 * Create a native TransformStream that decrypts via a Wasm AES-GCM decryption
 * implementation.
 *
 * @param key - 32-byte encryption key
 * @param iv - 12-byte iv (recommended)
 * @param options - Additional options for the decryption stream
 * @returns {TransformStream} A `TransformStream` that decrypts the ciphertext
 *   authentication tag.
 */
export function createDecryptionStream(
  key: Uint8Array,
  iv: Uint8Array,
  {
    additionalData,
    authTag: originalAuthTagArgument,
  }: DecryptionStreamOptions = {},
): DecryptionStream {
  try {
    const dec = new Decryptor(key, iv);
    if (additionalData) dec.init_adata(additionalData);

    // Validate options.authTag
    if (
      originalAuthTagArgument !== undefined &&
      originalAuthTagArgument !== 'defer' &&
      !(originalAuthTagArgument instanceof Uint8Array)
    ) {
      throw new TypeError(
        `\`options.authTag\` must be a Uint8Array with ${AUTH_TAG_LENGTH.toString()} bytes, undefined, or "defer".`,
      );
    }

    const {
      promise: authTagPromise,
      resolve: resolveAuthTag,
      reject: rejectAuthTag,
    } = promiseWithResolvers<Uint8Array | undefined>();

    // Resolve the authTag result right away if the auth tag is not deferred.
    let authTagIsDeferred = false;
    if (originalAuthTagArgument === 'defer') {
      authTagIsDeferred = true;
    } else {
      resolveAuthTag(originalAuthTagArgument);
    }

    let streamFinished = false;

    const stream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const buf = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        // Process in smaller chunks to avoid a single large allocation in Wasm
        const wasmChunkSize = 65_536; // 64 KiB
        for (let index = 0; index < buf.length; index += wasmChunkSize) {
          const out = dec.update(buf.subarray(index, index + wasmChunkSize));
          if (out.length > 0) {
            controller.enqueue(out);
          }
        }
      },
      async flush(controller) {
        let timeout: number | undefined;
        try {
          // Wait for the auth tag to be set, if not already
          timeout = setTimeout(() => {
            console.warn(
              'The decryption stream finished 10 seconds ago, but the authentication tag has still not been set.',
            );
          }, 10_000);
          const authTag = await authTagPromise;
          clearTimeout(timeout);

          // If the user supplied a detached auth tag...
          if (authTag !== undefined) {
            // Append the auth tag as the final chunk (else assume it's already appended to the ciphertext)
            const out = dec.update(authTag);
            if (out.length > 0) {
              controller.enqueue(out);
            }
          }

          // Note: `finalize()` throws on failure of the authentication tag
          const last = dec.finalize();
          if (last.length > 0) {
            controller.enqueue(last);
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
        if (streamFinished) {
          throw new Error(
            'The decryption stream has already finished, so the authentication tag cannot be set.',
          );
        }
        if (!authTagIsDeferred) {
          throw new TypeError(
            'Unexpected call to `setAuthTag()`, the `authTag` passed to `createDecryptionStream()` must be "defer" when using this library in the "defer" mode.',
          );
        }

        // Validate the authTag
        const deferredAuthTag = authTag as unknown;
        if (
          !(deferredAuthTag instanceof Uint8Array) ||
          deferredAuthTag.length !== AUTH_TAG_LENGTH
        ) {
          throw new TypeError(
            `The \`authTag\` must be a Uint8Array with ${AUTH_TAG_LENGTH.toString()} bytes.`,
          );
        }
        // From this point on, the auth tag is no longer deferred
        authTagIsDeferred = false;
        // Resolve the promise for the detached authentication tag, allowing the decipher to finalize.
        resolveAuthTag(deferredAuthTag);
      } catch (error) {
        rejectAuthTag(error); // Reject the promise to error the stream
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
