use zeroize::Zeroize;

/// This library is created for AES/GCM stream encrypt or decrypt
///
/// Structs for encryption:
/// * Aes128GcmStreamEncryptor
/// * Aes192GcmStreamEncryptor
/// * Aes256GcmStreamEncryptor
///
/// Structs for decryption:
/// * Aes128GcmStreamDecryptor
/// * Aes192GcmStreamDecryptor
/// * Aes256GcmStreamDecryptor

pub use decryptor::Aes128GcmStreamDecryptor;
pub use decryptor::Aes192GcmStreamDecryptor;
pub use decryptor::Aes256GcmStreamDecryptor;
// ----------------------------------------
pub use encryptor::Aes128GcmStreamEncryptor;
pub use encryptor::Aes192GcmStreamEncryptor;
pub use encryptor::Aes256GcmStreamEncryptor;

mod util;
mod encryptor;
mod decryptor;

pub fn aes_gcm_encrypt(key: &[u8], nonce: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    match key.len() {
        16 => aes_128_gcm_encrypt(key, nonce, message),
        24 => aes_192_gcm_encrypt(key, nonce, message),
        32 => aes_256_gcm_encrypt(key, nonce, message),
        _ => Err(format!("Bad key length")),
    }
}

pub fn aes_gcm_decrypt(key: &[u8], nonce: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    match key.len() {
        16 => aes_128_gcm_decrypt(key, nonce, message),
        24 => aes_192_gcm_decrypt(key, nonce, message),
        32 => aes_256_gcm_decrypt(key, nonce, message),
        _ => Err(format!("Bad key length")),
    }
}

pub fn aes_128_gcm_decrypt(key: &[u8], nonce: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    let mut key: [u8; 16] = key.try_into().map_err(|_| format!("Bad key length"))?;
    let mut gcm_stream = Aes128GcmStreamDecryptor::new(key, nonce);
    let mut first_block = gcm_stream.update(message);
    let final_block = gcm_stream.finalize()?;
    first_block.extend_from_slice(&final_block);
    key.zeroize();
    Ok(first_block)
}

pub fn aes_192_gcm_decrypt(key: &[u8], nonce: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    let mut key: [u8; 24] = key.try_into().map_err(|_| format!("Bad key length"))?;
    let mut gcm_stream = Aes192GcmStreamDecryptor::new(key, nonce);
    let mut first_block = gcm_stream.update(message);
    let final_block = gcm_stream.finalize()?;
    first_block.extend_from_slice(&final_block);
    key.zeroize();
    Ok(first_block)
}

pub fn aes_256_gcm_decrypt(key: &[u8], nonce: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    let mut key: [u8; 32] = key.try_into().map_err(|_| format!("Bad key length"))?;
    let mut gcm_stream = Aes256GcmStreamDecryptor::new(key, nonce);
    let mut first_block = gcm_stream.update(message);
    let final_block = gcm_stream.finalize()?;
    first_block.extend_from_slice(&final_block);
    key.zeroize();
    Ok(first_block)
}

pub fn aes_128_gcm_encrypt(key: &[u8], nonce: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    let mut key: [u8; 16] = key.try_into().map_err(|_| format!("Bad key length"))?;
    let mut gcm_stream = Aes128GcmStreamEncryptor::new(key, nonce);
    let mut first_block = gcm_stream.update(message);
    let (last_block, tag) = gcm_stream.finalize();
    first_block.extend_from_slice(&last_block);
    first_block.extend_from_slice(&tag);
    key.zeroize();
    Ok(first_block)
}

pub fn aes_192_gcm_encrypt(key: &[u8], nonce: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    let mut key: [u8; 24] = key.try_into().map_err(|_| format!("Bad key length"))?;
    let mut gcm_stream = Aes192GcmStreamEncryptor::new(key, nonce);
    let mut first_block = gcm_stream.update(message);
    let (last_block, tag) = gcm_stream.finalize();
    first_block.extend_from_slice(&last_block);
    first_block.extend_from_slice(&tag);
    key.zeroize();
    Ok(first_block)
}

