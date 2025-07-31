use cipher::BlockSizeUser;
use cipher::consts::U16;

pub(crate) struct AesBlock {}

impl BlockSizeUser for AesBlock {
    type BlockSize = U16;
}

pub(crate) const BLOCK_SIZE: usize = 16;


// R = 11100001 || 0(120)
const R: u128 = 0b11100001 << 120;

pub(crate) fn gmul_128(x: u128, y: u128) -> u128 {
    let mut z = 0u128;
    let mut v = y;
    for i in (0..128).rev() {
        let xi = (x >> i) & 1;
        if xi != 0 {
            z ^= v;
        }
        v = match v & 1 == 0 {
            true => { v >> 1 }
            false => { (v >> 1) ^ R }
        };
    }
    z
}

pub(crate) fn ghash(key: u128, messages: &[u128]) -> u128 {
    let mut y = 0u128;
    for message in messages {
        let yi = gmul_128(y ^ message, key);
        y = yi;
    }
    y
}

pub(crate) fn normalize_nonce(ghash_key: u128, nonce_bytes: &[u8]) -> (u128, u128) {
    let normalized_nonce = match nonce_bytes.len() == 12 {
        true => {
            let nonce = u8to128(nonce_bytes);
            nonce << 32 | 0x00000001
        }
        false => {
            let mut iv_padding = vec![];
            iv_padding.extend_from_slice(nonce_bytes);
            let left_len = nonce_bytes.len() - 16 * (nonce_bytes.len() / 16);
            let tobe_padding_len = if left_len == 0 { 0 } else { 16 - left_len };
            for _ in 0..tobe_padding_len { iv_padding.push(0); }

            let mut block = ghash::Block::default();
            let nonce_bits = (nonce_bytes.len() as u64) * 8;
            block[8..].copy_from_slice(&nonce_bits.to_be_bytes());
            iv_padding.extend_from_slice(block.as_slice());

            let mut iv_padding_u128 = vec![];
            let block_count = iv_padding.len() / 16;
            for i in 0..block_count {
                iv_padding_u128.push(u8to128(&iv_padding[i * 16..(i + 1) * 16]));
            }
            ghash(ghash_key, &iv_padding_u128)
        }
    };
    (ghash_key, normalized_nonce)
}

#[inline]
pub(crate) fn u8to128(bytes: &[u8]) -> u128 {
    bytes.iter().rev().enumerate().fold(0, |acc, (i, &byte)| {
        acc | (byte as u128) << (i * 8)
    })
}

pub(crate) fn msb_s(s: usize, bytes: &[u8]) -> Vec<u8> {
    let mut result = vec![];
    let n = s / 8;
    let remain = s % 8;
    result.extend_from_slice(&bytes[0..n]);
    if remain > 0 {
        result.push(bytes[n] >> (8 - remain));
    }
    result
}

// incs(X)=MSBlen(X)-s(X) || [int(LSBs(X))+1 mod 2^s]s
#[inline]
pub(crate) fn inc_32(bits: u128) -> u128 {
    let msb = bits >> 32;
    let mut lsb = (bits & 0xffffffff) as u32;
    lsb = lsb.wrapping_add(1);
    msb << 32 | lsb as u128
}

#[test]
fn test_normalize_nonce() {
    use aes_gcm::KeyInit;
    use ghash::Key;
    use ghash::GHash;
    use ghash::universal_hash::UniversalHash;
    let ghash_key = [1u8; 16];
    let key = Key::from(ghash_key);
    let mut ghash = GHash::new(&key);

    let nonce = [1u8; 22];
    ghash.update_padded(&nonce);

    let mut block = ghash::Block::default();
    let nonce_bits = (nonce.len() as u64) * 8;
    block[8..].copy_from_slice(&nonce_bits.to_be_bytes());
    ghash.update(&[block]);
    let final_nonce = ghash.finalize();
    let final_nonce_bytes = final_nonce.as_slice();
    let final_nonce1 = u8to128(final_nonce_bytes);

    let (_, final_nonce2) = normalize_nonce(u8to128(&ghash_key), &nonce);

    assert_eq!(final_nonce1, final_nonce2);
}