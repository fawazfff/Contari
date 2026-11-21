export type TariWallet = {
  request: (args: { method: string; params?: Record<string, unknown> }) => Promise<any>;
  on?: (event: string, callback: (value: any) => void) => (() => void) | void;
  isTariWallet?: boolean;
};

declare global {
  interface Window {
    tari?: TariWallet;
  }
}

export type WalletSession = {
  address: string;
  network: string;
  wallet: TariWallet;
  capabilities?: { walletOwnershipProof?: boolean; transactionResultLookup?: boolean };
};

export async function connectTari(): Promise<WalletSession> {
  const provider = window.tari;
  if (!provider) {
    throw new Error("No Tari wallet was found. Open Contari inside Tari Universe or install the Tari wallet connector.");
  }

  const accounts = await provider.request({ method: "tari_requestAccounts" }) as string[];
  if (!Array.isArray(accounts) || !accounts[0]) {
    throw new Error("The Tari wallet did not return a connected account.");
  }

  const network = await provider.request({ method: "tari_getNetwork" }) as string;
  const capabilities = await provider.request({ method: "tari_getCapabilities" }).catch(() => ({})) as { walletOwnershipProof?: boolean; transactionResultLookup?: boolean };
  if (!network || typeof network !== "string") {
    throw new Error("The Tari wallet did not return its active network.");
  }

  return { address: accounts[0], network, wallet: provider, capabilities };
}

/**
 * Demo-only wallet challenge. A returned response is not trusted as verified
 * until a verifier checks it against the owner key encoded in the address.
 * Production Ootle mode instead authenticates the wallet through the signed
 * transaction and the contract's CallerContext signer check.
 */
export async function proveWalletOwnership(session: WalletSession, lockerId: string) {
  if (!session.capabilities?.walletOwnershipProof) throw new Error("This Tari wallet does not support wallet ownership proofs. Update the wallet or use another connected Tari wallet.");
  const challenge = "contari-access:" + lockerId + ":" + crypto.randomUUID() + ":" + Date.now();
  const proof = await session.wallet.request({
    method: "tari_signWalletOwnershipChallenge",
    params: { challenge },
  }) as { walletAddress?: string; publicNonce?: string; signature?: string };

  if (!proof?.walletAddress || proof.walletAddress.toLowerCase() !== session.address.toLowerCase()) {
    throw new Error("The wallet proof did not match the connected account.");
  }
  if (!proof.signature || !proof.publicNonce) {
    throw new Error("The wallet did not return a complete ownership proof.");
  }
  return { ...proof, challenge, createdAt: new Date().toISOString(), verified: false };
}

export async function disconnectTari(session?: WalletSession) {
  const provider = session?.wallet ?? window.tari;
  if (provider) await provider.request({ method: "tari_disconnect" }).catch(() => null);
}

export function shortAddress(address: string) {
  return address.length > 20 ? address.slice(0, 10) + "..." + address.slice(-7) : address;
}

export async function signTariChallenge(session: WalletSession, challenge: string) {
  if (!session.capabilities?.walletOwnershipProof) {
    throw new Error("This Tari wallet does not support signed ownership challenges. Update the wallet before using secure lockers.");
  }
  const proof = await session.wallet.request({
    method: "tari_signWalletOwnershipChallenge",
    params: { challenge },
  }) as { walletAddress?: string; publicNonce?: string; signature?: string };
  if (!proof?.walletAddress || proof.walletAddress.toLowerCase() !== session.address.toLowerCase()) {
    throw new Error("The signed wallet proof does not match the connected Tari account.");
  }
  if (!proof.signature || !proof.publicNonce) {
    throw new Error("The Tari wallet did not return a complete ownership signature.");
  }
  return { signature: proof.signature, publicNonce: proof.publicNonce };
}