pub fn aes_256_gcm_encrypt(key: &[u8], nonce: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    let mut key: [u8; 32] = key.try_into().map_err(|_| format!("Bad key length"))?;
    let mut gcm_stream = Aes256GcmStreamEncryptor::new(key, nonce);
    let mut first_block = gcm_stream.update(message);
    let (last_block, tag) = gcm_stream.finalize();
    first_block.extend_from_slice(&last_block);
    first_block.extend_from_slice(&tag);
    key.zeroize();
    Ok(first_block)
}

#[test]
fn test128() {
    use aes_gcm::{aead::{Aead, Nonce, Payload}, Aes128Gcm, KeyInit};
    let knp = vec![
        ([1; 16], [0; 12], &[] as &[u8], b"Hello World!" as &[u8]),
        ([2; 16], [0; 12], &[1; 16], b"Hello World!" as &[u8]),
        ([3; 16], [0; 12], &[1; 17], b"Hello World!" as &[u8]),
        ([4; 16], [0; 12], &[1; 32], b"Hello World!" as &[u8]),
        ([5; 16], [0; 12], &[1; 64], b"Hello World!" as &[u8]),
        ([6; 16], [0; 12], &[1, 2, 3], b"Hello World!" as &[u8]),
        ([1; 16], [0; 12], &[], b"Hello World!"),
        ([7; 16], [1; 12], &[], b"Hello World!"),
        ([1; 16], [1; 12], &[], b"Hello World ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~!"),
        ([1; 16], [1; 12], &[0; 129], b"Hello World ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~!"),
        ([0xff; 16], [0; 12], &[], b"Hello World!"),
        ([8; 16], [0xff; 12], &[], b"Hello World!"),
        ([0xff; 16], [0xff; 12], &[], b"Hello World ~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~!"),
        ([0xff; 16], [0xff; 12], &[11, 22, 33], b"Hello World ~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~!"),
    ];

    for (key, nonce, aad, plaintext) in knp {
        // encrypt
        let mut ciphertext = vec![];
        let mut encryptor = Aes128GcmStreamEncryptor::new(key.clone(), &nonce);
        if !aad.is_empty() {
            encryptor.init_adata(aad);
        }
        ciphertext.extend_from_slice(&encryptor.update(plaintext));
        let (last_block, tag) = encryptor.finalize();
        ciphertext.extend_from_slice(&last_block);
        ciphertext.extend_from_slice(&tag);

        // decrypt 1
        let mut decryptor = Aes128GcmStreamDecryptor::new(key.clone(), &nonce);
        if !aad.is_empty() {
            decryptor.init_adata(aad);
        }
        let mut plaintext1 = decryptor.update(ciphertext.as_slice());
        let plaintext2 = decryptor.finalize().expect("decryptor decrypt");
        plaintext1.extend_from_slice(&plaintext2);
        assert_eq!(plaintext, plaintext1.as_slice());

        // decrypt 2
        let cipher = Aes128Gcm::new_from_slice(&key).expect("new from key slice");
        let mut decrypt_nonce = Nonce::<Aes128Gcm>::default();
        let m: &mut [u8] = decrypt_nonce.as_mut();
        for i in 0..m.len() {
            m[i] = nonce[i];
        }
        let decrypted_plaintext = if aad.is_empty() {
            cipher.decrypt(&decrypt_nonce, ciphertext.as_slice()).expect("decrypt1")
        } else {
            cipher.decrypt(&decrypt_nonce, Payload {
                msg: ciphertext.as_slice(),
                aad,
            }).expect("decrypt2")
        };
        assert_eq!(plaintext, decrypted_plaintext.as_slice());
    }
}

