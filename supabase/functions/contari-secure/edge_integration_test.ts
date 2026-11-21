import { assertEquals, assert } from "jsr:@std/assert@1.0.14";
import { RistrettoPoint } from "npm:@noble/curves@1.9.7/ed25519";
import { blake2b } from "npm:@noble/hashes@1.8.0/blake2b";
import { bech32m } from "npm:bech32@2.0.0";

const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const enc = new TextEncoder();
const network = "esmeralda";
const networkByte = 38;
function randomScalar() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  const scalar = n % L;
  return scalar === 0n ? 1n : scalar;
}
function leNumber(bytes: Uint8Array) {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  return n;
}
function leBytes(value: bigint) {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) { out[i] = Number(value & 255n); value >>= 8n; }
  return out;
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
  const input = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { input.set(part, offset); offset += part.length; }
  return blake2b(input, { dkLen: 64 });
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
function b64url(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function makeWallet() {
  const secret = randomScalar();
  const owner = RistrettoPoint.BASE.multiply(secret).toRawBytes();
  const view = RistrettoPoint.BASE.multiply(randomScalar()).toRawBytes();
  const address = bech32m.encode("otl_esm_", bech32m.toWords(new Uint8Array([...owner, ...view])));
  return { secret, address };
}
function signChallenge(secret: bigint, address: string, challenge: string) {
  const owner = RistrettoPoint.BASE.multiply(secret).toRawBytes();
  const nonceSecret = randomScalar();
  const nonce = RistrettoPoint.BASE.multiply(nonceSecret).toRawBytes();
  const message = domainHash("com.tari.paylink.wallet_ownership_proof.v1.v1", [
    Uint8Array.of(networkByte), enc.encode(address), enc.encode(challenge),
  ]);
  const challengeScalar = leNumber(domainHash("com.tari.schnorr_signature.v1.challenge", [
    nonce, owner, message,
  ])) % L;
  const signature = leBytes((nonceSecret + challengeScalar * secret) % L);
  return { signature: hex(signature), publicNonce: hex(nonce) };
}
const baseUrl = Deno.env.get("CONTARI_SUPABASE_URL");
const apiKey = Deno.env.get("CONTARI_SUPABASE_PUBLISHABLE_KEY");

async function call(body: Record<string, unknown>) {
  if (!baseUrl || !apiKey) throw new Error("Set CONTARI_SUPABASE_URL and CONTARI_SUPABASE_PUBLISHABLE_KEY in the CI job.");
  const response = await fetch(baseUrl.replace(/\/$/, "") + "/functions/v1/contari-secure", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey, Authorization: "Bearer " + apiKey },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data };
}
async function challenge(wallet: ReturnType<typeof makeWallet>, lockerId: string, purpose: "create" | "unlock") {
  const result = await call({ action: "challenge", lockerId, purpose, walletAddress: wallet.address, network });
  assertEquals(result.status, 200, JSON.stringify(result.data));
  return result.data as { id: string; challenge: string };
}

Deno.test("deployed secure service wraps keys and releases only to signed allowlisted wallets", async () => {
  const creator = makeWallet();
  const recipient = makeWallet();
  const outsider = makeWallet();
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    enc.encode("Contari secure edge integration test"),
  ));
  const lockerKey = b64url(rawKey);
  const createChallenge = await challenge(creator, id, "create");
  const createProof = signChallenge(creator.secret, creator.address, createChallenge.challenge);
  const created = await call({
    action: "create",
    challengeId: createChallenge.id,
    walletAddress: creator.address,
    network,
    ...createProof,
    id,
    title: "CI secure-key test",
    description: "Automated integration test",
    ciphertext: b64url(ciphertext),
    iv: b64url(iv),
    gate: "allowlist",
    allowedWallets: [recipient.address],
    key: lockerKey,
  });
  assertEquals(created.status, 201, JSON.stringify(created.data));

  const outsiderChallenge = await challenge(outsider, id, "unlock");
  const outsiderProof = signChallenge(outsider.secret, outsider.address, outsiderChallenge.challenge);
  const denied = await call({
    action: "unlock", challengeId: outsiderChallenge.id, lockerId: id,
    walletAddress: outsider.address, network, ...outsiderProof,
  });
  assertEquals(denied.status, 400, JSON.stringify(denied.data));
  assert(String(denied.data.error).includes("not allowed"));

  const recipientChallenge = await challenge(recipient, id, "unlock");
  const recipientProof = signChallenge(recipient.secret, recipient.address, recipientChallenge.challenge);
  const opened = await call({
    action: "unlock", challengeId: recipientChallenge.id, lockerId: id,
    walletAddress: recipient.address, network, ...recipientProof,
  });
  assertEquals(opened.status, 200, JSON.stringify(opened.data));
  assertEquals(opened.data.key, lockerKey);
});
