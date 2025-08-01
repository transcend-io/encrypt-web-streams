# Patches

This directory contains patched versions of dependencies that are applied using Cargo's `[patch]` system.

## aes-gcm-stream

**Original version:** 0.2.4  
**Patched version:** Local copy with overflow protection

### Changes Applied

1. **Overflow Protection in `encryptor.rs`** (lines ~104-105):
   - Replaced simple multiplication with `checked_mul` to prevent integer overflow
   - Added `expect()` calls to handle overflow cases (since the function returns a tuple, not a Result)

2. **Overflow Protection in `decryptor.rs`** (lines ~108-109):
   - Replaced simple multiplication with `checked_mul` to prevent integer overflow
   - Added proper error handling with `?` operator for large associated data and message sizes

### Technical Details

The original code used:

```rust
let adata_bit_len = self.adata_len * 8;
let message_bit_len = self.message_len * 8;
```

This was replaced with:

**For encryptor.rs (returns `(Vec<u8>, Vec<u8>)`):**

```rust
let adata_bit_len = (self.adata_len as u64)
    .checked_mul(8)
    .expect("Associated data is too large");
let message_bit_len = (self.message_len as u64)
    .checked_mul(8)
    .expect("Message is too large");
```

**For decryptor.rs (returns `Result<Vec<u8>, String>`):**

```rust
let adata_bit_len = (self.adata_len as u64)
    .checked_mul(8)
    .ok_or_else(|| "Associated data is too large".to_string())?;
let message_bit_len = (self.message_len as u64)
    .checked_mul(8)
    .ok_or_else(|| "Message is too large".to_string())?;
```

### Why This Patch is Needed

The original implementation could suffer from integer overflow when processing very large files or associated data, which could lead to security vulnerabilities or incorrect behavior. This patch ensures that such cases are handled gracefully with proper error messages.

### How to Apply This Patch

The patch is automatically applied via the `[patch]` section in `rust/Cargo.toml`:

```toml
[patch.crates-io]
aes-gcm-stream = { path = "./patches/aes-gcm-stream" }
```

This tells Cargo to use our local patched version instead of the one from crates.io.