#[test]
fn test192() {
    let knp = vec![
        ([1; 24], [0; 12], &[] as &[u8], b"Hello World!" as &[u8]),
        ([2; 24], [0; 12], &[1; 16], b"Hello World!" as &[u8]),
        ([3; 24], [0; 12], &[1; 17], b"Hello World!" as &[u8]),
        ([4; 24], [0; 12], &[1; 32], b"Hello World!" as &[u8]),
        ([5; 24], [0; 12], &[1; 64], b"Hello World!" as &[u8]),
        ([6; 24], [0; 12], &[1, 2, 3], b"Hello World!" as &[u8]),
        ([1; 24], [0; 12], &[], b"Hello World!"),
        ([8; 24], [1; 12], &[], b"Hello World!"),
        ([1; 24], [1; 12], &[], b"Hello World ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~!"),
        ([1; 24], [1; 12], &[0; 129], b"Hello World ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~!"),
        ([0xff; 24], [0; 12], &[], b"Hello World!"),
        ([9; 24], [0xff; 12], &[], b"Hello World!"),
        ([0xff; 24], [0xff; 12], &[], b"Hello World ~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~!"),
        ([0xff; 24], [0xff; 12], &[11, 22, 33], b"Hello World ~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~!"),
    ];

    for (key, nonce, aad, plaintext) in knp {
        // encrypt
        let mut ciphertext = vec![];
        let mut encryptor = Aes192GcmStreamEncryptor::new(key.clone(), &nonce);
        if !aad.is_empty() {
            encryptor.init_adata(aad);
        }
        ciphertext.extend_from_slice(&encryptor.update(plaintext));
        let (last_block, tag) = encryptor.finalize();
        ciphertext.extend_from_slice(&last_block);
        ciphertext.extend_from_slice(&tag);

        // decrypt 1
        let mut decryptor = Aes192GcmStreamDecryptor::new(key.clone(), &nonce);
        if !aad.is_empty() {
            decryptor.init_adata(aad);
        }
        let mut plaintext1 = decryptor.update(ciphertext.as_slice());
        let plaintext2 = decryptor.finalize().expect("decryptor decrypt");
        plaintext1.extend_from_slice(&plaintext2);
        assert_eq!(plaintext, plaintext1.as_slice());

        // ops, aes_gcm not supports AES192 bit keys
    }
}

#[test]
fn test256() {
    use aes_gcm::{aead::{Aead, Nonce, Payload}, Aes256Gcm, KeyInit};
    let knp = vec![
        ([1; 32], [0; 12], &[] as &[u8], b"Hello World!" as &[u8]),
        ([2; 32], [0; 12], &[1; 16], b"Hello World!" as &[u8]),
        ([3; 32], [0; 12], &[1; 17], b"Hello World!" as &[u8]),
        ([4; 32], [0; 12], &[1; 32], b"Hello World!" as &[u8]),
        ([5; 32], [0; 12], &[1; 64], b"Hello World!" as &[u8]),
        ([6; 32], [0; 12], &[1, 2, 3], b"Hello World!" as &[u8]),
        ([1; 32], [0; 12], &[], b"Hello World!"),
        ([7; 32], [1; 12], &[], b"Hello World!"),
        ([1; 32], [1; 12], &[], b"Hello World ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~!"),
        ([1; 32], [1; 12], &[0; 129], b"Hello World ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~!"),
        ([0xff; 32], [0; 12], &[], b"Hello World!"),
        ([8; 32], [0xff; 12], &[], b"Hello World!"),
        ([0xff; 32], [0xff; 12], &[], b"Hello World ~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~!"),
        ([0xff; 32], [0xff; 12], &[11, 22, 33], b"Hello World ~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\
        ~~~~~~~~~!"),
    ];

    for (key, nonce, aad, plaintext) in knp {
        println!("======= {} {} {} {}", hex::encode(key), hex::encode(nonce), hex::encode(aad), hex::encode(plaintext));
        // encrypt
        let mut ciphertext = vec![];
        let mut encryptor = Aes256GcmStreamEncryptor::new(key.clone(), &nonce);
        if !aad.is_empty() {
            encryptor.init_adata(aad);
        }
        ciphertext.extend_from_slice(&encryptor.update(plaintext));
        let (last_block, tag) = encryptor.finalize();
        ciphertext.extend_from_slice(&last_block);
        ciphertext.extend_from_slice(&tag);

        // decrypt 1
        let mut decryptor = Aes256GcmStreamDecryptor::new(key.clone(), &nonce);
        if !aad.is_empty() {
            decryptor.init_adata(aad);
        }
        let mut plaintext1 = decryptor.update(ciphertext.as_slice());
        let plaintext2 = decryptor.finalize().expect("decryptor decrypt");
        plaintext1.extend_from_slice(&plaintext2);
        assert_eq!(plaintext, plaintext1.as_slice());

        // decrypt 2
        let cipher = Aes256Gcm::new_from_slice(&key).expect("new from key slice");
        let mut decrypt_nonce = Nonce::<Aes256Gcm>::default();
        let m: &mut [u8] = decrypt_nonce.as_mut();
        for i in 0..m.len() {
            m[i] = nonce[i];
        }
        let decrypted_plaintext = if aad.is_empty() {
            cipher.decrypt(&decrypt_nonce, ciphertext.as_slice()).expect("decrypt1")
        } else {
            cipher.decrypt(&decrypt_nonce, Payload {
                msg: ciphertext.as_slice(),
                aad,
            }).expect("decrypt2")
        };
        assert_eq!(plaintext, decrypted_plaintext.as_slice());
    }
}

