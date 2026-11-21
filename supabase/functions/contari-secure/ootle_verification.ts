import { decode, encode } from "npm:cbor-x@1.6.0";

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
    templateAddress: decoded[1],
    topic: typeof decoded[2] === "string" ? decoded[2] : "",
    lockerIdHash: field(decoded[3], "locker_id_hash"),
    claimantKey: field(decoded[3], "claimant_key"),
    componentAddress: field(decoded[3], "component_address"),
  };
}
export function matchesLockerClaimEvent(
  encodedBase64: string,
  expectedTemplateAddress: string,
  expectedComponentAddress: string,
  expectedLockerHash: string,
  expectedClaimantKey: string,
) {
  const event = decodeLockerClaimEvent(encodedBase64);
  const template = event.templateAddress instanceof Uint8Array
    ? Array.from(event.templateAddress, (v) => v.toString(16).padStart(2, "0")).join("")
    : typeof event.templateAddress === "string"
      ? event.templateAddress.toLowerCase().replace(/^template_/, "").replace(/^0x/, "")
      : "";
  return event.topic === "ContariRegistry.LockerClaimed" &&
    template === expectedTemplateAddress.toLowerCase().replace(/^template_/, "").replace(/^0x/, "") &&
    typeof event.componentAddress === "string" &&
    event.componentAddress.toLowerCase() === expectedComponentAddress.toLowerCase() &&
    typeof event.lockerIdHash === "string" &&
    event.lockerIdHash.toLowerCase() === expectedLockerHash.toLowerCase() &&
    typeof event.claimantKey === "string" &&
    event.claimantKey.toLowerCase().replace(/^0x/, "") === expectedClaimantKey.toLowerCase().replace(/^0x/, "");
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
Deno.test("matches only the Contari claim event from the expected template and component", () => {
  const lockerHash = "ab".repeat(32);
  const claimant = "cd".repeat(32);
  const component = "component_" + "12".repeat(32);
  const template = new Uint8Array(32).fill(0x34);
  const event = encode([
    null,
    template,
    "ContariRegistry.LockerClaimed",
    new Map([
      ["locker_id_hash", lockerHash],
      ["claimant_key", claimant],
      ["component_address", component],
    ]),
  ]);
  const encoded = base64(event);
  const expectedTemplate = "34".repeat(32);
  if (!matchesLockerClaimEvent(encoded, expectedTemplate, component, lockerHash, claimant)) {
    throw new Error("A valid Contari claim event was not accepted.");
  }
  if (matchesLockerClaimEvent(encoded, "56".repeat(32), component, lockerHash, claimant)) {
    throw new Error("An event from an unexpected template was accepted.");
  }
  if (matchesLockerClaimEvent(encoded, expectedTemplate, "component_" + "98".repeat(32), lockerHash, claimant)) {
    throw new Error("An event from an unexpected component was accepted.");
  }
  if (matchesLockerClaimEvent(encoded, expectedTemplate, component, "ef".repeat(32), claimant)) {
    throw new Error("An event for another locker was accepted.");
  }
  if (matchesLockerClaimEvent(encoded, expectedTemplate, component, lockerHash, "01".repeat(32))) {
    throw new Error("An event for another claimant was accepted.");
  }
});

Deno.test("rejects malformed and unrelated event encodings", () => {
  let malformedRejected = false;
  try { decodeLockerClaimEvent("not-base64"); } catch { malformedRejected = true; }
  if (!malformedRejected) throw new Error("Malformed event encoding was accepted.");
  const unrelated = base64(encode([null, new Uint8Array(32), "OtherTemplate.OtherEvent", new Map()]));
  if (matchesLockerClaimEvent(unrelated, "00".repeat(32), "component_" + "00".repeat(32), "00".repeat(32), "00".repeat(32))) {
    throw new Error("An unrelated event was accepted.");
  }
});
