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
  capabilities?: {
    walletOwnershipProof?: boolean;
    transactionResultLookup?: boolean;
    transactionRequests?: boolean;
  };
};

function waitForTariProvider(timeoutMs = 1800): Promise<TariWallet | undefined> {
  if (window.tari?.isTariWallet) return Promise.resolve(window.tari);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (provider?: TariWallet) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("tari#initialized", onInitialized);
      window.clearTimeout(timer);
      resolve(provider);
    };
    const onInitialized = () => finish(window.tari);
    window.addEventListener("tari#initialized", onInitialized, { once: true });
    const timer = window.setTimeout(() => finish(window.tari), timeoutMs);
  });
}

export async function connectTari(): Promise<WalletSession> {
  const provider = await waitForTariProvider();
  if (!provider || typeof provider.request !== "function") {
    throw new Error(
      "Tari wallet not found in this browser. Open Contari from the Tari Universe web app at universe.tari.mw, or install and connect the Sapient Tari Ootle browser extension. Opening contari-ten.vercel.app in a normal browser tab does not inject a wallet by itself."
    );
  }

  const accounts = await provider.request({ method: "tari_requestAccounts" }) as string[];
  if (!Array.isArray(accounts) || !accounts[0]) {
    throw new Error("No Tari account was selected. Approve the connection in your Tari wallet, then try again.");
  }

  const network = await provider.request({ method: "tari_getNetwork" }) as string;
  const capabilities = await provider.request({ method: "tari_getCapabilities" })
    .catch(() => ({})) as WalletSession["capabilities"];

  if (!network || typeof network !== "string") {
    throw new Error("The Tari wallet did not return its active network.");
  }
  return { address: accounts[0], network, wallet: provider, capabilities };
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
