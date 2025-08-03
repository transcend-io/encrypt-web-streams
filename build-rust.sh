#!/usr/bin/env bash
set -euo pipefail

# This script builds the rust wasm package with flags to ensure a reproducible build.
cd rust

# Set RUSTFLAGS to remap user-specific paths to generic paths.
# This is crucial for reproducible builds across different machines.
# It remaps the current project directory, the cargo registry, and the rustup toolchain.
export RUSTFLAGS="--remap-path-prefix=$PWD=. \
--remap-path-prefix=$HOME/.cargo/registry=/cargo/registry \
--remap-path-prefix=$HOME/.rustup=/rustup"

# Build the wasm package
wasm-pack build --target web --out-dir ../wasm

# Clean up gitignore file created by wasm-pack
rm ../wasm/.gitignore
