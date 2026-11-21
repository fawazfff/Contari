import { assertThrows } from "jsr:@std/assert@1.0.14";
import { RistrettoPoint } from "npm:@noble/curves@1.9.7/ed25519";
import { blake2b } from "npm:@noble/hashes@1.8.0/blake2b";
import { bech32m } from "npm:bech32@2.0.0";
import { networkByte, verifyTariWalletProof } from "./crypto.ts";

const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const enc = new TextEncoder();
function leBytes(value: bigint) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) { bytes[i] = Number(value & 255n); value >>= 8n; }
  return bytes;
}
function leNumber(bytes: Uint8Array) {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  return n;
}
function randomScalar() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  const scalar = n % L;
  return scalar === 0n ? 1n : scalar;
}
function u64le(value: number) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
}
function domainHash(tag: string, fields: Uint8Array[]) {
  const tagBytes = enc.encode(tag);
  const parts: Uint8Array[] = [u64le(tagBytes.length), tagBytes];
  for (const field of fields) parts.push(u64le(field.length), field);
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { all.set(part, offset); offset += part.length; }
  return blake2b(all, { dkLen: 64 });
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
function makeFixture() {
  const network = networkByte("esmeralda");
  const secret = randomScalar();
  const nonceSecret = randomScalar();
  const owner = RistrettoPoint.BASE.multiply(secret).toRawBytes();
  const view = RistrettoPoint.BASE.multiply(randomScalar()).toRawBytes();
  const address = bech32m.encode("otl_esm_", bech32m.toWords(new Uint8Array([...owner, ...view])), 128);
  const challenge = "contari:unlock:123456abcdef:fixture";
  const nonce = RistrettoPoint.BASE.multiply(nonceSecret).toRawBytes();
  const message = domainHash("com.tari.paylink.wallet_ownership_proof.v1.v1", [
    Uint8Array.of(network), enc.encode(address), enc.encode(challenge),
  ]);
  const challengeScalar = leNumber(domainHash("com.tari.schnorr_signature.v1.challenge", [
    nonce, owner, message,
  ])) % L;
  const signature = leBytes((nonceSecret + challengeScalar * secret) % L);
  return { address, network, challenge, signature: hex(signature), publicNonce: hex(nonce) };
}

Deno.test("accepts a valid Tari wallet ownership proof", () => {
  const proof = makeFixture();
  verifyTariWalletProof(proof);
});

Deno.test("rejects a proof replayed against a different challenge", () => {
  const proof = makeFixture();
  assertThrows(() => verifyTariWalletProof({ ...proof, challenge: proof.challenge + ":changed" }));
});

Deno.test("rejects a signature with a modified scalar", () => {
  const proof = makeFixture();
  const changed = new Uint8Array(32);
  changed[0] = (parseInt(proof.signature.slice(0, 2), 16) + 1) & 255;
  assertThrows(() => verifyTariWalletProof({ ...proof, signature: hex(changed) }));
});

Deno.test("rejects a wallet address on a different network", () => {
  const proof = makeFixture();
  assertThrows(() => verifyTariWalletProof({ ...proof, network: 0 }));
});

Deno.test("rejects malformed ownership proof fields", () => {
  const proof = makeFixture();
  assertThrows(() => verifyTariWalletProof({ ...proof, publicNonce: "abcd" }));
});
