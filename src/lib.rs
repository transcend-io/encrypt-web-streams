use wasm_bindgen::prelude::*;
use aes_gcm_stream::{
    Aes256GcmStreamEncryptor,   // streaming encryptor (new, update, finalize)  [oai_citation:0‡Docs.rs](https://docs.rs/aes-gcm-stream/latest/aes_gcm_stream/struct.Aes256GcmStreamEncryptor.html)
    Aes256GcmStreamDecryptor,   // streaming decryptor (new, update, finalize)  [oai_citation:1‡Docs.rs](https://docs.rs/aes-gcm-stream/latest/aes_gcm_stream/struct.Aes256GcmStreamDecryptor.html)
};

/// Streaming AES-256-GCM encryptor.
#[wasm_bindgen]
pub struct Encryptor {
    inner: Aes256GcmStreamEncryptor,
}

#[wasm_bindgen]
impl Encryptor {
    /// Create with a 32-byte key and nonce (recommend 12 bytes).
    #[wasm_bindgen(constructor)]
    pub fn new(key: &[u8], nonce: &[u8]) -> Result<Encryptor, JsValue> {
        if key.len() != 32 {
            return Err(JsValue::from_str("Key must be 32 bytes"));
        }
        let mut key_arr = [0u8; 32];
        key_arr.copy_from_slice(key);
        Ok(Encryptor {
            inner: Aes256GcmStreamEncryptor::new(key_arr, nonce),
        })
    }

    /// (Optional) set Additional Authenticated Data.
    #[wasm_bindgen]
    pub fn init_adata(&mut self, adata: &[u8]) {
        self.inner.init_adata(adata);
    }

    /// Encrypt one chunk; returns ciphertext for that chunk.
    #[wasm_bindgen]
    pub fn update(&mut self, chunk: &[u8]) -> Vec<u8> {
        self.inner.update(chunk)
    }

    /// Finalize: returns `(remaining_ciphertext, tag)`, concatenated.
    #[wasm_bindgen]
    pub fn finalize(&mut self) -> Vec<u8> {
        let (last, tag) = self.inner.finalize();
        let mut out = Vec::with_capacity(last.len() + tag.len());
        out.extend_from_slice(&last);
        out.extend_from_slice(&tag);
        out
    }
}

/// Streaming AES-256-GCM decryptor.
#[wasm_bindgen]
pub struct Decryptor {
    inner: Aes256GcmStreamDecryptor,
}

#[wasm_bindgen]
impl Decryptor {
    #[wasm_bindgen(constructor)]
    pub fn new(key: &[u8], nonce: &[u8]) -> Result<Decryptor, JsValue> {
        if key.len() != 32 {
            return Err(JsValue::from_str("Key must be 32 bytes"));
        }
        let mut key_arr = [0u8; 32];
        key_arr.copy_from_slice(key);
        Ok(Decryptor {
            inner: Aes256GcmStreamDecryptor::new(key_arr, nonce),
        })
    }

    #[wasm_bindgen]
    pub fn init_adata(&mut self, adata: &[u8]) {
        self.inner.init_adata(adata);
    }

    #[wasm_bindgen]
    pub fn update(&mut self, chunk: &[u8]) -> Vec<u8> {
        self.inner.update(chunk)
    }

    /// Finalize: checks tag and returns any remaining plaintext or errors.
    #[wasm_bindgen]
    pub fn finalize(&mut self) -> Result<Vec<u8>, JsValue> {
        self.inner
            .finalize()
            .map_err(|e| JsValue::from_str(&e))
    }
}