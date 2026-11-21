import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import { encode } from "npm:cbor-x@1.6.0";
import { decodeLockerClaimEvent, matchesLockerClaimEvent, normalizeTransactionId } from "./ootle_verification.ts";

function b64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
Deno.test("decodes and matches a Tari LockerClaimed event", () => {
  const hash = "a".repeat(64);
  const claimant = "b".repeat(64);
  const encoded = b64(encode([null, new Uint8Array(32), "LockerClaimed", {
    locker_id_hash: hash,
    claimant_key: claimant,
  }]));
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
