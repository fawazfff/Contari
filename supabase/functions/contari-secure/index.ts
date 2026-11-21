import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.87.1";
import { networkByte, parseAddress, verifyTariWalletProof } from "./crypto.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store, private",
  "Pragma": "no-cache",
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function b64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function fromB64url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Malformed encryption key.");
  const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function getService() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Secure storage service is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function getMasterKey(db: ReturnType<typeof createClient>) {
  const { data, error } = await db.rpc("contari_get_master_key");
  if (error || typeof data !== "string") throw new Error("Server-side locker encryption key is unavailable.");
  const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("Server-side locker encryption key is invalid.");
  try {
    return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
  }
}
async function wrapKey(db: ReturnType<typeof createClient>, keyValue: string) {
  const raw = fromB64url(keyValue);
  if (raw.length !== 32) throw new Error("The locker encryption key must be 256 bits.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getMasterKey(db), raw);
    return { wrapped_key: b64url(new Uint8Array(encrypted)), wrap_iv: b64url(iv) };
  } finally {
    raw.fill(0);
  }
}
async function unwrapKey(db: ReturnType<typeof createClient>, row: { wrapped_key: string; wrap_iv: string }) {
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64url(row.wrap_iv) },
    await getMasterKey(db),
    fromB64url(row.wrapped_key),
  );
  const bytes = new Uint8Array(raw);
  const encoded = b64url(bytes);
  bytes.fill(0);
  return encoded;
}
async function consumeChallenge(db: ReturnType<typeof createClient>, body: any, purpose: string) {
  const { data, error } = await db.from("contari_auth_challenges").select("*")
    .eq("id", body.challengeId).eq("purpose", purpose).eq("wallet_address", body.walletAddress)
    .is("used_at", null).gt("expires_at", new Date().toISOString()).single();
  if (error || !data) throw new Error("This wallet challenge expired or has already been used. Request a new one.");
  const network = networkByte(body.network);
  verifyTariWalletProof({
    address: body.walletAddress, network, challenge: data.challenge,
    signature: body.signature, publicNonce: body.publicNonce,
  });
  const { data: consumed, error: consumeError } = await db.from("contari_auth_challenges")
    .update({ used_at: new Date().toISOString() }).eq("id", data.id).is("used_at", null).select("id").maybeSingle();
  if (consumeError || !consumed) throw new Error("This wallet challenge has already been used.");
  return { network, challenge: data };
}
function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,32}$/.test(value);
}
function validateLocker(body: any) {
  if (!validId(body.id)) throw new Error("Invalid locker ID.");
  if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 80) throw new Error("Locker title must be 1 to 80 characters.");
  if (typeof body.description !== "string" || body.description.length > 160) throw new Error("Description is too long.");
  if (typeof body.ciphertext !== "string" || body.ciphertext.length < 24 || body.ciphertext.length > 2_000_000) throw new Error("Invalid encrypted content.");
  if (typeof body.iv !== "string" || body.iv.length > 128) throw new Error("Invalid encryption IV.");
  if (body.gate !== "wallet" && body.gate !== "allowlist") throw new Error("Invalid access rule.");
  if (!Array.isArray(body.allowedWallets) || body.allowedWallets.length > 100) throw new Error("Invalid wallet allowlist.");
  if (body.gate === "allowlist" && body.allowedWallets.length === 0) throw new Error("Add at least one allowed wallet.");
  if (body.gate === "wallet" && body.allowedWallets.length) throw new Error("Remove the allowlist or choose selected wallets.");
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST required." });
  try {
    const body = await req.json();
    const db = await getService();
    if (body.action === "challenge") {
      const network = networkByte(body.network);
      parseAddress(body.walletAddress, network);
      if (!validId(body.lockerId)) throw new Error("Invalid locker ID.");
      if (!["create", "unlock"].includes(body.purpose)) throw new Error("Invalid wallet challenge purpose.");
      const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
      const { count, error: rateError } = await db.from("contari_auth_challenges").select("id", { count: "exact", head: true })
        .eq("wallet_address", body.walletAddress).gte("created_at", cutoff);
      if (rateError) throw rateError;
      if ((count ?? 0) >= 10) throw new Error("Too many wallet challenges. Wait a few minutes and try again.");
      if (body.purpose === "unlock") {
        const { data: locker, error } = await db.from("contari_lockers").select("id,key_version")
          .eq("id", body.lockerId).single();
        if (error || !locker || locker.key_version !== 2) throw new Error("This locker uses an older link format or does not exist. Ask its creator to create a new locker.");
      }
      const challenge = "contari:" + body.purpose + ":" + body.lockerId + ":" + crypto.randomUUID() + ":" + Date.now();
      const { data, error } = await db.from("contari_auth_challenges").insert({
        locker_id: body.lockerId, purpose: body.purpose, wallet_address: body.walletAddress,
        challenge, expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      }).select("id,challenge,expires_at").single();
      if (error) throw error;
      return json(200, data);
    }
    if (body.action === "create") {
      validateLocker(body);
      const { network } = await consumeChallenge(db, body, "create");
      const allowed = body.allowedWallets.map((address: unknown) => {
        if (typeof address !== "string") throw new Error("Invalid allowlist address.");
        parseAddress(address, network);
        return address;
      });
      const vault = await wrapKey(db, body.key);
      const { error: lockerError } = await db.from("contari_lockers").insert({
        id: body.id, owner_id: null, title: body.title.trim(), description: body.description,
        ciphertext: body.ciphertext, iv: body.iv, gate: body.gate, allowed_wallets: allowed,
        creator_wallet: body.walletAddress, creator_network: String(body.network).trim().toLowerCase(), key_version: 2,
      });
      if (lockerError) throw lockerError;
      const { error: vaultError } = await db.from("contari_key_vault").insert({
        locker_id: body.id, ...vault, key_version: 1,
      });
      if (vaultError) {
        await db.from("contari_lockers").delete().eq("id", body.id);
        throw vaultError;
      }
      return json(201, { id: body.id, created: true });
    }
    if (body.action === "unlock") {
      if (!validId(body.lockerId)) throw new Error("Invalid locker ID.");
      const { network } = await consumeChallenge(db, body, "unlock");
      const { data: locker, error } = await db.from("contari_lockers")
        .select("id,gate,allowed_wallets,creator_wallet,creator_network,key_version")
        .eq("id", body.lockerId).single();
      if (error || !locker || locker.key_version !== 2) throw new Error("Secure locker not found. Older lockers must be recreated.");
      if (locker.creator_network !== String(body.network).trim().toLowerCase()) throw new Error("This wallet is on a different Tari network from the locker.");
      const isCreator = locker.creator_wallet.toLowerCase() === body.walletAddress.toLowerCase();
      const isAllowed = locker.gate === "wallet" ||
        (Array.isArray(locker.allowed_wallets) && locker.allowed_wallets.some((a: string) => a.toLowerCase() === body.walletAddress.toLowerCase()));
      if (!isCreator && !isAllowed) throw new Error("This Tari wallet is not allowed to open this locker.");
      const { data: vault, error: vaultError } = await db.from("contari_key_vault")
        .select("wrapped_key,wrap_iv").eq("locker_id", body.lockerId).single();
      if (vaultError || !vault) throw new Error("The locker key is unavailable.");
      const key = await unwrapKey(db, vault);
      return json(200, { key });
    }
    return json(400, { error: "Unknown secure locker action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Secure locker request failed.";
    return json(400, { error: message });
  }
});