#[test]
fn test256_stream() {
    use aes_gcm::{aead::{Aead, Nonce}, Aes256Gcm, KeyInit};
    let key = [0u8; 32];
    let nonce = [0; 12];

    let mut plaintext = vec![];
    // encrypt
    let mut ciphertext = vec![];
    let mut encryptor = Aes256GcmStreamEncryptor::new(key.clone(), &nonce);
    for i in 0..1025 {
        plaintext.extend_from_slice(&[(i % 128) as u8]);
        ciphertext.extend_from_slice(&encryptor.update(&[(i % 128) as u8]));
    }
    let (last_block, tag) = encryptor.finalize();
    ciphertext.extend_from_slice(&last_block);
    ciphertext.extend_from_slice(&tag);


    // decrypt 1
    let mut decryptor = Aes256GcmStreamDecryptor::new(key.clone(), &nonce);
    let mut plaintext1 = vec![];
    for i in 0..ciphertext.len() {
        plaintext1.extend_from_slice(decryptor.update(
            &[ciphertext.as_slice()[i]]).as_slice());
    }
    let plaintext2 = decryptor.finalize().expect("decryptor decrypt");
    plaintext1.extend_from_slice(&plaintext2);
    assert_eq!(plaintext, plaintext1.as_slice());

    // decrypt 2
    let cipher = Aes256Gcm::new_from_slice(&key).expect("new from key slice");
    let mut decrypt_nonce = Nonce::<Aes256Gcm>::default();
    let m: &mut [u8] = decrypt_nonce.as_mut();
    for i in 0..m.len() {
        m[i] = nonce[i];
    }
    let decrypted_plaintext = cipher.decrypt(&decrypt_nonce, ciphertext.as_slice()).expect("decrypt1");
    assert_eq!(plaintext, decrypted_plaintext.as_slice());
}

#[test]
fn test128_stream_and_array() {
    let key = [0u8; 16];
    let nonce = [0; 12];

    let mut plaintext = vec![];
    // encrypt
    let mut ciphertext = vec![];
    let mut encryptor = Aes128GcmStreamEncryptor::new(key.clone(), &nonce);
    for i in 0..1025 {
        plaintext.extend_from_slice(&[(i % 128) as u8]);
        ciphertext.extend_from_slice(&encryptor.update(&[(i % 128) as u8]));
    }
    let (last_block, tag) = encryptor.finalize();
    ciphertext.extend_from_slice(&last_block);
    ciphertext.extend_from_slice(&tag);

    let encrypted = aes_128_gcm_encrypt(&key, &nonce, &plaintext).unwrap();
    let decrypted = aes_128_gcm_decrypt(&key, &nonce, &ciphertext).unwrap();
    assert_eq!(ciphertext, encrypted);
    assert_eq!(plaintext, decrypted);

    let encrypted = aes_gcm_encrypt(&key, &nonce, &plaintext).unwrap();
    let decrypted = aes_gcm_decrypt(&key, &nonce, &ciphertext).unwrap();
    assert_eq!(ciphertext, encrypted);
    assert_eq!(plaintext, decrypted);
}

