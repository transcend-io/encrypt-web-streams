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

# Build the Rust WASM module (at pkg/*) for the browser
pnpm build

# Run tests
pnpm test
```

`pnpm build` produces:

- `pkg/` directory containing the compiled WebAssembly module
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

## Benchmark Results

`aes_gcm_stream` vs. `crypto.subtle` vs. `crypto-browserify`:

🚧 Browser logs on Chromium:

```js
[
  {
    'Task name': 'aes_gcm_stream',
    'Latency avg (ns)': '86281 ± 7.70%',
    'Latency med (ns)': '1.0000e+5 ± 0.00',
    'Throughput avg (ops/s)': '9942 ± 1.01%',
    'Throughput med (ops/s)': '10000 ± 0',
    Samples: 1159,
  },
  {
    'Task name':
      'crypto.subtle (cannot stream; use separately encrypted chunks)',
    'Latency avg (ns)': '38235 ± 15.22%',
    'Latency med (ns)': '0.00 ± 0.00',
    'Throughput avg (ops/s)': '20730 ± 1.42%',
    'Throughput med (ops/s)': '26154 ± 0',
    Samples: 2618,
  },
  {
    'Task name': 'crypto-browserify',
    'Latency avg (ns)': '657895 ± 33.29%',
    'Latency med (ns)': '400000 ± 1.0000e+5',
    'Throughput avg (ops/s)': '2206 ± 4.20%',
    'Throughput med (ops/s)': '2500 ± 500',
    Samples: 152,
  },
];
```

🚧 Browser logs on Firefox:

```js
[
  {
    'Task name': 'aes_gcm_stream',
    'Latency avg (ns)': '625000 ± 14.76%',
    'Latency med (ns)': '1000000 ± 0.00',
    'Throughput avg (ops/s)': '1233 ± 4.06%',
    'Throughput med (ops/s)': '1000 ± 0',
    Samples: 160,
  },
  {
    'Task name':
      'crypto.subtle (cannot stream; use separately encrypted chunks)',
    'Latency avg (ns)': '51020 ± 20.27%',
    'Latency med (ns)': '0.00 ± 0.00',
    'Throughput avg (ops/s)': '18679 ± 0.96%',
    'Throughput med (ops/s)': '19600 ± 0',
    Samples: 1960,
  },
  {
    'Task name': 'crypto-browserify',
    'Latency avg (ns)': '1265823 ± 11.23%',
    'Latency med (ns)': '1000000 ± 0.00',
    'Throughput avg (ops/s)': '822 ± 6.47%',
    'Throughput med (ops/s)': '1000 ± 0',
    Samples: 79,
  },
];
```

🚧 Browser logs on Webkit:

```js
[
  {
    'Task name': 'aes_gcm_stream',
    'Latency avg (ns)': '53879 ± 19.67%',
    'Latency med (ns)': '0.00 ± 0.00',
    'Throughput avg (ops/s)': '17632 ± 1.01%',
    'Throughput med (ops/s)': '18560 ± 0',
    Samples: 1856,
  },
  {
    'Task name':
      'crypto.subtle (cannot stream; use separately encrypted chunks)',
    'Latency avg (ns)': '61774 ± 20.06%',
    'Latency med (ns)': '0.00 ± 0.00',
    'Throughput avg (ops/s)': '15286 ± 1.14%',
    'Throughput med (ops/s)': '16188 ± 0',
    Samples: 1635,
  },
  {
    'Task name': 'crypto-browserify',
    'Latency avg (ns)': '19453125 ± 7.40%',
    'Latency med (ns)': '20000000 ± 4000000',
    'Throughput avg (ops/s)': '59 ± 13.22%',
    'Throughput med (ops/s)': '50 ± 8',
    Samples: 64,
  },
];
```
