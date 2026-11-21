import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.87.1";
import { networkByte, parseAddress, verifyTariWalletProof } from "./crypto.ts";
import { decodeLockerClaimEvent, isCommittedTransactionResult, normalizeTransactionId } from "./ootle_verification.ts";

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

function indexerUrlsFor(network: number): string[] {
  const secret = network === 0 ? "CONTARI_OOTLE_MAINNET_INDEXERS"
    : network === 38 ? "CONTARI_OOTLE_ESMERALDA_INDEXERS" : "";
  if (!secret) return [];
  const urls = (Deno.env.get(secret) || "")
    .split(",").map((value) => value.trim().replace(/\/$/, ""))
    .filter((value) => {
      try { return new URL(value).protocol === "https:"; } catch { return false; }
    });
  // Two URLs on the same host are not independent indexer checks.
  return [...new Map(urls.map((value) => [new URL(value).host, value])).values()];
}
function expectedTemplateAddress(network: number) {
  const name = network === 0 ? "CONTARI_OOTLE_MAINNET_TEMPLATE_ADDRESS"
    : network === 38 ? "CONTARI_OOTLE_ESMERALDA_TEMPLATE_ADDRESS" : "";
  const value = name ? Deno.env.get(name)?.trim() || "" : "";
  if (!value) throw new Error("The trusted Contari template address is not configured for this network. The locker key remains locked.");
  return value;
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}
function normalizeTemplateAddress(value: unknown) {
  if (value instanceof Uint8Array) return hex(value);
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/^template_/, "").replace(/^0x/, "");
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
  expectedTemplate: string,
  expectedLockerHash: string,
  expectedClaimant: string,
) {
  let beforeId: string | undefined;
  for (let page = 0; page < 25; page++) {
    const query = new URLSearchParams({
      topic: "ContariRegistry.LockerClaimed",
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
      if (eventTransactionId !== transactionId || typeof item[1] !== "string") continue;
      try {
        const event = decodeLockerClaimEvent(item[1]);
        if (event.topic !== "ContariRegistry.LockerClaimed") continue;
        if (normalizeTemplateAddress(event.templateAddress) !== expectedTemplate) continue;
        if (typeof event.componentAddress !== "string" ||
            event.componentAddress.toLowerCase() !== componentAddress.toLowerCase()) continue;
        if (typeof event.lockerIdHash !== "string" ||
            event.lockerIdHash.toLowerCase() !== expectedLockerHash.toLowerCase()) continue;
        if (typeof event.claimantKey !== "string" ||
            event.claimantKey.toLowerCase().replace(/^0x/, "") !== expectedClaimant.toLowerCase()) continue;
        return true;
      } catch {
        // Ignore unrelated or malformed events. The key stays locked unless
        // the exact event from the configured template and component is found.
      }
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
  const bases = indexerUrlsFor(network);
  if (bases.length < 2) {
    throw new Error("Two trusted public Ootle indexers are required for this network. The locker key remains locked.");
  }
  const expectedTemplate = normalizeTemplateAddress(expectedTemplateAddress(network));
  if (!/^[0-9a-f]{64}$/.test(expectedTemplate)) {
    throw new Error("The configured Contari template address is invalid. The locker key remains locked.");
  }

  const lockerHashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lockerId)));
  const expectedLockerHash = hex(lockerHashBytes);
  const expectedClaimant = hex(parseAddress(walletAddress, network));

  // Require both independent indexers to agree. A single indexer response is
  // not enough to release a key.
  for (const base of bases.slice(0, 2)) {
    let committed = false;
    let lastError: unknown;
    for (let attempt = 0; attempt < 10 && !committed; attempt++) {
      try {
        const response = await indexerJson(base, "/transactions/" + txId + "/result");
        const result = response?.result ?? response;
        if (result?.Rejected) throw new Error("Ootle rejected the claim transaction.");
        if (result?.Finalized && !isCommittedTransactionResult(response)) {
          throw new Error("Ootle claim did not commit. The locker key remains locked.");
        }
        if (isCommittedTransactionResult(response)) {
          committed = true;
          break;
        }
      } catch (error) {
        if (error instanceof Error && /did not commit|rejected the claim/.test(error.message)) throw error;
        lastError = error;
      }
      if (!committed && attempt < 9) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!committed) {
      throw new Error(lastError instanceof Error
        ? "Could not confirm the Ootle claim with both trusted indexers: " + lastError.message
        : "The Ootle claim is not finalized on both public indexers yet. The locker key remains locked.");
    }
    let eventFound = false;
    for (let attempt = 0; attempt < 10 && !eventFound; attempt++) {
      try {
        eventFound = await indexerHasClaimEvent(
          base, txId, componentAddress, expectedTemplate, expectedLockerHash, expectedClaimant,
        );
      } catch (error) {
        lastError = error;
      }
      if (!eventFound && attempt < 9) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!eventFound) {
      throw new Error(lastError instanceof Error
        ? "The claim was finalized, but the expected Contari event could not be verified: " + lastError.message
        : "The claim was finalized, but the expected Contari event from this template and component was not found. The locker key remains locked.");
    }
  }
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
  const lockerNetwork = networkByte(body.network);
  if (body.componentAddress !== null && body.componentAddress !== undefined && body.componentAddress !== "" &&
      (typeof body.componentAddress !== "string" || !/^component_[0-9a-f]{64}$/i.test(body.componentAddress))) {
    throw new Error("The Ootle registry component address is invalid.");
  }
  if (lockerNetwork === 0 && !body.componentAddress) {
    throw new Error("Mainnet lockers must be registered with a Contari Ootle component. Configure the component address before creating this locker.");
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
      if (!["create", "unlock", "list"].includes(body.purpose)) throw new Error("Invalid wallet challenge purpose.");
      const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
      const { count, error: rateError } = await db.from("contari_auth_challenges").select("id", { count: "exact", head: true })
        .eq("wallet_address", body.walletAddress).gte("created_at", cutoff);
      if (rateError) throw rateError;
      if ((count ?? 0) >= 10) throw new Error("Too many wallet challenges. Wait a few minutes and try again.");
      if (body.purpose === "list" && body.lockerId !== "workspace") throw new Error("Invalid workspace challenge.");
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
    if (body.action === "read") {
      if (!validId(body.lockerId)) throw new Error("Invalid locker ID.");
      const { data, error } = await db.from("contari_lockers")
        .select("id,title,description,ciphertext,iv,gate,creator_wallet,creator_network,key_version,ootle_component_address,created_at")
        .eq("id", body.lockerId).maybeSingle();
      if (error) throw error;
      return json(200, { locker: data });
    }
    if (body.action === "list") {
      if (body.lockerId !== "workspace") throw new Error("Invalid workspace request.");
      const { network } = await consumeChallenge(db, body, "list");
      const { data, error } = await db.from("contari_lockers")
        .select("id,title,description,ciphertext,iv,gate,allowed_wallets,creator_wallet,creator_network,key_version,ootle_component_address,created_at")
        .eq("creator_wallet", body.walletAddress)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return json(200, { lockers: data || [] });
    }
    if (body.action === "create") {
      validateLocker(body);
      const { network } = await consumeChallenge(db, body, "create");
      if (network === 0 && !body.componentAddress) {
        throw new Error("Mainnet lockers must be registered with a deployed Contari Ootle component before a key can be stored.");
      }
      if (body.componentAddress) {
        const configuredIndexers = indexerUrlsFor(network);
        if (configuredIndexers.length < 2) {
          throw new Error("Configure two trusted HTTPS Ootle indexers for this network before creating a contract-gated locker.");
        }
        const configuredTemplate = normalizeTemplateAddress(expectedTemplateAddress(network));
        if (!/^[0-9a-f]{64}$/.test(configuredTemplate)) {
          throw new Error("Configure the published Contari template address for this network before creating a contract-gated locker.");
        }
      }
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
      if (network === 0 && !locker.ootle_component_address) throw new Error("This mainnet locker has no Ootle registry component configured. The key remains locked.");
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
