// from: https://developer.aliyun.com/article/952809

use aes::Aes128;
use aes::cipher::{Block, BlockEncrypt, KeyInit};
use aes::cipher::generic_array::GenericArray;

pub struct GCM {
    aes: Aes128,
}

// R = 11100001 || 0(120)
const R: u128 = 0b11100001 << 120;

fn gmul_128(x: u128, y: u128) -> u128 {
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

fn u8to128(bytes: &[u8]) -> u128 {
    let result = bytes.iter().rev().enumerate().fold(0, |acc, (i, &byte)| {
        acc | (byte as u128) << (i * 8)
    });
    result
}

fn msb_s(s: usize, bytes: [u8; 16]) -> Vec<u8> {
    let mut result = vec![];
    let n = s / 8;
    let remain = s % 8;
    for i in 0..n {
        result.push(bytes[i]);
    }
    if remain > 0 {
        result.push(bytes[n] >> (8 - remain));
    }
    result
}

// incs(X)=MSBlen(X)-s(X) || [int(LSBs(X))+1 mod 2^s]s
fn inc_32(bits: u128) -> u128 {
    let msb = bits >> 32;
    let mut lsb = (bits & 0xffffffff) as u32;
    lsb = lsb.wrapping_add(1);
    msb << 32 | lsb as u128
}

fn ghash(key: u128, messages: &[u128]) -> u128 {
    let mut y = 0u128;
    for i in 0..messages.len() {
        let yi = gmul_128(y ^ messages[i], key);
        y = yi;
    }
    y
}

impl GCM {
    pub fn new(key: [u8; 16]) -> Self {
        let key = GenericArray::from(key);
        let aes = Aes128::new(&key);
        Self {
            aes,
        }
    }
    fn ghash_key(&mut self) -> u128 {
        let mut block = [0u8; 16];
        let block = Block::<Aes128>::from_mut_slice(&mut block);
        self.aes.encrypt_block(block);
        u8to128(&block.as_slice())
    }
    pub fn gctr(&mut self, iv: u128, message: &[u8]) -> Vec<u8> {
        // 如果X是空串, 则直接返回
        if message.len() == 0 {
            return vec![];
        }
        let mut output = vec![];
        let mut cb = iv;
        for chunk in message.chunks(16) {
            if chunk.len() < 16 {
                let mut bs = cb.to_be_bytes().clone();
                let block = Block::<Aes128>::from_mut_slice(&mut bs);
                self.aes.encrypt_block(block);
                let b = {
                    let mut b = [0u8; 16];
                    for i in 0..16 {
                        b[i] = block.as_slice()[i];
                    }
                    b
                };
                let msb = msb_s(chunk.len() * 8, b);
                let y = u8to128(chunk) ^ u8to128(&msb);
                output.extend_from_slice(&y.to_be_bytes()[16 - chunk.len()..16])
            } else {
                let mut bs = cb.to_be_bytes().clone();
                let block = Block::<Aes128>::from_mut_slice(&mut bs);
                self.aes.encrypt_block(block);
                let y = u8to128(chunk) ^ u8to128(&block.as_slice());
                output.extend_from_slice(&y.to_be_bytes());
            }
            // counter + 1
            cb = inc_32(cb);
        }
        output
    }
    pub fn ae(&mut self, iv_bytes: &[u8], adata: &[u8], message: &[u8]) -> (Vec<u8>, Vec<u8>) {
        let ghash_key = self.ghash_key();
        let mut iv_padding = vec![];
        let iv = u8to128(iv_bytes);
        let j0 = match iv_bytes.len() == 12 {
            true => {
                iv << 32 | 0x00000001
            }
            false => {
                // s = 128[len(iv) / 128] - len(iv)
                let s = 128 * (((iv_bytes.len() * 8) + 128 - 1) / 128) - (iv_bytes.len() * 8);
                iv_padding.push(iv << s);
                iv_padding.push((iv_bytes.len() * 8) as u128);
                ghash(ghash_key, &iv_padding)
            }
        };
        let message_len = message.len() * 8;
        let adata_len = adata.len() * 8;
        let u = 128 * ((message_len + 128 - 1) / 128) - message_len;
        let v = 128 * ((adata_len + 128 - 1) / 128) - adata_len;
        // println!("message_len, adata_len: {}, {}", message.len(), adata.len());
        // println!("u, v: {}, {}", u, v);
        // println!("j0 = {:02x?}", j0);
        let enc = self.gctr(inc_32(j0), &message);
        let mut bit_string = Vec::<u8>::new();
        bit_string.extend_from_slice(adata);
        bit_string.extend_from_slice(&vec![0x00; v / 8]);
        // 这里认证的是密文
        bit_string.extend_from_slice(&enc);
        bit_string.extend_from_slice(&vec![0x00; u / 8]);
        bit_string.extend_from_slice(&(adata_len as u64).to_be_bytes());
        bit_string.extend_from_slice(&(message_len as u64).to_be_bytes());
        // println!("len = {}, bit_string[u8] = {:02x?}", bit_string.len(), bit_string);
        let bit_string: Vec<u128> = bit_string.chunks(16).map(|it| u8to128(it)).collect();
        // println!("bit_string[u128] = {:02x?}", bit_string);
        let s = ghash(ghash_key, &bit_string).to_be_bytes();
        //println!("{:02x?}", s);
        let tag = self.gctr(j0, &s);
        // println!("tag = {:02x?}", tag);
        // println!("enc = {:02x?}", enc);
        (tag, enc)
    }
}
