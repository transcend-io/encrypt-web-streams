/**
 * Main entry point for the npm library.
 *
 * This module provides WebAssembly-powered streaming AES-256-GCM encryption and
 * decryption with a web-native TransformStream API.
 */
export {
  init,
  createEncryptionStream,
  createDecryptionStream,
  type EncryptionStream,
  type DecryptionStream,
} from './stream.js';
