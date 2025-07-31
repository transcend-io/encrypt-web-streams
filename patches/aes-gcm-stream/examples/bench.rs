use aes_gcm::{Aes256Gcm, KeyInit};
use aes_gcm::aead::{Aead, Nonce};
use benchmark_simple::{Bench, Options};

use aes_gcm_stream::{Aes128GcmStreamEncryptor, Aes192GcmStreamEncryptor, Aes256GcmStreamDecryptor, Aes256GcmStreamEncryptor};

fn test_aes128_encrypt(m: &mut [u8]) {
    let key = [0u8; 16];
    let nonce = [0u8; 12];
    let mut encryptor = Aes128GcmStreamEncryptor::new(key, &nonce);

    encryptor.update(m);
    encryptor.finalize();
}

fn test_aes192_encrypt(m: &mut [u8]) {
    let key = [0u8; 24];
    let nonce = [0u8; 12];
    let mut encryptor = Aes192GcmStreamEncryptor::new(key, &nonce);

    encryptor.update(m);
    encryptor.finalize();
}

fn test_aes256_encrypt(m: &mut [u8]) {
    let key = [0u8; 32];
    let nonce = [0u8; 12];
    let mut encryptor = Aes256GcmStreamEncryptor::new(key, &nonce);

    encryptor.update(m);
    encryptor.finalize();
}

fn test_aes256_encrypted_and_decrypt(m: &mut [u8]) {
    let key = [0u8; 32];
    let nonce = [0u8; 12];
    let mut encryptor = Aes256GcmStreamEncryptor::new(key.clone(), &nonce);

    let mut encrypted = encryptor.update(m);
    let (last_block, tag) = encryptor.finalize();
    encrypted.extend_from_slice(&last_block);
    encrypted.extend_from_slice(&tag);

    let mut decryptor = Aes256GcmStreamDecryptor::new(key, &nonce);
    let mut decrypted = decryptor.update(&encrypted);
    let last_block = decryptor.finalize().expect("decrypt failed");
    decrypted.extend_from_slice(&last_block);
    assert_eq!(m, decrypted.as_slice());
}

fn test_aes256_encrypt_aesgcm(m: &mut [u8]) {
    let key = [0u8; 32];
    let nonce = [0u8; 12];

    let cipher = Aes256Gcm::new_from_slice(&key).expect("new from key slice");
    let mut n = Nonce::<Aes256Gcm>::default();
    let mn: &mut [u8] = n.as_mut();
    for i in 0..mn.len() { mn[i] = nonce[i]; }
    cipher.encrypt(&n, &m[0..]).expect("decrypt");
}

fn main() {
    let bench = Bench::new();
    let mut m = vec![0xd0u8; 16384];

    let options = &Options {
        iterations: 1_000,
        warmup_iterations: 1_00,
        min_samples: 5,
        max_samples: 10,
        max_rsd: 1.0,
        ..Default::default()
    };

    let res = bench.run(options, || test_aes128_encrypt(&mut m));
    println!("AES128 encrypt         : {}", res.throughput(m.len() as _));

    let res = bench.run(options, || test_aes192_encrypt(&mut m));
    println!("AES192 encrypt         : {}", res.throughput(m.len() as _));

    let res = bench.run(options, || test_aes256_encrypt(&mut m));
    println!("AES256 encrypt         : {}", res.throughput(m.len() as _));

    let res = bench.run(options, || test_aes256_encrypted_and_decrypt(&mut m));
    println!("AES256 en/decrypt      : {}", res.throughput(m.len() as _));

    let res = bench.run(options, || test_aes256_encrypt_aesgcm(&mut m));
    println!("AES256 encrypt aes-gcm : {}", res.throughput(m.len() as _));
}