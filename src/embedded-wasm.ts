import { EMBEDDED_WASM_BASE64 } from './embedded-wasm-base64.js';

/**
 * Decode the wasm module that ships inside this package's JavaScript.
 *
 * Used by `init()` when no `module_or_path` is given, so the default load path
 * never issues a separate `.wasm` network request.
 *
 * @returns The compiled wasm module bytes
 */
export function getEmbeddedWasmBytes(): Uint8Array {
  const binary = atob(EMBEDDED_WASM_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    // atob() yields one code unit (0-255) per byte.
    bytes[index] = binary.codePointAt(index) ?? 0;
  }
  return bytes;
}
