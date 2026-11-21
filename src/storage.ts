import { supabase } from "./supabase";

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
  created_at: string;
};

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

export function removeLocker(id: string) {
  writeLocal(readLockers().filter(item => item.id !== id));
}

export function getLocker(id: string) {
  return readLockers().find(item => item.id === id);
}

export async function loadLocker(id: string): Promise<Locker | undefined> {
  const { data, error } = await supabase
    .from("contari_lockers")
    .select("id,title,description,ciphertext,iv,gate,allowed_wallets,creator_wallet,creator_network,key_version,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return getLocker(id);
  const locker = toLocker(data as LockerRow);
  saveLocker(locker);
  return locker;
}

export async function loadMyLockers(walletAddress: string): Promise<Locker[]> {
  const address = walletAddress.trim();
  if (!address) return [];
  const { data, error } = await supabase
    .from("contari_lockers")
    .select("id,title,description,ciphertext,iv,gate,allowed_wallets,creator_wallet,created_at")
    .eq("creator_wallet", address)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const lockers = (data || []).map((row: LockerRow) => toLocker(row));
  writeLocal(lockers);
  return lockers;
}

export async function createSecureLocker(locker: Locker, key: string, session: import("./tari").WalletSession) {
  const challenge = await requestWalletChallenge(locker.id, "create", session);
  const proof = await import("./tari").then(({ signTariChallenge }) => signTariChallenge(session, challenge.challenge));
  const { data, error } = await supabase.functions.invoke("contari-secure", {
    body: {
      action: "create", challengeId: challenge.id, walletAddress: session.address,
      network: session.network, signature: proof.signature, publicNonce: proof.publicNonce,
      id: locker.id, title: locker.title, description: locker.description,
      ciphertext: locker.ciphertext, iv: locker.iv, gate: locker.gate,
      allowedWallets: locker.allowedWallets, key,
    },
  });
  if (error) throw new Error(data?.error || error.message || "Secure locker creation failed.");
  saveLocker({ ...locker, creatorNetwork: session.network, keyVersion: 2 });
}
async function requestWalletChallenge(lockerId: string, purpose: "create" | "unlock", session: import("./tari").WalletSession) {
  const { data, error } = await supabase.functions.invoke("contari-secure", {
    body: { action: "challenge", lockerId, purpose, walletAddress: session.address, network: session.network },
  });
  if (error || !data?.id || !data?.challenge) throw new Error(data?.error || error?.message || "Could not request a secure wallet challenge.");
  return data as { id: string; challenge: string; expires_at: string };
}
export async function unlockSecureLocker(lockerId: string, session: import("./tari").WalletSession) {
  const challenge = await requestWalletChallenge(lockerId, "unlock", session);
  const proof = await import("./tari").then(({ signTariChallenge }) => signTariChallenge(session, challenge.challenge));
  const { data, error } = await supabase.functions.invoke("contari-secure", {
    body: {
      action: "unlock", challengeId: challenge.id, lockerId,
      walletAddress: session.address, network: session.network,
      signature: proof.signature, publicNonce: proof.publicNonce,
    },
  });
  if (error || !data?.key) throw new Error(data?.error || error?.message || "The server did not release the locker key.");
  return data.key as string;
}

export async function deleteRemoteLocker(id: string) {
  const { error } = await supabase.from("contari_lockers").delete().eq("id", id);
  if (error) throw error;
  removeLocker(id);
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
