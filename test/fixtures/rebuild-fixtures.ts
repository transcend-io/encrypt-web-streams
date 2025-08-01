import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

import mime from 'mime';

import { TEST_ENCRYPTION_IV, TEST_ENCRYPTION_KEY } from './constants.js';
import { generatePatternFile } from './generate-pattern-file.js';

const thisDirname = path.dirname(new URL(import.meta.url).pathname);

/**
 * A fixture is a remote resource with a checksum of the unencrypted file
 */
export interface Fixture {
  url: string;
  filePrefix: string;
  mimetype: string | undefined;
  size: number;
  decryptionOptions: {
    /** base64-encoded */
    key: string;
    /** base64-encoded */
    iv: string;
    /** base64-encoded */
    authTag: string;
  };
  /** The checksum of the unencrypted file */
  unencryptedChecksum: string;
}

/** We can't check these into git, so we generate them here. */
const bigGeneratedFiles: {
  filename: `big${number}${'MB' | 'GB'}.dat`;
  size: number;
  seed: string;
}[] = [
  {
    filename: 'big800MB.dat',
    size: 800 * 1024 * 1024,
    seed: 'foo',
  },
  // // Uncomment this to test a 6GB file
  // {
  //   filename: 'big6GB.dat',
  //   size: 6 * 1024 * 1024 * 1024,
  //   seed: 'bar',
  // },
];

/**
 * Rebuild the files.js file to use the local server.
 */
async function main(): Promise<void> {
  // Generate the big files that aren't checked into git
  console.group("Generating big files that aren't checked into git");
  for (const bigGeneratedFile of bigGeneratedFiles) {
    const filePath = path.join(
      thisDirname,
      '/files/unencrypted',
      bigGeneratedFile.filename,
    );
    await generatePatternFile(
      filePath,
      bigGeneratedFile.size,
      bigGeneratedFile.seed,
    );
  }
  console.groupEnd();

  // Build fixtures
  let fixtures: Fixture[] = [];
  const directory = await readdir(path.join(thisDirname, '/files/unencrypted'));

  // Clear out encrypted folder
  await rm(path.join(thisDirname, '/files/encrypted'), {
    recursive: true,
    force: true,
  });
  await mkdir(path.join(thisDirname, '/files/encrypted'), {
    recursive: true,
  });

  console.group(
    '\nBuilding fixtures by encrypting the files in /files/unencrypted',
  );
  // Loop through all fixtures
  for (const file of directory) {
    console.debug(`Generating fixture for ${file} ...`);
    const filePrefix = path.basename(file, path.extname(file));
    const encryptedFilePathname = `/files/encrypted/${file}.enc`;

    // Write an encrypted file
    const content = createReadStream(
      path.join(thisDirname, '/files/unencrypted', file),
    );
    const cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(TEST_ENCRYPTION_KEY, 'base64'),
      Buffer.from(TEST_ENCRYPTION_IV, 'base64'), // OK to reuse IV for testing since key is already public.
    );
    const writeStream = createWriteStream(
      path.join(thisDirname, encryptedFilePathname),
    );
    await pipeline(content, cipher, writeStream);

    // Get the file size of the encrypted file
    const encryptedFilePath = path.join(thisDirname, encryptedFilePathname);
    const encryptedFileStats = await stat(encryptedFilePath);
    const encryptedFileSize = encryptedFileStats.size;

    // Create a checksum of the unencrypted file
    const unencryptedChecksum = await new Promise<string>((resolve, reject) => {
      const content = createReadStream(
        path.join(thisDirname, '/files/unencrypted', file),
      );
      const hash = createHash('sha256');
      content.on('data', (chunk) => {
        hash.update(chunk);
      });
      content.on('end', () => {
        const unencryptedChecksum = hash.digest('hex');
        resolve(unencryptedChecksum);
      });
      content.on('error', reject);
    });

    fixtures.push({
      url: encryptedFilePathname,
      filePrefix,
      mimetype: mime.getType(file) ?? undefined,
      size: encryptedFileSize,
      decryptionOptions: {
        key: TEST_ENCRYPTION_KEY,
        iv: TEST_ENCRYPTION_IV,
        authTag: cipher.getAuthTag().toString('base64'),
      },
      unencryptedChecksum,
    });
  }
  console.groupEnd();

  // Sort by file size (ascending)
  fixtures = fixtures.sort((a, b) => a.size - b.size);

  await writeFile(
    path.join(thisDirname, 'files/fixtures.json'),
    JSON.stringify(fixtures, undefined, 2),
  );
  console.debug('✅ Done!');
}

await main();
