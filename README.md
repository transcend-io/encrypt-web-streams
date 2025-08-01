# aes_gcm_stream

A WebAssembly-powered, truly streaming AES-256-GCM implementation for Node.js and the web. This library wraps the Rust [`aes-gcm-stream`](https://lib.rs/crates/aes-gcm-stream) crate and provides both direct WASM bindings and a streaming API.

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

If you plan to build from source, skip to [Building from Source](#building-from-source).

---

## Building from Source

### Prerequisites

- Rust (edition 2024)
- [`wasm-pack`](https://github.com/rustwasm/wasm-pack)
- Node.js / bundler that supports ES modules

```bash
# Clone this repository
git clone https://github.com/bencmbrook/aes_gcm_stream.git
cd aes_gcm_stream

# Install dependencies
pnpm install

# Build the Rust WASM module (at wasm/*) for the browser
pnpm build

# Run tests
pnpm test
```

`pnpm build` produces:

- `wasm/` directory containing the compiled WebAssembly module
- `dist/` directory containing the TypeScript output for the library

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

- `init(): Promise<InitOutput>` — asynchronously loads the WASM module (Node.js build auto-initializes)
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

## Stats

- 59.4 MB/s on a 6.3GB file on M3 Pro
