# aes_gcm_stream

A WebAssembly-powered, truly streaming AES-256-GCM implementation for Node.js and the web. This library wraps the Rust [`aes-gcm-stream`](https://lib.rs/crates/aes-gcm-stream) crate and provides both direct Wasm bindings and a streaming API.

## Features

- **True streaming**: Encrypt/decrypt chunk-by-chunk without buffering the entire payload in JavaScript.
- **High performance**: Leverages Rust's optimized AES-GCM implementation via WebAssembly.
- **Node.js and Web support**: Works in both Node.js and browser environments.
- **One-shot or streaming**: Use in single-call mode or stream mode depending on your needs.

## Table of Contents

1. [Installation](#installation)
2. [Building from Source](#building-from-source)
3. [API Reference](#api-reference)
4. [Usage Examples](#usage-examples)

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
  createEncryptStream,
  createDecryptStream,
} from '@bencmbrook/aes_gcm_stream';
```

#### JS API

- `init(): Promise<InitOutput>` — asynchronously loads the Wasm module (Node.js build auto-initializes)
- `createEncryptStream(key, nonce, adata?)` — returns a `TransformStream` encrypting each chunk
- `createDecryptStream(key, nonce, adata?)` — returns a `TransformStream` decrypting and verifying each chunk

### Streaming Usage

```js
import {
  init,
  createEncryptStream,
  createDecryptStream,
} from '@bencmbrook/aes_gcm_stream';

await init();

const key = new Uint8Array(32);
const nonce = new Uint8Array(12);

const encryptStream = createEncryptStream(key, nonce);
const decryptStream = createDecryptStream(key, nonce);

try {
  await new ReadableStream({
    start(controller) {
      for (let index = 0; index < 1000; index++) {
        controller.enqueue(new TextEncoder().encode('Hello, World!'));
      }
    },
  })
    .pipeThrough(encryptStream)
    .pipeThrough(decryptStream)
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
const iv = crypto.getRandomValues(new Uint8Array(12));
const decryptStream = createDecryptStream(
  await getAesKey(myCryptoKey, 'decrypt'),
  iv,
);
```

---

## Development

This project uses Rust for the WebAssembly module and TypeScript for the JavaScript/Node.js wrapper.

### Prerequisites

- **Node.js**: Use [`nvm`](https://github.com/nvm-sh/nvm) to install a recent version of Node.js. This project specifies the current version in [`.nvmrc`](.nvmrc).

- **pnpm**: This project uses `pnpm`. After installing Node.js, enable `corepack` to use `pnpm`:

  ```bash
  npm install -g corepack
  corepack enable
  ```

- **Rust**: Install Rust and Cargo via [`rustup`](https://rustup.rs/):

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

## Performance

Run `pnpm benchmark` to see the speed of the implementation and compare it against WebCrypto (but note that WebCrypto cannot stream, so it's not a perfect comparison).

On M3 Pro, decrypting a 6.3GB file:

- in Chromium (i.e., Chrome), this implementation decrypts at 60 MB/s with 3 MB of memory usage.
- in Webkit (i.e., Safari), this implementation decrypts at 60 MB/s with 3 MB of memory usage.
- in Firefox, this implementation decrypts at 4 MB/s with 3 MB of memory usage.

## Supporting Large Files

First, you should avoid buffering data in memory in your implementation, meaning: (A) don't push chunks onto an array, and (B) don't call `new Blob(decryptionStream)`. You should stream the data end-to-end.

Second, there are volumes of data for which counting the volume of data itself becomes a problem. In JavaScript, counting bits will overflow at a 1.13 PB file.

In Wasm, it's a bit more complicated. The Rust crate, `aes-gcm-stream`, originally used `usize` bit counters, which in Wasm is `u32`, and thus the bit counter overflowed at 536 MB. This repo patches that crate to use `u64` for the counter, meaning the theoretical maximum file size is 2^64 bytes, or 16 EB. Using this in Wasm requires similar attention to any counters you implement.

However, some browsers may have built-in counters which will fail when streaming large amounts of data:

- Chromium (i.e., Chrome): unlimited data (fast; 60 MB/s)
- Webkit (i.e., Safari): OOM error at files > ~3 GB (fast; 60 MB/s)
- Firefox: unlimited data (slow; 4 MB/s)

In general, staying under 3 GB per stream is the safest guarantee for wide browser support.
