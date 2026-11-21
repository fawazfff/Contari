import { decode } from "npm:cbor-x@1.6.0";

function unwrapTagged(value: unknown): unknown {
  let current = value;
  for (let i = 0; i < 4; i++) {
    if (!current || typeof current !== "object") break;
    const record = current as Record<string, unknown>;
    if ("tag" in record && "value" in record) current = record.value;
    else break;
  }
  return current;
}
function field(payload: unknown, key: string) {
  const value = unwrapTagged(payload);
  if (value instanceof Map) return value.get(key);
  if (value && typeof value === "object") return (value as Record<string, unknown>)[key];
  return undefined;
}
export function normalizeTransactionId(value: unknown) {
  if (typeof value !== "string") throw new Error("The Tari indexer did not return a transaction ID.");
  const id = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("The Ootle transaction ID has an unsupported format.");
  return id;
}
export function decodeLockerClaimEvent(encodedBase64: string) {
  if (typeof encodedBase64 !== "string" || encodedBase64.length > 100_000) throw new Error("Malformed Ootle claim event.");
  const binary = atob(encodedBase64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const decoded = decode(bytes) as unknown;
  if (!Array.isArray(decoded) || decoded.length < 4) throw new Error("Unexpected Ootle event encoding.");
  return {
    topic: typeof decoded[2] === "string" ? decoded[2] : "",
    lockerIdHash: field(decoded[3], "locker_id_hash"),
    claimantKey: field(decoded[3], "claimant_key"),
  };
}
export function matchesLockerClaimEvent(encodedBase64: string, expectedLockerHash: string, expectedClaimantKey: string) {
  const event = decodeLockerClaimEvent(encodedBase64);
  return event.topic === "ContariRegistry.LockerClaimed" &&
    typeof event.lockerIdHash === "string" &&
    event.lockerIdHash.toLowerCase() === expectedLockerHash.toLowerCase() &&
    typeof event.claimantKey === "string" &&
    event.claimantKey.toLowerCase().replace(/^0x/, "") === expectedClaimantKey.toLowerCase().replace(/^0x/, "");
}
