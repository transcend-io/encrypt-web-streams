# aes_gcm_stream

A WebAssembly-powered, truly streaming AES-256-GCM implementation for Node.js and the web. This library wraps the Rust [`aes-gcm-stream`](https://lib.rs/crates/aes-gcm-stream) crate and provides both direct Wasm bindings and a streaming API.

## Features

- **True streaming**: Encrypt/decrypt chunk-by-chunk without buffering the entire payload in JavaScript.
- **High performance**: Leverages Rust's optimized AES-GCM implementation via WebAssembly.
- **Node.js and Web support**: Works in both Node.js and browser environments.
- **One-shot or streaming**: Use in single-call mode or stream mode depending on your needs.

## Table of Contents

1. [Installation](#installation)
2. [API Reference](#api-reference)
3. [Usage Examples](#usage-examples)
4. [Security](#security)
5. [Performance](#performance)
6. [Supporting Large Files](#supporting-large-files)
7. [Contributing](#contributing)

---

## Installation

Install the published package via npm:

```bash
npm install @bencmbrook/aes_gcm_stream
```

## API Reference

Provides TransformStreams for AES-256-GCM encryption and decryption.

```ts
import {
  init,
  createEncryptionStream,
  createDecryptionStream,
} from '@bencmbrook/aes_gcm_stream';
```

### JS API

- `init(): Promise<InitOutput>` — asynchronously loads the Wasm module (Node.js build auto-initializes)
- `createEncryptionStream(key, iv, options?)` — returns a `TransformStream` that encrypts a stream of plaintext data.
- `createDecryptionStream(key, iv, options?)` — returns a `TransformStream` that decrypts a stream of encrypted data.

## Streaming Usage

```js
import {
  init,
  createEncryptionStream,
  createDecryptionStream,
} from '@bencmbrook/aes_gcm_stream';

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

## With CryptoKey

Since this is not WebCrypto, accepting a [`CryptoKey`](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey) directly is not in scope of this library. However, you can derive a `Uint8Array` key from your `CryptoKey`, provided it's [`extractable`](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey/extractable):

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

Some AES-GCM implementations like WebCrypto's [`encrypt()`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt) **append authentication tags to the end of the ciphertext**, while others, like Node.js's [`createCipheriv()`](https://nodejs.org/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options), **do not append the authentication tag to the ciphertext, instead returning the authentication tag separately**.

This library supports both modes. By default, it appends the authentication tag to the ciphertext during encryption, and expects the authentication tag to be appended to the ciphertext during decryption. If you want to use the library in the latter mode, you can pass `detachAuthTag: true` to `createEncryptionStream()`, and `authTag` (a `Uint8Array` of the authentication tag) to `createDecryptionStream()`. The `authTag` must be 16 bytes long.

### Requesting a detached authentication tag from the encryption stream

```ts
const encryptionStream = createEncryptionStream(key, iv, {
  detachAuthTag: true,
});

await readableStream.pipeThrough(encryptionStream).pipeTo(writableStream);

// Once encryption is complete, get the authentication tag
const myDetachedAuthTag = encryptionStream.getAuthTag();
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

// Await the decryption stream
await decryptionPromise;
```

If the decipher stream finishes, and an authentication tag has not been set after 10 seconds, a warning will be logged.

---

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

Run `pnpm benchmark` to see the speed of the implementation and compare it against WebCrypto (but note that WebCrypto cannot stream, so it's not a perfect comparison).

## Supporting Large Files

First, you should avoid buffering data in memory in your implementation, meaning: (A) don't push chunks onto an array, and (B) don't call `new Blob(decryptionStream)`. You should stream the data end-to-end.

Second, there are volumes of data for which counting the volume of data itself becomes a problem. In JavaScript, counting bits will overflow at a 1.13 PB file.

In Wasm, it's a bit more complicated. The Rust crate, `aes-gcm-stream`, originally used `usize` bit counters, which in Wasm is `u32`, and thus the bit counter overflowed at 536 MB. This repo patches that crate to use `u64` for the counter, meaning the theoretical maximum file size is 2^64 bytes, or 16 EB. Using this in Wasm requires similar attention to any counters you implement.

However, some browsers may have built-in counters which will fail when streaming large amounts of data:

- Chromium (i.e., Chrome): unlimited data (fast; 60 MB/s)
- Webkit (i.e., Safari): OOM error at files > ~3 GB (fast; 60 MB/s)
- Firefox: unlimited data (slow; 4 MB/s)

In general, staying under 3 GB per stream is the safest guarantee for wide browser support.

## Contributing

This project uses Rust for the WebAssembly module and TypeScript for the JavaScript/Node.js wrapper.

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
