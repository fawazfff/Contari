import { decode } from "npm:cbor-x@1.6.0";

function unwrapTag(value: unknown) {
  let current = value;
  for (let i = 0; i < 4; i++) {
    if (current && typeof current === "object" &&
        "tag" in current && "value" in current) {
      current = (current as { value: unknown }).value;
    } else {
      break;
    }
  }
  return current;
}
function field(payload: unknown, key: string) {
  const value = unwrapTag(payload);
  if (value instanceof Map) return unwrapTag(value.get(key));
  if (value && typeof value === "object") return unwrapTag((value as Record<string, unknown>)[key]);
  return undefined;
}
export function normalizeTransactionId(value: unknown) {
  if (typeof value !== "string") throw new Error("The Tari wallet did not return a transaction ID.");
  const id = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("The Ootle transaction ID has an unsupported format.");
  return id;
}
export function decodeLockerClaimEvent(encodedBase64: string) {
  if (typeof encodedBase64 !== "string" || encodedBase64.length > 100_000) {
    throw new Error("Malformed Ootle claim event.");
  }
  const binary = atob(encodedBase64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const decoded = decode(bytes) as unknown;
  if (!Array.isArray(decoded) || decoded.length < 4) throw new Error("Unexpected Ootle event encoding.");
  const payload = decoded[3];
  const topic = decoded[2];
  return {
    topic: typeof topic === "string" ? topic : "",
    lockerIdHash: field(payload, "locker_id_hash"),
    claimantKey: field(payload, "claimant_key"),
  };
}
export function matchesLockerClaimEvent(
  encodedBase64: string,
  expectedLockerHash: string,
  expectedClaimantKey: string,
) {
  const event = decodeLockerClaimEvent(encodedBase64);
  return event.topic === "LockerClaimed" &&
    typeof event.lockerIdHash === "string" &&
    event.lockerIdHash.toLowerCase() === expectedLockerHash.toLowerCase() &&
    typeof event.claimantKey === "string" &&
    event.claimantKey.toLowerCase().replace(/^0x/, "") === expectedClaimantKey.toLowerCase().replace(/^0x/, "");
}
