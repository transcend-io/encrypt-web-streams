/* tslint:disable */
/* eslint-disable */

export class Decryptor {
  free(): void;
  [Symbol.dispose](): void;
  init_adata(adata: Uint8Array): void;
  constructor(key: Uint8Array, iv: Uint8Array);
  update(chunk: Uint8Array): Uint8Array;
  /**
   * Finalize: checks tag and returns any remaining plaintext or errors.
   */
  finalize(dangerously_ignore_auth_tag?: boolean | null): Uint8Array;
}

export class Encryptor {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * (Optional) set Additional Authenticated Data.
   */
  init_adata(adata: Uint8Array): void;
  /**
   * Create with a 32-byte key and iv (recommend 12 bytes).
   */
  constructor(key: Uint8Array, iv: Uint8Array);
  /**
   * Encrypt one chunk; returns ciphertext for that chunk.
   */
  update(chunk: Uint8Array): Uint8Array;
  /**
   * Finalize: returns `(remaining_ciphertext, tag)`, concatenated.
   */
  finalize(): Uint8Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_decryptor_free: (a: number, b: number) => void;
  readonly decryptor_finalize: (a: number, b: number) => [number, number, number, number];
  readonly decryptor_init_adata: (a: number, b: number, c: number) => void;
  readonly decryptor_new: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly decryptor_update: (a: number, b: number, c: number) => [number, number];
  readonly encryptor_finalize: (a: number) => [number, number];
  readonly encryptor_init_adata: (a: number, b: number, c: number) => void;
  readonly encryptor_new: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly encryptor_update: (a: number, b: number, c: number) => [number, number];
  readonly __wbg_encryptor_free: (a: number, b: number) => void;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
