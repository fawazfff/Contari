import { RistrettoPoint } from "npm:@noble/curves@1.9.7/ed25519";
import { blake2b } from "npm:@noble/hashes@1.8.0/blake2b";
import { bech32m } from "npm:bech32@2.0.0";

const networks: Record<string, number> = {
  mainnet: 0, "tari-mainnet": 0, localnet: 16, local: 16,
  igor: 36, esmeralda: 38, esme: 38,
};
const hrps: Record<number, string> = { 0: "otl_", 16: "otl_loc_", 36: "otl_igr_", 38: "otl_esm_" };
const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const enc = new TextEncoder();

export function bytesFromHex(value: unknown, expected: number) {
  if (typeof value !== "string") throw new Error("Wallet proof is missing its cryptographic fields.");
  const normalized = value.replace(/^0x/i, "");
  if (!new RegExp("^[0-9a-fA-F]{" + expected * 2 + "}$").test(normalized)) {
    throw new Error("The Tari wallet returned an unsupported proof format. Expected hexadecimal proof fields.");
  }
  return Uint8Array.from(normalized.match(/../g)!, (v) => parseInt(v, 16));
}
function leNumber(bytes: Uint8Array) {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  return n;
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
  const total = parts.reduce((n, p) => n + p.length, 0);
  const input = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { input.set(part, offset); offset += part.length; }
  return blake2b(input, { dkLen: 64 });
}
export function networkByte(value: unknown) {
  if (typeof value !== "string" || networks[value.trim().toLowerCase()] === undefined) {
    throw new Error("This Tari wallet network is not supported by Contari.");
  }
  return networks[value.trim().toLowerCase()];
}
export function parseAddress(address: string, network: number) {
  const expected = hrps[network];
  if (!expected || address.length > 128 || address !== address.toLowerCase()) {
    throw new Error("Invalid or unsupported Tari Ootle address.");
  }
  const decoded = bech32m.decode(address, 128);
  if (decoded.prefix !== expected) throw new Error("Wallet address and active network do not match.");
  const data = Uint8Array.from(bech32m.fromWords(decoded.words));
  if (data.length !== 64) throw new Error("Malformed Tari Ootle wallet address.");
  const canonical = bech32m.encode(expected, bech32m.toWords(data));
  if (canonical !== address) throw new Error("Wallet address is not canonical.");
  const ownerBytes = data.slice(0, 32);
  const viewBytes = data.slice(32);
  if (RistrettoPoint.fromHex(ownerBytes).equals(RistrettoPoint.ZERO) ||
      RistrettoPoint.fromHex(viewBytes).equals(RistrettoPoint.ZERO)) {
    throw new Error("Tari Ootle address contains an invalid public key.");
  }
  return ownerBytes;
}
export function verifyTariWalletProof(input: {
  address: string; network: number; challenge: string;
  signature: unknown; publicNonce: unknown;
}) {
  if (!input.challenge || !/^[\x20-\x7e]{1,500}$/.test(input.challenge)) {
    throw new Error("Invalid wallet challenge.");
  }
  const owner = parseAddress(input.address, input.network);
  const nonceBytes = bytesFromHex(input.publicNonce, 32);
  const scalarBytes = bytesFromHex(input.signature, 32);
  const nonce = RistrettoPoint.fromHex(nonceBytes);
  const publicKey = RistrettoPoint.fromHex(owner);
  const scalar = leNumber(scalarBytes);
  if (scalar >= L) throw new Error("Invalid Tari wallet signature scalar.");
  if (nonce.equals(RistrettoPoint.ZERO) || publicKey.equals(RistrettoPoint.ZERO)) {
    throw new Error("Invalid Tari wallet signature point.");
  }
  const message = domainHash("com.tari.paylink.wallet_ownership_proof.v1.v1", [
    Uint8Array.of(input.network), enc.encode(input.address), enc.encode(input.challenge),
  ]);
  const hash = domainHash("com.tari.schnorr_signature.v1.challenge", [nonceBytes, owner, message]);
  const challengeScalar = leNumber(hash) % L;
  const lhs = RistrettoPoint.BASE.multiply(scalar);
  const rhs = nonce.add(publicKey.multiply(challengeScalar));
  if (!lhs.equals(rhs)) throw new Error("Tari wallet signature could not be verified.");
}
