use aes::cipher::generic_array::GenericArray;
use aes::cipher::{Block, BlockEncrypt, KeyInit};
use aes::{Aes128, Aes192, Aes256};
use ghash::universal_hash::UniversalHash;
use ghash::GHash;
use zeroize::Zeroize;

use crate::util::{inc_32, msb_s, normalize_nonce, u8to128, AesBlock, BLOCK_SIZE};

macro_rules! define_aes_gcm_stream_decryptor_impl {
    (
        $module:tt,
        $aesn:tt,
        $key_size:tt
    ) => {
        pub struct $module {
            cipher: $aesn,
            message_buffer: Vec<u8>,
            ghash: GHash,
            init_nonce: u128,
            encryption_nonce: u128,
            adata_len: u64,
            message_len: u64,
        }

        impl $module {
            pub fn new(key: [u8; $key_size], nonce: &[u8]) -> Self {
                let key = GenericArray::from(key);
                let aes = $aesn::new(&key);

                let mut ghash_key = ghash::Key::default();
                aes.encrypt_block(&mut ghash_key);
                let ghash = GHash::new(&ghash_key);
                ghash_key.zeroize();

                let mut s = Self {
                    cipher: aes,
                    message_buffer: vec![],
                    ghash,
                    init_nonce: 0,
                    encryption_nonce: 0,
                    adata_len: 0,
                    message_len: 0,
                };
                let (_, normalized_nonce) = s.normalize_nonce(nonce);
                s.init_nonce = normalized_nonce;
                s.encryption_nonce = normalized_nonce;
                s
            }

            pub fn init_adata(&mut self, adata: &[u8]) {
                if adata.len() > 0 {
                    self.adata_len += adata.len() as u64;
                    self.ghash.update_padded(adata);
                }
            }

            pub fn update(&mut self, bytes: &[u8]) -> Vec<u8> {
                self.message_buffer.extend_from_slice(bytes);
                let message_buffer_slice = self.message_buffer.as_slice();
                let message_buffer_len = message_buffer_slice.len();
                if message_buffer_len < 32 {
                    return Vec::with_capacity(0);
                }
                let blocks_count = (message_buffer_len / 16) - 1;

                let mut blocks = Vec::with_capacity(blocks_count);
                for _ in 0..blocks_count {
                    self.encryption_nonce = inc_32(self.encryption_nonce);
                    let ctr = self.encryption_nonce.to_be_bytes();
                    blocks.push(Block::<AesBlock>::clone_from_slice(&ctr));
                }
                self.cipher.encrypt_blocks(&mut blocks);

                let encrypted_message = &message_buffer_slice[0..blocks_count * BLOCK_SIZE];
                self.ghash.update_padded(encrypted_message);
                let mut plaintext_message = encrypted_message.to_vec();
                for i in 0..blocks_count {
                    let chunk = &mut plaintext_message[i * BLOCK_SIZE..(i + 1) * BLOCK_SIZE];
                    let block = blocks[i].as_slice();
                    for k in 0..BLOCK_SIZE {
                        chunk[k] ^= block[k];
                    }
                }
                self.message_buffer = message_buffer_slice[blocks_count * BLOCK_SIZE..].to_vec();
                self.message_len += plaintext_message.len() as u64;

                plaintext_message
            }

            pub fn finalize(&mut self) -> Result<Vec<u8>, String> {
                let mut plaintext_message = Vec::with_capacity(16);
                let message_buffer_len = self.message_buffer.len();
                if message_buffer_len > 16 {
                    // last block and this block len is less than 128 bits
                    self.encryption_nonce = inc_32(self.encryption_nonce);
                    let mut ctr = self.encryption_nonce.to_be_bytes();
                    let block = Block::<AesBlock>::from_mut_slice(&mut ctr);
                    self.cipher.encrypt_block(block);

                    let chunk = &self.message_buffer[0..message_buffer_len - 16];
                    let msb = msb_s(chunk.len() * 8, block.as_slice());
                    let y = u8to128(chunk) ^ u8to128(&msb);
                    plaintext_message.extend_from_slice(&y.to_be_bytes()[16 - chunk.len()..16]);
                    self.ghash
                        .update_padded(&self.message_buffer[0..message_buffer_len - 16]);
                    self.message_len += plaintext_message.len() as u64;
                }
                let adata_bit_len = self
                    .adata_len
                    .checked_mul(8)
                    .ok_or_else(|| "Associated data is too large".to_string())?;
                let message_bit_len = self
                    .message_len
                    .checked_mul(8)
                    .ok_or_else(|| "Message is too large".to_string())?;
                let mut adata_and_message_len = Vec::with_capacity(BLOCK_SIZE);
                adata_and_message_len.extend_from_slice(&(adata_bit_len as u64).to_be_bytes());
                adata_and_message_len.extend_from_slice(&(message_bit_len as u64).to_be_bytes());
                self.ghash.update_padded(&adata_and_message_len);

                let tag = self.calculate_tag();
                let message_tag = &self.message_buffer[message_buffer_len - 16..];

                if message_tag != tag.as_slice() {
                    Err(format!(
                        "Tag mismatch, expected: {:2x}, actual: {:2x}",
                        u8to128(&tag),
                        u8to128(message_tag)
                    ))
                } else {
                    Ok(plaintext_message)
                }
            }

            fn calculate_tag(&mut self) -> Vec<u8> {
                let mut bs = self.init_nonce.to_be_bytes().clone();
                let block = Block::<AesBlock>::from_mut_slice(&mut bs);
                self.cipher.encrypt_block(block);
                let ghash = self.ghash.clone().finalize();
                let tag_trunk = ghash.as_slice();
                let y = u8to128(&tag_trunk) ^ u8to128(&block.as_slice());
                y.to_be_bytes().to_vec()
            }

            fn ghash_key(&mut self) -> u128 {
                let mut block = [0u8; BLOCK_SIZE];
                let block = Block::<AesBlock>::from_mut_slice(&mut block);
                self.cipher.encrypt_block(block);
                u8to128(&block.as_slice())
            }

            fn normalize_nonce(&mut self, nonce_bytes: &[u8]) -> (u128, u128) {
                let ghash_key = self.ghash_key();
                normalize_nonce(ghash_key, nonce_bytes)
            }
        }
    };
}

define_aes_gcm_stream_decryptor_impl!(Aes128GcmStreamDecryptor, Aes128, 16);
define_aes_gcm_stream_decryptor_impl!(Aes192GcmStreamDecryptor, Aes192, 24);
define_aes_gcm_stream_decryptor_impl!(Aes256GcmStreamDecryptor, Aes256, 32);
