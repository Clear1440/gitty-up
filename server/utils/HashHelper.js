import { createHash } from 'node:crypto';

/** Hashes for telling values apart. None of these are for passwords or secrets. */
export class HashHelper {
  /** The SHA-256 of a string, as 64 lowercase hex characters. */
  static sha256(value) {
    return createHash('sha256').update(value).digest('hex');
  }
}
