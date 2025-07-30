/**
 * Main entry point for aes-gcm-stream-wasm
 *
 * This module provides WebAssembly-powered streaming AES-256-GCM encryption
 * and decryption with a native TransformStream API.
 */

export { init, createEncryptStream, createDecryptStream } from './stream.js';
