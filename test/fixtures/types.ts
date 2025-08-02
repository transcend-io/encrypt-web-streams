/** A fixture is a remote resource with a checksum of the unencrypted file */
export interface Fixture {
  encryptedPathname: string;
  unencryptedPathname: string;
  filePrefix: string;
  mimetype: string | undefined;
  encryptedSize: number;
  unencryptedSize: number;
  decryptionOptions: {
    /** Base64-encoded */
    key: string;
    /** Base64-encoded */
    iv: string;
    /** Base64-encoded */
    authTag: string;
  };
  /** The checksum of the unencrypted file. Hex-encoded. */
  unencryptedChecksum: string;
  /** The checksum of the encrypted file. Hex-encoded. */
  encryptedChecksum: string;
}
