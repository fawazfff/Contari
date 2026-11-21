export type TariWallet = {
  request: (args: { method: string; params?: Record<string, unknown> }) => Promise<any>;
  on?: (event: string, callback: (value: any) => void) => (() => void) | void;
  isTariWallet?: boolean;
  isAvailable?: boolean;
};

type TariConnection = {
  open?: (options?: { theme?: "light" | "dark"; title?: string }) => Promise<{
    wallet?: string;
    provider: TariWallet;
    accounts: string[];
  }>;
  disconnect?: () => Promise<void> | void;
};

declare global {
  interface Window {
    tari?: TariWallet;
    TariConnect?: TariConnection;
  }
}

export type WalletSession = {
  address: string;
  network: string;
  wallet: TariWallet;
  walletType?: string;
  capabilities?: {
    walletOwnershipProof?: boolean;
    transactionResultLookup?: boolean;
    transactionRequests?: boolean;
  };
};

async function resolveProvider(): Promise<{ provider: TariWallet; address: string; walletType?: string }> {
  // Tari's official picker handles the Universe iframe, Sapient extension and
  // optional Sapient mobile WalletConnect transport through one API.
  if (window.TariConnect?.open) {
    const connection = await window.TariConnect.open({ theme: "dark", title: "Connect to Contari" });
    const provider = connection?.provider;
    const address = connection?.accounts?.[0];
    if (!provider || !address) throw new Error("The Tari wallet picker closed without connecting an account.");
    return { provider, address, walletType: connection.wallet };
  }

  // Compatibility fallback for an older connector or an already injected wallet.
  const provider = window.tari;
  if (!provider || provider.isAvailable === false) {
    throw new Error("No Tari wallet is connected to this browser. Open Contari from universe.tari.mw, install the Sapient browser extension, or use the Tari wallet picker. Safari does not provide a Tari wallet by itself.");
  }
  const accounts = await provider.request({ method: "tari_requestAccounts" }) as string[];
  if (!Array.isArray(accounts) || !accounts[0]) {
    throw new Error("The Tari wallet did not return a connected account.");
  }
  return { provider, address: accounts[0] };
}

export async function connectTari(): Promise<WalletSession> {
  const { provider, address, walletType } = await resolveProvider();
  const network = await provider.request({ method: "tari_getNetwork" }) as string;
  const capabilities = await provider.request({ method: "tari_getCapabilities" })
    .catch(() => ({})) as WalletSession["capabilities"];

  if (!network || typeof network !== "string") {
    throw new Error("The Tari wallet did not return its active network.");
  }
  return { address, network, wallet: provider, walletType, capabilities };
}

export async function proveWalletOwnership(session: WalletSession, lockerId: string) {
  if (!session.capabilities?.walletOwnershipProof) {
    throw new Error("This Tari wallet does not support wallet ownership proofs. Update the wallet or use another connected Tari wallet.");
  }
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
  try {
    await provider?.request({ method: "tari_disconnect" });
  } catch {
    // Some wallet transports only support disconnect through the picker.
  }
  try {
    await window.TariConnect?.disconnect?.();
  } catch {
    // Local app state is still cleared by the caller.
  }
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
