# Encrypt Web Streams

A WebAssembly-powered, truly streaming AES-256-GCM implementation for the modern web. This library wraps the Rust [`aes-gcm-stream`](https://lib.rs/crates/aes-gcm-stream) crate and provides a TransformStream API.

```ts
const response = await fetch('/big-encrypted-file');

await response.body
  .pipeThrough(createDecryptionStream(key, iv))
  .pipeTo(fileSystemWritableStream);
```

## Features

- **True streaming**: Encrypt/decrypt chunk-by-chunk without buffering the entire payload in JavaScript.
- **High performance**: Leverages Rust's optimized AES-GCM implementation via WebAssembly.
- **Web native**: Works in browser environments with zero dependencies.
- **One-shot or streaming**: Use in single-call mode or stream mode depending on your needs.

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Installation](#installation)
- [API Reference](#api-reference)
- [Streaming](#streaming)
- [With Web Workers](#with-web-workers)
- [Streaming to disk](#streaming-to-disk)
- [With CryptoKeys](#with-cryptokeys)
- [With detached authentication tags](#with-detached-authentication-tags)
- [Security](#security)
- [Performance](#performance)
- [Supporting Large Files](#supporting-large-files)
- [Contributing](#contributing)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Installation

Install the published package via npm:

```bash
npm install @transcend-io/encrypt-web-streams
```

## API Reference

Provides `TransformStream` implementations for AES-256-GCM encryption and decryption, powered by a WebAssembly module.

```ts
import {
  init,
  createEncryptionStream,
  createDecryptionStream,
} from '@transcend-io/encrypt-web-streams';
```

### `init()`

```typescript
function init(): Promise<void>;
```

Asynchronously loads and initializes the WebAssembly module. This must be called and awaited before any other functions from this library can be used.

**Returns:**

A `Promise` that resolves when the Wasm module has been initialized.

### `createEncryptionStream()`

```typescript
function createEncryptionStream(
  key: Uint8Array,
  iv: Uint8Array,
  options?: {
    additionalData?: Uint8Array;
    detachAuthTag?: boolean;
  },
): EncryptionStream;
```

Creates a `TransformStream` that encrypts a stream of plaintext data using AES-256-GCM.

**Parameters:**

- `key` (`Uint8Array`): A 32-byte encryption key.
- `iv` (`Uint8Array`): A 12-byte initialization vector (IV). It is highly recommended to use a new, random IV for each encryption.
- `options` (optional `object`):
  - `additionalData` (`Uint8Array`, optional): Optional additional authenticated data (AAD).
  - `detachAuthTag` (`boolean`, optional, default: `false`): If `true`, the 16-byte authentication tag is not appended to the ciphertext. It must be retrieved separately using the `getAuthTag()` method on the returned stream after the stream has completed.

**Returns:**

An `EncryptionStream`, which is a `TransformStream` with an added `getAuthTag()` method.

### `EncryptionStream`

This interface extends `TransformStream<Uint8Array, Uint8Array>` with an additional method for when you're working with detached authentication tags.

#### `getAuthTag()`

```typescript
interface EncryptionStream extends TransformStream<Uint8Array, Uint8Array> {
  getAuthTag(): Uint8Array;
}
```

Returns the 16-byte authentication tag.

This method should only be called if:

1.  `options.detachAuthTag` was `true` when the stream was created.
2.  The encryption stream has been fully read and is closed.

**Throws:**

- `TypeError`: If `options.detachAuthTag` was `false`.
- `Error`: If the encryption stream has not yet finished.

### `createDecryptionStream()`

```typescript
function createDecryptionStream(
  key: Uint8Array,
  iv: Uint8Array,
  options?: {
    additionalData?: Uint8Array;
    authTag?: Uint8Array | 'defer';
  },
): DecryptionStream;
```

Creates a `TransformStream` that decrypts a stream of encrypted data using AES-256-GCM.

**Parameters:**

- `key` (`Uint8Array`): A 32-byte encryption key.
- `iv` (`Uint8Array`): A 12-byte initialization vector (IV).
- `options` (optional `object`):
  - `additionalData` (`Uint8Array`, optional): Optional additional authenticated data (AAD).
  - `authTag` (`Uint8Array | 'defer'`, optional): The 16-byte authentication tag. Use this if the tag is detached from the ciphertext.
    - If `authTag` is a `Uint8Array`, it will be used to verify the ciphertext.
    - If `authTag` is set to `'defer'`, the authentication tag must be provided later by calling `setAuthTag()` on the returned stream. The decryption stream will not finalize until the tag is set.
    - If `authTag` is `undefined`, the library assumes the authentication tag is appended to the end of the ciphertext stream.

**Returns:**

A `DecryptionStream`, which is a `TransformStream` with an added `setAuthTag()` method.

### `DecryptionStream`

This interface extends `TransformStream<Uint8Array, Uint8Array>` with an additional method for when you're working with detached authentication tags.

#### `setAuthTag()`

```typescript
interface DecryptionStream extends TransformStream<Uint8Array, Uint8Array> {
  setAuthTag(authTag: Uint8Array): void;
}
```

Sets the 16-byte authentication tag for verification. This method must be used when `createDecryptionStream` was called with the `authTag: 'defer'` option.

**Parameters:**

- `authTag` (`Uint8Array`): The 16-byte authentication tag.

**Throws:**

- `TypeError`: If called when the `authTag` option was not `'defer'`.
- `Error`: If the decryption stream has already finished.

## Streaming

```js
import {
  init,
  createEncryptionStream,
  createDecryptionStream,
} from '@transcend-io/encrypt-web-streams';

await init();

const key = crypto.getRandomValues(new Uint8Array(32));
const iv = crypto.getRandomValues(new Uint8Array(12));

const encryptionStream = createEncryptionStream(key, iv);
const decryptionStream = createDecryptionStream(key, iv);

try {
  await new ReadableStream({
    start(controller) {
      for (let index = 0; index < 1000; index++) {
        controller.enqueue(new TextEncoder().encode('Hello, World!'));
      }
    },
  })
    .pipeThrough(encryptionStream)
    .pipeThrough(decryptionStream)
    .pipeTo(
      new WritableStream({
        write(chunk) {
          console.log(new TextDecoder().decode(chunk));
        },
      }),
    );
} catch (error) {
  console.error(error);
}
```

## With Web Workers

For CPU-intensive tasks like encryption or decryption, it's best to use a Web Worker. This moves the heavy computation off the main thread, preventing your application's UI from freezing and ensuring a smooth user experience.

The library works out-of-the-box in workers. The following example shows how to set up an encryption worker.

**Create the Worker Script**

First, create a file that will act as your worker, for example, `encrypt-worker.js`. This script will import the library, wait for a message from the main thread, and then perform the encryption.

```ts
// encrypt-worker.js
import {
  init,
  createEncryptionStream,
} from '@transcend-io/encrypt-web-streams';

// Initialize the Wasm module within the worker's scope.
// This promise ensures we don't process messages until the Wasm is ready.
const wasmReady = init();

self.onmessage = async (event) => {
  // Ensure Wasm is ready before proceeding.
  await wasmReady;

  const { readable, writable, key, iv } = event.data;

  // Create the encryption stream inside the worker.
  const encryptionStream = createEncryptionStream(key, iv);

  // Pipe the plaintext through the encryption stream and send the
  // encrypted output back to the main thread's WritableStream.
  await readable.pipeThrough(encryptionStream).pipeTo(writable);

  console.log('Worker has finished encrypting the stream.');
};
```

**Use the Worker from the Main Thread**

From your main application code, create an instance of the worker. Then, create the streams and transfer them to the worker to begin processing.

```ts
// This code runs on the main thread
const worker = new Worker(new URL('./encrypt-worker.js', import.meta.url), {
  type: 'module',
});

// Generate a key and IV to send to the worker
const key = crypto.getRandomValues(new Uint8Array(32));
const iv = crypto.getRandomValues(new Uint8Array(12));

// Create a plaintext stream to be encrypted by the worker
const plaintextStream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('This will be encrypted '));
    controller.enqueue(new TextEncoder().encode('in a separate thread.'));
    controller.close();
  },
});

// Create a TransformStream to receive the encrypted result from the worker
const transformStream = new TransformStream();

// Transfer the streams and keys to the worker
worker.postMessage(
  {
    readable: plaintextStream,
    writable: transformStream.writable,
    key,
    iv,
  },
  [plaintextStream, transformStream.writable],
);

// Read the final encrypted result from the readable end of the TransformStream
console.log('Reading encrypted stream from worker...');
const reader = transformStream.readable.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // value is a Uint8Array of the encrypted data
  console.log('Received encrypted chunk from worker:', value);
}

console.log('Finished reading encrypted stream on main thread.');
```

## Streaming to disk

Use [`FileSystemWritableFileStream`](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemWritableFileStream) to write to disk.

```ts
button.addEventListener('click', async () => {
  const fileHandle = await window.showSaveFilePicker({
    suggestedName: 'unreleased_movie.mp4',
  });
  const fileSystemWritableStream = await fileHandle.createWritable();
  const response = await fetch('/e2ee-uploads/unreleased_movie.mp4.enc');

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }

  await response.body
    .pipeThrough(createDecryptionStream(key, iv))
    .pipeTo(fileSystemWritableStream);
});
```

## With CryptoKeys

Since this is not using WebCrypto, accepting a [`CryptoKey`](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey) directly is not in scope of this library. However, you can derive a `Uint8Array` key from your `CryptoKey`, provided it's [`extractable`](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey/extractable):

```ts
// Export the CryptoKey as a Uint8Array, after validating it for its intended use
async function getAesKey(
  key: CryptoKey,
  operation: 'encrypt' | 'decrypt',
): Promise<Uint8Array> {
  const errors: string[] = [];
  if (key.algorithm.name !== 'AES-GCM') {
    errors.push('Key is not an AES-GCM key');
  }
  if ((key.algorithm as AesKeyAlgorithm).length !== 256) {
    errors.push('Key is not a 256-bit key');
  }
  if (!key.usages.includes(operation)) {
    errors.push(`Key is not used for the requested operation: ${operation}`);
  }
  if (!key.extractable) {
    errors.push('Key is not extractable');
  }
  if (errors.length > 0) {
    throw new TypeError(
      `The provided CryptoKey is not appropriate for the requested operation:\n - ${errors.join('\n - ')}`,
    );
  }

  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

// Usage example
const decryptionStream = createDecryptionStream(
  await getAesKey(myCryptoKey, 'decrypt'),
  iv,
);
```

## With detached authentication tags

Some AES-GCM implementations like WebCrypto's [`encrypt()`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt) **append the authentication tag to the end of the ciphertext**, while others, like Node.js's [`createCipheriv()`](https://nodejs.org/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options), **do not append the authentication tag to the ciphertext, instead returning the authentication tag separately**.

This library supports both modes. By default, it appends the authentication tag to the ciphertext during encryption, and expects the authentication tag to be appended to the ciphertext during decryption. If you want to use the library in the latter mode, you can pass `detachAuthTag: true` to `createEncryptionStream()`, and `authTag` (a `Uint8Array`) to `createDecryptionStream()`. The `authTag` must be 16 bytes long.

### Requesting a detached authentication tag from the encryption stream

```ts
const encryptionStream = createEncryptionStream(key, iv, {
  detachAuthTag: true,
});

await readableStream.pipeThrough(encryptionStream).pipeTo(writableStream);

// Once encryption is complete, get the authentication tag
const myDetachedAuthTag: Uint8Array = encryptionStream.getAuthTag();
```

Since the authentication tag is not available until the encryption stream is complete, you must call `getAuthTag()` after the stream is complete. If you call it before the stream is complete, it will throw an Error. If you call it without having specified `detachAuthTag: true`, it will throw a TypeError.

### Decrypting with a detached authentication tag

```ts
const decryptionStream = createDecryptionStream(key, iv, {
  authTag: myDetachedAuthTag, // Uint8Array
});

await readableStream.pipeThrough(decryptionStream).pipeTo(writableStream);
```

### Advanced: Defer setting the detached authentication tag while decrypting

In advanced use cases, you may want to defer setting the authentication tag until after the decryption stream has started. This is useful if you want to set the authentication tag after the decryption stream has started, but before the stream is complete. **The decryption stream will not finalize until the authentication tag is set.**

```ts
const decryptionStream = createDecryptionStream(key, iv, {
  authTag: 'defer',
});

// Start the decryption stream, but do not await the promise, since it cannot resolve until the authentication tag is set.
const decryptionPromise = readableStream
  .pipeThrough(decryptionStream)
  .pipeTo(writableStream);

// Set the authentication tag after the decryption stream has started
decryptionStream.setAuthTag(myDetachedAuthTag);

// Finish the decryption stream
await decryptionPromise;
```

This requires careful handling because the promise will wait indefinitely if the authentication tag is not set. For debugging purposes, if an authentication tag has not been set for more than 10 seconds after the stream has finished decrypting, a warning will be logged.

## Security

> [!WARNING]
> This library provides low-level cryptographic primitives much like [`SubtleCrypto`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto). To borrow from MDN's SubtleCrypto warning message:
>
> > This API provides a number of low-level cryptographic primitives. It's very easy to misuse them, and the pitfalls involved can be very subtle.
> >
> > Even assuming you use the basic cryptographic functions correctly, secure key management and overall security system design are extremely hard to get right, and are generally the domain of specialist security experts.
> >
> > Errors in security system design and implementation can make the security of the system completely ineffective.

This library assumes you understand AES-GCM and its pitfalls, but it is worth re-iterating the following:

### 1. Key + IV Uniqueness

Never reuse (`key`, `iv`) pairs across multiple messages (i.e., calls to `createEncryptionStream()`). Each new encryption must have a fresh, random IV. Reusing a key and IV pair even once can be catastrophic to both the plaintext and the encryption key's confidentiality.

You should couple your calls to `createEncryptionStream()` to generate a random IV for each new message.

```ts
const iv = crypto.getRandomValues(new Uint8Array(12));
const encryptionStream = createEncryptionStream(key, iv);
```

### 2. Unverified Plaintext During Decryption

During decryption, plaintext is emitted before the authentication tag is fully verified. If you require "no data until verified," you should not use this library, and instead buffer the plaintext until decryption completes. By design, this approach streams plaintext as soon as it’s decrypted, then verifies the final authentication tag at the end. If the authentication tag check fails, this library will throw—but only after plaintext has already been released downstream. This means that you as the library consumer are responsible for not acting on unauthenticated data until the check passes, and furthermore, undoing any downstream writes that have occurred if the check does not pass.

This is especially sensitive if you are [deferring the authentication tag](#advanced-defer-setting-the-detached-authentication-tag-while-decrypting) until after the decryption stream has started, since a complete file may have been emitted downstream before the authentication tag is set.

## Performance

On M3 Pro, decrypting a 6.3GB file:

- in Chromium (i.e., Chrome), this implementation decrypts at 60 MB/s with 3 MB of memory usage.
- in Webkit (i.e., Safari), this implementation decrypts at 60 MB/s with 3 MB of memory usage.
- in Firefox, this implementation decrypts at 4 MB/s with 3 MB of memory usage.

Firefox is slower on M3 Pro. It's not yet clear why, but it's likely a difference in the Wasm implementation.

Run `pnpm benchmark` to see the speed of the implementation and compare it against WebCrypto (but note that WebCrypto cannot stream, so it's not a perfect comparison).

## Supporting Large Files

First, you should avoid buffering data in memory in your implementation. For example, don't push chunks onto an array. You should stream the data end-to-end.

Second, there are volumes of data for which counting the volume of data itself becomes a problem. In JavaScript, counting bits will overflow at a 1.13 PB file. In Wasm, it's a bit more complicated. The Rust crate, `aes-gcm-stream`, originally used `usize` bit counters, which in Wasm is `u32`, and thus the bit counter overflowed at 536 MB. This repo patches that crate to use `u64` for the counter, meaning the theoretical maximum file size is 2^64 bytes, or 16 EB. Using this in Wasm requires similar attention to any counters you implement.

Some browsers have built-in counters which will fail when streaming large amounts of data. In general, staying under ~2 GB per stream is the safest guarantee for wide browser support.

## Contributing

This project uses Rust for the WebAssembly module and TypeScript for the JavaScript wrapper.

### Prerequisites

- **Node.js**: Use [`nvm`](https://github.com/nvm-sh/nvm) to install a recent version of Node.js. This project specifies the current version in [`.nvmrc`](.nvmrc).

- **pnpm**: This project uses `pnpm`. After installing Node.js, enable `corepack` to use `pnpm`:

  ```bash
  npm install -g corepack
  corepack enable
  ```

- **Rust**: Install Rust and Cargo via [`rustup`](https://rustup.rs/).

### Setup and Building

```bash
# Install project dependencies
pnpm install

# Build the Rust Wasm module and TypeScript
pnpm build
```

`pnpm build` produces:

- `wasm/` directory containing the compiled WebAssembly module
- `dist/` directory containing the TypeScript output for the library

### Running Tests

Run the tests with:

```bash
# Run tests in chromium, firefox, and webkit browsers
pnpm test:js

# Run tests in chromium, firefox, and webkit browsers. Takes a while to run since it processes 6GB files
pnpm test:fixtures

# Run tests in Rust
pnpm test:rust
```

.
