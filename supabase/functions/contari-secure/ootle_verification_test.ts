import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import { encode } from "npm:cbor-x@1.6.0";
import { decodeLockerClaimEvent, matchesLockerClaimEvent, normalizeTransactionId } from "./ootle_verification.ts";

function b64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
Deno.test("decodes a tagged Tari Metadata payload and matches LockerClaimed", () => {
  const hash = "a".repeat(64);
  const claimant = "b".repeat(64);
  const payloadParts = [
    encode("locker_id_hash"), encode(hash),
    encode("claimant_key"), encode(claimant),
  ];
  const payload = new Uint8Array([0xa2, ...payloadParts.flatMap(part => Array.from(part))]);
  const taggedPayload = new Uint8Array([0xd8, 0x81, ...payload]);
  const prefix = encode([null, new Uint8Array(32), "LockerClaimed"]);
  prefix[0] = 0x84; // Change the three-item array header to four items.
  const eventBytes = new Uint8Array(prefix.length + taggedPayload.length);
  eventBytes.set(prefix);
  eventBytes.set(taggedPayload, prefix.length);
  const encoded = b64(eventBytes);
  const event = decodeLockerClaimEvent(encoded);
  assertEquals(event.topic, "LockerClaimed");
  assertEquals(matchesLockerClaimEvent(encoded, hash, claimant), true);
  assertEquals(matchesLockerClaimEvent(encoded, "c".repeat(64), claimant), false);
  assertEquals(matchesLockerClaimEvent(encoded, hash, "d".repeat(64)), false);
});
Deno.test("rejects a different event topic", () => {
  const encoded = b64(encode([null, new Uint8Array(32), "LockerRegistered", {
    locker_id_hash: "a".repeat(64), claimant_key: "b".repeat(64),
  }]));
  assertEquals(matchesLockerClaimEvent(encoded, "a".repeat(64), "b".repeat(64)), false);
});
Deno.test("normalizes only 32-byte transaction IDs", () => {
  assertEquals(normalizeTransactionId("0x" + "a".repeat(64)), "a".repeat(64));
  assertThrows(() => normalizeTransactionId("pending"));
});
