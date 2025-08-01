import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createCipheriv, createHash } from 'node:crypto';

/**
 * Generates a file of a specified size with a deterministic pattern based on a
 * seed. It uses a stream cipher to produce a consistent, pseudo-random byte
 * stream from the seed, ensuring that the file content is identical every time
 * for the same seed.
 *
 * @param filePath The full path for the file to be created.
 * @param sizeInBytes The desired file size in bytes.
 * @param seed A string used to generate the deterministic pattern.
 */
export async function generatePatternFile(
  filePath: string,
  sizeInBytes: number,
  seed: string,
): Promise<void> {
  if (sizeInBytes < 0) {
    throw new Error('File size cannot be negative.');
  }

  // 1. Derive a deterministic key and IV from the seed.
  // Using a hash ensures a fixed-length output for the key and IV.
  const hash = createHash('sha256').update(seed).digest();
  const key = hash.subarray(0, 32); // Use the full 32 bytes for an AES-256 key.
  const iv = hash.subarray(0, 16); // Use the first 16 bytes for the IV.

  // 2. Create the stream cipher. AES in Counter (CTR) mode is a good choice.
  // It will always produce the same byte stream for a given key and IV.
  const cipher = createCipheriv('aes-256-ctr', key, iv);

  let fileHandle;
  try {
    const directory = path.dirname(filePath);
    await fs.mkdir(directory, { recursive: true });

    fileHandle = await fs.open(filePath, 'w');

    // 3. Write chunks of the deterministic byte stream to the file.
    const chunkSize = 64 * 1024; // 64KB
    let bytesWritten = 0;

    while (bytesWritten < sizeInBytes) {
      const sizeToWrite = Math.min(chunkSize, sizeInBytes - bytesWritten);
      // Create a buffer of null bytes to "encrypt".
      const nullBuffer = Buffer.alloc(sizeToWrite);
      // The cipher's output is our deterministic pattern.
      const patternedData = cipher.update(nullBuffer);

      await fileHandle.write(patternedData);
      bytesWritten += patternedData.length;
    }

    console.log(
      `Successfully generated deterministic file: ${filePath} (${sizeInBytes.toLocaleString()} bytes)`,
    );
  } catch (error) {
    console.error(`Error generating deterministic file at ${filePath}:`, error);
    throw error;
  } finally {
    await fileHandle?.close();
  }
}
