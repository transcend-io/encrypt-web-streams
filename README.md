# aes-gcm-stream-wasm

A WebAssembly-powered, truly streaming AES-256-GCM implementation for Node.js and the web. This library wraps the Rust [`aes-gcm-stream`](https://lib.rs/crates/aes-gcm-stream) crate and provides both direct WASM bindings and a streaming API.

## Features

* **True streaming**: Encrypt/decrypt chunk-by-chunk without buffering the entire payload in JavaScript.
* **High performance**: Leverages Rust's optimized AES-GCM implementation via WebAssembly.
* **Node.js and Web support**: Works in both Node.js and browser environments.
* **One-shot or streaming**: Use in single-call mode or stream mode depending on your needs.

## Prerequisites

* Rust (edition 2024)
* [`wasm-pack`](https://github.com/rustwasm/wasm-pack)
* Node.js / bundler that supports ES modules

## Table of Contents

1. [Installation](#installation)
2. [Building from Source](#building-from-source)
3. [API Reference](#api-reference)
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

# Install dependencies
pnpm install

# Build the Rust WASM module for Node.js
cd rust
wasm-pack build --target nodejs
cd ..

# Run tests
pnpm test:js
```

This produces:
- `pkg/` directory containing the compiled WebAssembly module
- `src/` directory containing the TypeScript wrapper

### Project Structure

```
aes-gcm-stream-wasm/
├── rust/                  # Rust workspace
│   ├── src/               # Rust source code
│   │   └── lib.rs         # WASM bindings
│   ├── Cargo.toml         # Rust dependencies
│   └── Cargo.lock         # Rust lock file
├── src/                   # TypeScript source
│   ├── index.ts           # Main entry point
│   └── stream.ts          # TransformStream implementation
├── test/                  # JavaScript tests
├── pkg/                   # Compiled WASM (generated)
├── package.json           # Package configuration
└── README.md              # Main documentation
```

---

## API Reference

### Direct WASM Bindings

Located in `pkg/aes_gcm_stream_wasm.js` and exposed via `wasm-bindgen`.

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
* `finalize() -> Uint8Array` — finalize, verify tag, and return remaining plaintext or throw on auth failure

---

### JavaScript Wrapper

Provides a more ergonomic API on top of the WASM exports.

```ts
import { init, createEncryptStream, createDecryptStream } from "aes-gcm-stream-wasm";

// Or import the stream module directly
import { createEncryptStream, createDecryptStream } from "aes-gcm-stream-wasm/stream";
```

#### JS API

* `init(): Promise<InitOutput>` — asynchronously loads the WASM module (Node.js build auto-initializes)
* `createEncryptStream(key, nonce, adata?)` — returns a `TransformStream` encrypting each chunk
* `createDecryptStream(key, nonce, adata?)` — returns a `TransformStream` decrypting and verifying each chunk

**Note**: The current TransformStream implementation has some limitations due to the buffering behavior of the underlying WASM module. The direct WASM bindings (`Encryptor` and `Decryptor`) are fully functional and recommended for most use cases.

---

## Usage Examples

### Direct WASM Usage (Recommended)

```js
import { Encryptor, Decryptor } from "aes-gcm-stream-wasm";

const key = new Uint8Array(32).fill(1);
const nonce = new Uint8Array(12).fill(2);
const plaintext = new TextEncoder().encode("Hello, World!");

// Encrypt
const encryptor = new Encryptor(key, nonce);
const encrypted = encryptor.update(plaintext);
const final = encryptor.finalize();

// Decrypt
const decryptor = new Decryptor(key, nonce);
const decrypted = decryptor.update(encrypted);
const result = decryptor.finalize();

// Combine results
const decryptedText = new TextDecoder().decode(
  new Uint8Array([...decrypted, ...result])
);
console.log(decryptedText); // "Hello, World!"
```

### Streaming Usage (Experimental)

```js
import { init, createEncryptStream, createDecryptStream } from "aes-gcm-stream-wasm";

(async () => {
  await init();

  const key   = new Uint8Array(32).fill(1);
  const nonce = new Uint8Array(12).fill(2);
  const adata = new TextEncoder().encode("header");

  // Create streams
  const encryptStream = createEncryptStream(key, nonce, adata);
  const decryptStream = createDecryptStream(key, nonce, adata);

  // Note: The current stream implementation may have issues with buffering
  // Use the direct WASM bindings for production code
})();
```

---

## Testing

Run the JavaScript tests:

```bash
pnpm test:js
```

---

## Contributing

Contributions and issues are welcome! Please open a pull request or issue on GitHub.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
