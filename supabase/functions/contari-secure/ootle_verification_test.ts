import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import { encode } from "npm:cbor-x@1.6.0";
import { decodeLockerClaimEvent, matchesLockerClaimEvent, normalizeTransactionId } from "./ootle_verification.ts";

function b64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function makeEvent(options: {
  topic?: string; templateByte?: number; lockerHash?: string;
  claimant?: string; component?: string;
}) {
  const template = new Uint8Array(32).fill(options.templateByte ?? 0x34);
  const lockerHash = options.lockerHash ?? "a".repeat(64);
  const claimant = options.claimant ?? "b".repeat(64);
  const component = options.component ?? "component_" + "12".repeat(32);
  const topic = encode(options.topic ?? "ContariRegistry.LockerClaimed");
  const encodedTemplate = encode(template);
  const metadata = encode(new Map([
    ["locker_id_hash", lockerHash],
    ["claimant_key", claimant],
    ["component_address", component],
  ]));
  // Tari Metadata is CBOR tag 129 around its map of raw-CBOR values.
  const event = new Uint8Array(2 + 2 + encodedTemplate.length + topic.length + 2 + metadata.length);
  let offset = 0;
  event.set([0x84, 0xf6, 0xd8, 0x89], offset); offset += 4; // array(4), null substate, tag(137) template address
  event.set(encodedTemplate, offset); offset += encodedTemplate.length;
  event.set(topic, offset); offset += topic.length;
  event.set([0xd8, 0x81], offset); offset += 2; // tag(129) Metadata
  event.set(metadata, offset);
  return { encoded: b64(event), lockerHash, claimant, component, template: "34".repeat(32) };
}
Deno.test("decodes Tari BOR tagged template and metadata payload", () => {
  const fixture = makeEvent({});
  const event = decodeLockerClaimEvent(fixture.encoded);
  assertEquals(event.topic, "ContariRegistry.LockerClaimed");
  assertEquals(event.templateAddress, fixture.template);
  assertEquals(event.lockerIdHash, fixture.lockerHash);
  assertEquals(event.claimantKey, fixture.claimant);
  assertEquals(event.componentAddress, fixture.component);
  assertEquals(matchesLockerClaimEvent(
    fixture.encoded, fixture.template, fixture.component, fixture.lockerHash, fixture.claimant,
  ), true);
});
Deno.test("rejects a different template, component, locker, claimant, or topic", () => {
  const fixture = makeEvent({});
  assertEquals(matchesLockerClaimEvent(fixture.encoded, "56".repeat(32), fixture.component, fixture.lockerHash, fixture.claimant), false);
  assertEquals(matchesLockerClaimEvent(fixture.encoded, fixture.template, "component_" + "98".repeat(32), fixture.lockerHash, fixture.claimant), false);
  assertEquals(matchesLockerClaimEvent(fixture.encoded, fixture.template, fixture.component, "c".repeat(64), fixture.claimant), false);
  assertEquals(matchesLockerClaimEvent(fixture.encoded, fixture.template, fixture.component, fixture.lockerHash, "d".repeat(64)), false);
  const unrelated = makeEvent({ topic: "ContariRegistry.LockerRegistered" });
  assertEquals(matchesLockerClaimEvent(unrelated.encoded, unrelated.template, unrelated.component, unrelated.lockerHash, unrelated.claimant), false);
});
Deno.test("normalizes only 32-byte transaction IDs", () => {
  assertEquals(normalizeTransactionId("0x" + "a".repeat(64)), "a".repeat(64));
  assertThrows(() => normalizeTransactionId("pending"));
});
