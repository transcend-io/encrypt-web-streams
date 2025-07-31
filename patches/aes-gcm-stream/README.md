# aes-gcm-stream

[Crates](https://crates.io/crates/aes-gcm-stream)
| [Document](https://docs.rs/aes-gcm-stream/)

## Encrypt

```rust
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
```

## Run Example

Open example: [encrypt_and_decrypt.rs](https://git.hatter.ink/hatter/aes-gcm-stream/src/branch/main/examples/encrypt_and_decrypt.rs)

```shell
$ cargo run --example encrypt_and_decrypt
    Finished dev [unoptimized + debuginfo] target(s) in 0.10s
     Running `target/debug/examples/encrypt_and_decrypt`
Ciphertext: 86c22c5122404b39683ca9b79b889fd00a6212d1be2ebc3f4f8f22f90b
Plaintext: Hello  World!
```

Benchmark @MacBook Pro (Retina, 15-inch, Late 2013/2 GHz Quad-Core Intel Core i7)
```text
$ cargo run --release --example bench
AES128 encrypt         : 483.04 M/s
AES192 encrypt         : 466.22 M/s
AES256 encrypt         : 451.38 M/s
AES256 en/decrypt      : 222.66 M/s
AES256 encrypt aes-gcm : 547.63 M/s
```


> Thanks:
> * https://developer.aliyun.com/article/952809
> * https://crates.io/crates/aes-gcm