#[test]
fn test192_stream_and_array() {
    let key = [0u8; 24];
    let nonce = [0; 12];

    let mut plaintext = vec![];
    // encrypt
    let mut ciphertext = vec![];
    let mut encryptor = Aes192GcmStreamEncryptor::new(key.clone(), &nonce);
    for i in 0..1025 {
        plaintext.extend_from_slice(&[(i % 128) as u8]);
        ciphertext.extend_from_slice(&encryptor.update(&[(i % 128) as u8]));
    }
    let (last_block, tag) = encryptor.finalize();
    ciphertext.extend_from_slice(&last_block);
    ciphertext.extend_from_slice(&tag);

    let encrypted = aes_192_gcm_encrypt(&key, &nonce, &plaintext).unwrap();
    let decrypted = aes_192_gcm_decrypt(&key, &nonce, &ciphertext).unwrap();
    assert_eq!(ciphertext, encrypted);
    assert_eq!(plaintext, decrypted);

    let encrypted = aes_gcm_encrypt(&key, &nonce, &plaintext).unwrap();
    let decrypted = aes_gcm_decrypt(&key, &nonce, &ciphertext).unwrap();
    assert_eq!(ciphertext, encrypted);
    assert_eq!(plaintext, decrypted);
}

#[test]
fn test256_stream_and_array() {
    let key = [0u8; 32];
    let nonce = [0; 12];

    let mut plaintext = vec![];
    // encrypt
    let mut ciphertext = vec![];
    let mut encryptor = Aes256GcmStreamEncryptor::new(key.clone(), &nonce);
    for i in 0..1025 {
        plaintext.extend_from_slice(&[(i % 128) as u8]);
        ciphertext.extend_from_slice(&encryptor.update(&[(i % 128) as u8]));
    }
    let (last_block, tag) = encryptor.finalize();
    ciphertext.extend_from_slice(&last_block);
    ciphertext.extend_from_slice(&tag);

    let encrypted = aes_256_gcm_encrypt(&key, &nonce, &plaintext).unwrap();
    let decrypted = aes_256_gcm_decrypt(&key, &nonce, &ciphertext).unwrap();
    assert_eq!(ciphertext, encrypted);
    assert_eq!(plaintext, decrypted);

    let encrypted = aes_gcm_encrypt(&key, &nonce, &plaintext).unwrap();
    let decrypted = aes_gcm_decrypt(&key, &nonce, &ciphertext).unwrap();
    assert_eq!(ciphertext, encrypted);
    assert_eq!(plaintext, decrypted);
}

#[test]
fn test125_ab_nonce() {
    let key = hex::decode("faf6a891866fac550ef548b4e5f6fbc98fccc6827cd943cc8d7539747f1d87bd").unwrap();
    let key: [u8; 32] = key.try_into().map_err(|_| format!("Bad key length")).unwrap();
    let nonce = hex::decode("cea500817694e16e734f07df422f6f52582d844e623746a96c5fbb4be2a38a6e").unwrap();
    let ciphertext = hex::decode("c52dadf683c02e81d842f6563b").unwrap();
    let tag = hex::decode("cc9062944525de37d3aa588c6a5676a2").unwrap();
    let aad = b"firstName:";

    let mut gcm_stream = Aes256GcmStreamDecryptor::new(key, &nonce);
    gcm_stream.init_adata(&aad[..]);
    let mut first_block = gcm_stream.update(&ciphertext);
    let second_block = gcm_stream.update(&tag);
    let final_block = gcm_stream.finalize().unwrap();

    first_block.extend_from_slice(&second_block);
    first_block.extend_from_slice(&final_block);

    assert_eq!("John --- TEST", String::from_utf8(first_block).unwrap());
}
