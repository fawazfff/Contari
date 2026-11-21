import { supabase } from "./supabase";
import { signTariChallenge, type WalletSession } from "./tari";

export type Locker = {
  id: string;
  title: string;
  description: string;
  ciphertext: string;
  iv: string;
  createdAt: string;
  creator: string;
  creatorNetwork?: string;
  keyVersion?: number;
  ootleComponentAddress?: string;
  gate: "wallet" | "allowlist";
  allowedWallets: string[];
  claims: Array<{ address: string; at: string; proof: string }>;
};

type LockerRow = {
  id: string;
  title: string;
  description: string;
  ciphertext: string;
  iv: string;
  gate: "wallet" | "allowlist";
  allowed_wallets: string[];
  creator_wallet: string;
  creator_network?: string;
  key_version?: number;
  ootle_component_address?: string | null;
  created_at: string;
};

async function invokeSecure(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("contari-secure", { body });
  if (error) {
    let message = error.message || "Secure locker request failed.";
    const context = (error as { context?: unknown }).context;
    if (context && typeof (context as Response).clone === "function") {
      const payload = await (context as Response).clone().json().catch(() => null) as { error?: string } | null;
      if (payload?.error) message = payload.error;
    }
    throw new Error(message);
  }
  return data as Record<string, any> | null;
}

const KEY = "contari_lockers_v1";

function toLocker(row: LockerRow, claims: Locker["claims"] = []): Locker {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    ciphertext: row.ciphertext,
    iv: row.iv,
    createdAt: row.created_at,
    creator: row.creator_wallet,
    creatorNetwork: row.creator_network,
    keyVersion: row.key_version ?? 1,
    ootleComponentAddress: row.ootle_component_address || undefined,
    gate: row.gate,
    allowedWallets: row.allowed_wallets || [],
    claims,
  };
}

export function readLockers(): Locker[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as Locker[]; }
  catch { return []; }
}

function writeLocal(lockers: Locker[]) {
  localStorage.setItem(KEY, JSON.stringify(lockers));
}

export function saveLocker(locker: Locker) {
  const all = readLockers();
  writeLocal([locker, ...all.filter(item => item.id !== locker.id)]);
}

export function updateLocker(id: string, update: (locker: Locker) => Locker) {
  writeLocal(readLockers().map(item => item.id === id ? update(item) : item));
}

export function getLocker(id: string) {
  return readLockers().find(item => item.id === id);
}

export async function loadLocker(id: string): Promise<Locker | undefined> {
  const data = await invokeSecure({ action: "read", lockerId: id });
  if (!data?.locker) return getLocker(id);
  const locker = toLocker(data.locker as LockerRow);
  saveLocker(locker);
  return locker;
}

export async function loadMyLockers(session: WalletSession): Promise<Locker[]> {
  const challenge = await requestWalletChallenge("workspace", "list", session);
  const proof = await signTariChallenge(session, challenge.challenge);
  const data = await invokeSecure({
    action: "list", lockerId: "workspace", challengeId: challenge.id,
    walletAddress: session.address, network: session.network,
    signature: proof.signature, publicNonce: proof.publicNonce,
  });
  const lockers = Array.isArray(data?.lockers)
    ? data.lockers.map((row: LockerRow) => toLocker(row))
    : [];
  writeLocal(lockers);
  return lockers;
}

export async function createSecureLocker(locker: Locker, key: string, session: WalletSession, componentAddress?: string) {
  const challenge = await requestWalletChallenge(locker.id, "create", session);
  const proof = await signTariChallenge(session, challenge.challenge);
  await invokeSecure({
    action: "create", challengeId: challenge.id, walletAddress: session.address,
    network: session.network, signature: proof.signature, publicNonce: proof.publicNonce,
    id: locker.id, title: locker.title, description: locker.description,
    ciphertext: locker.ciphertext, iv: locker.iv, gate: locker.gate,
    allowedWallets: locker.allowedWallets, key, componentAddress: componentAddress || null,
  });
  saveLocker({ ...locker, creatorNetwork: session.network, keyVersion: 2, ootleComponentAddress: componentAddress || undefined });
}
async function requestWalletChallenge(lockerId: string, purpose: "create" | "unlock" | "list", session: WalletSession) {
  const data = await invokeSecure({
    action: "challenge", lockerId, purpose, walletAddress: session.address, network: session.network,
  });
  if (!data?.id || !data?.challenge) throw new Error("The secure service returned an invalid wallet challenge.");
  return data as { id: string; challenge: string; expires_at: string };
}
export async function unlockSecureLocker(lockerId: string, session: WalletSession, transactionId?: string) {
  const challenge = await requestWalletChallenge(lockerId, "unlock", session);
  const proof = await signTariChallenge(session, challenge.challenge);
  const data = await invokeSecure({
    action: "unlock", challengeId: challenge.id, lockerId,
    walletAddress: session.address, network: session.network, transactionId: transactionId || null,
    signature: proof.signature, publicNonce: proof.publicNonce,
  });
  if (typeof data?.key !== "string" || !data.key) throw new Error("The server did not release the locker key.");
  return data.key as string;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function encryptContent(content: string) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(content));
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv), key: toBase64(rawKey) };
}

export async function decryptContent(ciphertext: string, iv: string, keyValue: string) {
  const key = await crypto.subtle.importKey("raw", fromBase64(keyValue), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(ciphertext));
  return new TextDecoder().decode(plain);
}
