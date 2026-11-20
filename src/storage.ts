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

const KEY = "contari_lockers_v1";

export function readLockers(): Locker[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as Locker[]; }
  catch { return []; }
}

export function saveLocker(locker: Locker) {
  const all = readLockers();
  localStorage.setItem(KEY, JSON.stringify([locker, ...all.filter(item => item.id !== locker.id)]));
}

export function updateLocker(id: string, update: (locker: Locker) => Locker) {
  localStorage.setItem(KEY, JSON.stringify(readLockers().map(item => item.id === id ? update(item) : item)));
}

export function removeLocker(id: string) {
  localStorage.setItem(KEY, JSON.stringify(readLockers().filter(item => item.id !== id)));
}

export function getLocker(id: string) {
  return readLockers().find(item => item.id === id);
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