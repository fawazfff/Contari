type TariRequest = {
  request: (args: { method: string; params?: Record<string, unknown> }) => Promise<any>;
};

const NETWORK_BYTES: Record<string, number> = {
  mainnet: 0,
  localnet: 16,
  local: 16,
  igor: 36,
  esmeralda: 38,
};

function hex(bytes: Uint8Array) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function cborHead(major: number, length: number): number[] {
  if (length < 24) return [(major << 5) | length];
  if (length <= 0xff) return [(major << 5) | 24, length];
  if (length <= 0xffff) return [(major << 5) | 25, (length >> 8) & 255, length & 255];
  throw new Error("CBOR value is too long.");
}

function cborText(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  return Uint8Array.from([...cborHead(3, bytes.length), ...bytes]);
}

function cborUnsigned(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new Error("Invalid Tari network byte.");
  if (value < 24) return Uint8Array.of(value);
  if (value <= 0xff) return Uint8Array.of(0x18, value);
  return Uint8Array.of(0x19, (value >> 8) & 255, value & 255);
}

function cborTextArray(values: string[]): Uint8Array {
  const encoded = values.map(cborText);
  const out = [...cborHead(4, encoded.length)];
  for (const value of encoded) out.push(...value);
  return Uint8Array.from(out);
}

function literal(bytes: Uint8Array) {
  return { Literal: hex(bytes) };
}

async function lockerHash(id: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return hex(new Uint8Array(digest));
}

function networkByte(network: string) {
  const key = network.trim().toLowerCase();
  const value = NETWORK_BYTES[key];
  if (value === undefined) throw new Error("Unsupported Tari network: " + network);
  return value;
}

async function submitMethod(
  wallet: TariRequest,
  componentAddress: string,
  method: string,
  args: Array<{ Literal: string }>,
) {
  if (!isValidOotleComponentAddress(componentAddress)) {
    throw new Error("Enter a valid published Contari component address (component_ followed by 64 hex characters).");
  }
  const result = await wallet.request({
    method: "tari_signAndSubmitTransaction",
    params: {
      instructions: [{
        CallMethod: {
          call: { Address: componentAddress },
          method,
          args,
        },
      }],
    },
  });
  const record = result && typeof result === "object" ? result : { result };
  const txId = record.transactionId || record.transaction_id || record.txId || record.tx_id || record.id;
  if (!txId) {
    throw new Error("The wallet returned without a transaction ID. Check the Tari wallet transaction history before retrying.");
  }
  return { transactionId: String(txId), response: result };
}

export async function registerLockerOnOotle(
  wallet: TariRequest,
  componentAddress: string,
  id: string,
  network: string,
  gate: "wallet" | "allowlist",
  allowedWallets: string[],
) {
  const byte = networkByte(network);
  const hash = await lockerHash(id);
  const args = [
    literal(cborText(hash)),
    literal(cborUnsigned(byte)),
    literal(cborText(gate)),
    literal(cborTextArray(gate === "allowlist" ? allowedWallets : [])),
  ];
  return submitMethod(wallet, componentAddress, "register_locker", args);
}

export async function claimLockerOnOotle(
  wallet: TariRequest,
  componentAddress: string,
  id: string,
  network: string,
  walletAddress: string,
) {
  const byte = networkByte(network);
  const hash = await lockerHash(id);
  const args = [
    literal(cborText(hash)),
    literal(cborUnsigned(byte)),
    literal(cborText(walletAddress)),
  ];
  return submitMethod(wallet, componentAddress, "claim_locker", args);
}

export async function getOotleTransactionResult(wallet: TariRequest, transactionId: string) {
  const response = await wallet.request({ method: "tari_getTransactionResult", params: { transactionId } });
  const outcome = response?.result?.outcome ?? response?.outcome;
  if (outcome !== "Commit") {
    const reason = response?.result?.reason ?? response?.reason ?? outcome ?? "unknown";
    throw new Error("Ootle transaction is not confirmed as committed (" + String(reason) + "). Content remains locked.");
  }
  return response;
}

export function isValidOotleComponentAddress(value: string) {
  return /^component_[0-9a-f]{64}$/i.test(value.trim());
}

export function getConfiguredOotleComponent() {
  return localStorage.getItem("contari_component") || "";
}
