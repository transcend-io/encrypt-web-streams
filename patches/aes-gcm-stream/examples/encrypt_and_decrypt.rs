use aes_gcm_stream::{Aes256GcmStreamDecryptor, Aes256GcmStreamEncryptor};
use zeroize::Zeroize;

fn main() {
    // IMPORTANT! key and nonce SHOULD generate by random
    let mut key = [0u8; 32];
    let mut nonce = [0; 12];

    let mut encryptor = Aes256GcmStreamEncryptor::new(key.clone(), &nonce);

    let mut ciphertext = vec![];
    ciphertext.extend_from_slice(&encryptor.update(b"Hello "));
    ciphertext.extend_from_slice(&encryptor.update(b" World"));
    ciphertext.extend_from_slice(&encryptor.update(b"!"));
    let (last_block, tag) = encryptor.finalize();
    ciphertext.extend_from_slice(&last_block);
    ciphertext.extend_from_slice(&tag);

    println!("Ciphertext: {}", hex::encode(&ciphertext));

    let mut decryptor = Aes256GcmStreamDecryptor::new(key.clone(), &nonce);

    let mut plaintext = vec![];
    plaintext.extend_from_slice(decryptor.update(&ciphertext).as_slice());
    plaintext.extend_from_slice(&decryptor.finalize().expect("decrypt error"));

    println!("Plaintext: {}", String::from_utf8_lossy(&plaintext));
    key.zeroize();
    nonce.zeroize();
}