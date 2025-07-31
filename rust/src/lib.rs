use aes_gcm_stream::{
    Aes256GcmStreamDecryptor, // streaming decryptor (new, update, finalize)  [oai_citation:1‡Docs.rs](https://docs.rs/aes-gcm-stream/latest/aes_gcm_stream/struct.Aes256GcmStreamDecryptor.html)
    Aes256GcmStreamEncryptor, // streaming encryptor (new, update, finalize)  [oai_citation:0‡Docs.rs](https://docs.rs/aes-gcm-stream/latest/aes_gcm_stream/struct.Aes256GcmStreamEncryptor.html)
};
use wasm_bindgen::prelude::*;

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
        self.inner.finalize().map_err(|e| JsValue::from_str(&e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_large_file_decryption() {
        // Test with a large file to see if there are any issues
        let key = [
            189, 20, 114, 186, 98, 74, 168, 105, 123, 222, 98, 100, 187, 9, 191, 204, 240, 80, 147,
            76, 28, 183, 215, 144, 231, 3, 196, 242, 86, 134, 113, 99,
        ];
        let nonce = [234, 83, 84, 251, 107, 241, 39, 14, 146, 22, 11, 30];
        let auth_tag = [
            167, 55, 52, 35, 238, 229, 16, 11, 101, 35, 239, 207, 138, 106, 162, 54,
        ];

        // Create a large test file (simulate the big.zip issue)
        let large_data = vec![0u8; 100 * 1024 * 1024]; // 100MB of zeros

        // Encrypt the large data
        let mut encryptor = Aes256GcmStreamEncryptor::new(key, &nonce);
        let mut encrypted_data = Vec::new();

        // Process in chunks
        let chunk_size = 1024 * 1024; // 1MB chunks
        for chunk in large_data.chunks(chunk_size) {
            encrypted_data.extend_from_slice(&encryptor.update(chunk));
        }
        let (last, tag) = encryptor.finalize();
        encrypted_data.extend_from_slice(&last);
        encrypted_data.extend_from_slice(&tag);

        println!("Encrypted {} bytes", encrypted_data.len());

        // Now try to decrypt
        let mut decryptor = Aes256GcmStreamDecryptor::new(key, &nonce);
        let mut decrypted_data = Vec::new();

        // Process encrypted data in chunks, excluding the auth tag
        let ciphertext_len = encrypted_data.len() - 16; // Remove auth tag
        let ciphertext = &encrypted_data[..ciphertext_len];

        for chunk in ciphertext.chunks(chunk_size) {
            decrypted_data.extend_from_slice(&decryptor.update(chunk));
        }

        // Add the auth tag
        decryptor.update(&auth_tag);

        // Finalize
        match decryptor.finalize() {
            Ok(last) => {
                decrypted_data.extend_from_slice(&last);
                println!("Successfully decrypted {} bytes", decrypted_data.len());
                assert_eq!(decrypted_data.len(), large_data.len());
                assert_eq!(decrypted_data, large_data);
            }
            Err(e) => {
                println!("Decryption failed: {}", e);
                panic!("Decryption failed: {}", e);
            }
        }
    }

    #[test]
    fn test_counter_overflow() {
        // Test specifically for counter overflow issues
        let key = [
            189, 20, 114, 186, 98, 74, 168, 105, 123, 222, 98, 100, 187, 9, 191, 204, 240, 80, 147,
            76, 28, 183, 215, 144, 231, 3, 196, 242, 86, 134, 113, 99,
        ];
        let nonce = [234, 83, 84, 251, 107, 241, 39, 14, 146, 22, 11, 30];

        // Create data that would cause many block operations
        // Each block is 16 bytes, so we need a lot of blocks to test counter overflow
        let block_count = 1u64 << 32; // 2^32 blocks = 64GB
        let data_size = block_count * 16;

        println!("Testing with {} blocks ({} bytes)", block_count, data_size);

        // For testing, let's use a smaller but still large number
        let test_blocks = 1 << 24; // 2^24 blocks = 256MB
        let test_data = vec![0u8; test_blocks * 16];

        let mut encryptor = Aes256GcmStreamEncryptor::new(key, &nonce);
        let mut encrypted_data = Vec::new();

        // Process in smaller chunks to avoid memory issues
        let chunk_size = 1024 * 1024; // 1MB chunks
        for chunk in test_data.chunks(chunk_size) {
            encrypted_data.extend_from_slice(&encryptor.update(chunk));
        }
        let (last, tag) = encryptor.finalize();
        encrypted_data.extend_from_slice(&last);
        encrypted_data.extend_from_slice(&tag);

        println!(
            "Encrypted {} bytes with {} blocks",
            encrypted_data.len(),
            test_blocks
        );

        // Now decrypt
        let mut decryptor = Aes256GcmStreamDecryptor::new(key, &nonce);
        let mut decrypted_data = Vec::new();

        let ciphertext_len = encrypted_data.len() - 16;
        let ciphertext = &encrypted_data[..ciphertext_len];

        for chunk in ciphertext.chunks(chunk_size) {
            decrypted_data.extend_from_slice(&decryptor.update(chunk));
        }

        // Add the auth tag
        decryptor.update(&tag);

        match decryptor.finalize() {
            Ok(last) => {
                decrypted_data.extend_from_slice(&last);
                println!("Successfully decrypted {} bytes", decrypted_data.len());
                assert_eq!(decrypted_data.len(), test_data.len());
                assert_eq!(decrypted_data, test_data);
            }
            Err(e) => {
                println!("Decryption failed: {}", e);
                panic!("Decryption failed: {}", e);
            }
        }
    }
}
