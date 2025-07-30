# aes-gcm-stream-wasm

A WebAssembly-powered, truly streaming AES-256-GCM implementation for the web. This library wraps the Rust [`aes-gcm-stream`](https://lib.rs/crates/aes-gcm-stream) crate and exposes a zero-copy, Web-native `TransformStream` API for both encryption and decryption.

## Features

* **True streaming**: Encrypt/decrypt chunk-by-chunk without buffering the entire payload in JavaScript.
* **Web-native API**: Returns `TransformStream<Uint8Array, Uint8Array>` for seamless integration with browser-native streams.
* **High performance**: Leverages Rust’s optimized AES-GCM implementation via WebAssembly.
* **One-shot or streaming**: Use in single-call mode or stream mode depending on your needs.

## Prerequisites

* Rust (edition 2021)
* [`wasm-pack`](https://github.com/rustwasm/wasm-pack)
* Node.js / bundler that supports ES modules (for JS wrapper)

## Table of Contents

1. [Installation](#installation)
2. [Building from Source](#building-from-source)
3. [API Reference](#api-reference)

   * [Rust Module](#rust-module)
   * [JavaScript Wrapper](#javascript-wrapper)
4. [Usage Examples](#usage-examples)
5. [Testing](#testing)
6. [Contributing](#contributing)
7. [License](#license)

---

## Installation

Install the published package via npm:

```bash
npm install aes-gcm-stream-wasm
```

If you plan to build from source, skip to [Building from Source](#building-from-source).

---

## Building from Source

```bash
# Clone this repository
git clone https://github.com/yourusername/aes-gcm-stream-wasm.git
cd aes-gcm-stream-wasm

# Build the WASM package for web targets
wasm-pack build --target web
```

This produces a `pkg/` directory containing:

* `aes_gcm_stream_wasm.js` (ES module entry point)
* `aes_gcm_stream_wasm_bg.wasm` (compiled WebAssembly binary)
* TypeScript definitions (`.d.ts`)

You can then use `npm publish` or import the `pkg/` directly in your bundler.

---

## API Reference

### Rust Module (WASM Exports)

Located in `src/lib.rs` and exposed via `wasm-bindgen`.

#### `Encryptor`

* `new(key: Uint8Array, nonce: Uint8Array) -> Encryptor`

  * `key`: 32 bytes (256 bits)
  * `nonce`: recommended 12 bytes
* `init_adata(adata: Uint8Array)` — (optional) additional authenticated data
* `update(chunk: Uint8Array) -> Uint8Array` — encrypt a chunk
* `finalize() -> Uint8Array` — finalize and return remaining ciphertext concatenated with 16-byte tag

#### `Decryptor`

* `new(key: Uint8Array, nonce: Uint8Array) -> Decryptor`
* `init_adata(adata: Uint8Array)` — (optional)
* `update(chunk: Uint8Array) -> Uint8Array` — decrypt a chunk
* `finalize() -> Result<Uint8Array, JsValue>` — finalize, verify tag, and return remaining plaintext or throw on auth failure

---

### JavaScript Wrapper (`stream.ts`)

Provides a more ergonomic, web-native API on top of the WASM exports.

```ts
import initWasm, {
  Encryptor,
  Decryptor
} from "./pkg/aes_gcm_stream_wasm.js";

let wasmReady: Promise<void>;
export function init() {
  if (!wasmReady) wasmReady = initWasm();
  return wasmReady;
}

export function createEncryptStream(
  key: Uint8Array,
  nonce: Uint8Array,
  adata?: Uint8Array
): TransformStream<Uint8Array, Uint8Array> { /* ... */ }

export function createDecryptStream(
  key: Uint8Array,
  nonce: Uint8Array,
  adata?: Uint8Array
): TransformStream<Uint8Array, Uint8Array> { /* ... */ }
```

#### JS API

* `init(): Promise<void>` — asynchronously loads the WASM module
* `createEncryptStream(key, nonce, adata?)` — returns a `TransformStream` encrypting each chunk
* `createDecryptStream(key, nonce, adata?)` — returns a `TransformStream` decrypting and verifying each chunk

---

## Usage Examples

```js
import { init, createEncryptStream, createDecryptStream } from "aes-gcm-stream-wasm/stream.js";

(async () => {
  await init();

  const key   = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const adata = new TextEncoder().encode("header");

  // 1) Create a ReadableStream of plaintext
  const plainStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("Hello, "));
      controller.enqueue(new TextEncoder().encode("world!"));
      controller.close();
    }
  });

  // 2) Encrypt
  const encryptedStream = plainStream.pipeThrough(
    createEncryptStream(key, nonce, adata)
  );

  // 3) Decrypt
  const decryptedStream = encryptedStream.pipeThrough(
    createDecryptStream(key, nonce, adata)
  );

  // 4) Collect and decode
  const chunks = [];
  for await (const chunk of decryptedStream) {
    chunks.push(chunk);
  }
  const decoded = new TextDecoder().decode(
    chunks.reduce((acc, c) => {
      const buf = new Uint8Array(acc.length + c.length);
      buf.set(acc);
      buf.set(c, acc.length);
      return buf;
    }, new Uint8Array())
  );
  console.log(decoded); // "Hello, world!"
})();
```

---

## Testing

You can add tests in Rust or JS depending on your environment. Example using `wasm-pack test`:

```bash
wasm-pack test --node
```

---

## Contributing

Contributions and issues are welcome! Please open a pull request or issue on GitHub.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
