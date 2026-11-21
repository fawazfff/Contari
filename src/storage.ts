import { supabase } from "./supabase";

export type Locker = {
  id: string;
  title: string;
  description: string;
  ciphertext: string;
  iv: string;
  createdAt: string;
  creator: string;
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
    .select("id,title,description,ciphertext,iv,gate,allowed_wallets,creator_wallet,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return getLocker(id);
  const { data: claimRows, error: claimError } = await supabase
    .from("contari_claims")
    .select("claimant_wallet,created_at,proof")
    .eq("locker_id", id)
    .order("created_at", { ascending: false });
  if (claimError && claimError.code !== "42501") throw claimError;
  const locker = toLocker(data as LockerRow, (claimRows || []).map((claim: any) => ({
    address: claim.claimant_wallet,
    at: claim.created_at,
    proof: JSON.stringify(claim.proof || {}),
  })));
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

export async function createRemoteLocker(locker: Locker) {
  const { error } = await supabase.from("contari_lockers").insert({
    id: locker.id,
    owner_id: null,
    title: locker.title,
    description: locker.description,
    ciphertext: locker.ciphertext,
    iv: locker.iv,
    gate: locker.gate,
    allowed_wallets: locker.allowedWallets,
    creator_wallet: locker.creator,
  });
  if (error) throw error;
  saveLocker(locker);
}

export async function recordRemoteClaim(lockerId: string, address: string, proof: unknown) {
  await ensureContariSession();
  const { error } = await supabase.from("contari_claims").insert({
    locker_id: lockerId,
    claimant_wallet: address,
    proof,
  });
  if (error) throw error;
  updateLocker(lockerId, current => ({
    ...current,
    claims: [{ address, at: new Date().toISOString(), proof: JSON.stringify(proof) }, ...current.claims],
  }));
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
