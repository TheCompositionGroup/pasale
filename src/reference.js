// Short request reference such as PS-7K42M. No 0/O or 1/I/L. A reference is a
// label to quote on the phone, not a record: there is no database to look it up in.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 characters
const LIMIT = 248; // 31 * 8, so every character is equally likely

export function makeReference(cryptoImpl = globalThis.crypto) {
  let out = '';
  while (out.length < 5) {
    for (const b of cryptoImpl.getRandomValues(new Uint8Array(8))) {
      if (b < LIMIT && out.length < 5) out += ALPHABET[b % 31];
    }
  }
  return `PS-${out}`;
}
