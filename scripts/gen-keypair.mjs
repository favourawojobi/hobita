// Generates a Solana-format ed25519 keypair (64-byte secret||public JSON)
// using only Node's built-in crypto, so it works before npm install lands.
// Usage: node scripts/gen-keypair.mjs keys/hobita-devnet.json
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(buf) {
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < buf.length; i += 1) {
    let carry = buf[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]];
  return out;
}

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/gen-keypair.mjs <outfile>");
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const secret = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
const keypair = Buffer.concat([secret, pub]);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(Array.from(keypair)));
console.log(base58(pub));
