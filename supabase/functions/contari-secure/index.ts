import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.87.1";
import { networkByte, parseAddress, verifyTariWalletProof } from "./crypto.ts";
import { matchesLockerClaimEvent, normalizeTransactionId } from "./ootle_verification.ts";

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

const indexerUrls: Record<number, string[]> = {
  0: ["https://indexer-a.ootle.tari.com", "https://indexer-b.ootle.tari.com"],
  38: ["https://esme-indexer-a.ootle.com", "https://esme-indexer-b.ootle.com"],
};
function hex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}
async function indexerJson(base: string, path: string) {
  const response = await fetch(base + path, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(7000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Tari indexer returned HTTP " + response.status + ".");
  return await response.json();
}
async function indexerHasClaimEvent(
  base: string,
  transactionId: string,
  componentAddress: string,
  expectedLockerHash: string,
  expectedClaimant: string,
) {
  let beforeId: string | undefined;
  for (let page = 0; page < 4; page++) {
    const query = new URLSearchParams({
      topic: "LockerClaimed",
      substate_id: componentAddress,
      limit: "100",
      offset: "0",
    });
    if (beforeId) query.set("before_id", beforeId);
    const result = await indexerJson(base, "/transactions/events?" + query.toString());
    const events = Array.isArray(result?.events) ? result.events : [];
    for (const item of events) {
      if (!Array.isArray(item) || item.length < 2) continue;
      let eventTransactionId = "";
      try { eventTransactionId = normalizeTransactionId(item[0]); } catch { continue; }
      if (eventTransactionId !== transactionId) continue;
      if (matchesLockerClaimEvent(String(item[1]), expectedLockerHash, expectedClaimant)) return true;
    }
    if (result?.next_before_id === undefined || result?.next_before_id === null) break;
    beforeId = String(result.next_before_id);
  }
  return false;
}
async function verifyOotleClaim(
  network: number,
  transactionIdValue: unknown,
  componentAddress: string,
  lockerId: string,
  walletAddress: string,
) {
  const txId = normalizeTransactionId(transactionIdValue);
  const bases = indexerUrls[network];
  if (!bases?.length) throw new Error("No trusted public Ootle indexer is configured for this network. The locker key remains locked.");
  let committed = false;
  let lastError: unknown;
  for (let attempt = 0; attempt < 10 && !committed; attempt++) {
    for (const base of bases) {
      try {
        const result = await indexerJson(base, "/transactions/" + txId + "/result");
        if (!result) continue;
        if (result.Rejected) throw new Error("Ootle rejected the claim transaction.");
        if (result.Finalized) {
          if (result.Finalized.final_decision !== "Commit") {
            throw new Error("Ootle claim did not commit. The locker key remains locked.");
          }
          committed = true;
          break;
        }
      } catch (error) {
        if (error instanceof Error && /did not commit|rejected the claim/.test(error.message)) throw error;
        lastError = error;
      }
    }
    if (!committed && attempt < 9) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!committed) {
    throw new Error(lastError instanceof Error
      ? "Could not confirm the Ootle claim with a trusted indexer: " + lastError.message
      : "The Ootle claim is not finalized on the public indexer yet. The locker key remains locked.");
  }
  const lockerHashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lockerId)));
  const expectedLockerHash = hex(lockerHashBytes);
  const expectedClaimant = hex(parseAddress(walletAddress, network));
  for (let attempt = 0; attempt < 10; attempt++) {
    for (const base of bases) {
      try {
        if (await indexerHasClaimEvent(base, txId, componentAddress, expectedLockerHash, expectedClaimant)) return;
      } catch (error) {
        lastError = error;
      }
    }
    if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(lastError instanceof Error
    ? "The claim is finalized, but its LockerClaimed event could not be verified: " + lastError.message
    : "The claim is finalized, but the expected LockerClaimed event was not found. The locker key remains locked.");
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
  if (body.componentAddress !== null && body.componentAddress !== undefined && body.componentAddress !== "" &&
      (typeof body.componentAddress !== "string" || !/^component_[0-9a-f]{64}$/i.test(body.componentAddress))) {
    throw new Error("The Ootle registry component address is invalid.");
  }
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
        ootle_component_address: body.componentAddress ? String(body.componentAddress).trim().toLowerCase() : null,
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
        .select("id,gate,allowed_wallets,creator_wallet,creator_network,key_version,ootle_component_address")
        .eq("id", body.lockerId).single();
      if (error || !locker || locker.key_version !== 2) throw new Error("Secure locker not found. Older lockers must be recreated.");
      if (locker.creator_network !== String(body.network).trim().toLowerCase()) throw new Error("This wallet is on a different Tari network from the locker.");
      const isCreator = locker.creator_wallet.toLowerCase() === body.walletAddress.toLowerCase();
      const isAllowed = locker.gate === "wallet" ||
        (Array.isArray(locker.allowed_wallets) && locker.allowed_wallets.some((a: string) => a.toLowerCase() === body.walletAddress.toLowerCase()));
      if (!isCreator && !isAllowed) throw new Error("This Tari wallet is not allowed to open this locker.");
      if (locker.ootle_component_address) {
        if (!body.transactionId) throw new Error("This locker requires an Ootle claim transaction. No key was released.");
        await verifyOotleClaim(network, body.transactionId, locker.ootle_component_address, body.lockerId, body.walletAddress);
      } else if (body.transactionId) {
        throw new Error("This locker was not configured for Ootle claims.");
      }
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
