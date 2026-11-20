export type TariWallet = {
  isAvailable?: boolean;
  request: (args: { method: string; params?: Record<string, unknown> }) => Promise<any>;
  on?: (event: string, callback: (value: any) => void) => (() => void) | void;
};

declare global {
  interface Window {
    tari?: TariWallet;
    tariUniverse?: TariWallet;
  }
}

export type WalletSession = {
  address: string;
  network: string;
  wallet: TariWallet;
};

export async function connectTari(): Promise<WalletSession> {
  const provider = window.tari;
  if (!provider) throw new Error("No Tari wallet was found. Open Contari inside Tari Universe or install the Tari wallet connector.");
  const accounts = await provider.request({ method: "tari_requestAccounts" }) as string[];
  if (!accounts?.length) throw new Error("The wallet did not return an account.");
  const network = await provider.request({ method: "tari_getNetwork" }).catch(() => "unknown") as string;
  return { address: accounts[0], network, wallet: provider };
}

export async function proveWalletOwnership(session: WalletSession, lockerId: string) {
  const challenge = "contari-access:" + lockerId + ":" + crypto.randomUUID() + ":" + Date.now();
  const proof = await session.wallet.request({
    method: "tari_signWalletOwnershipChallenge",
    params: { challenge }
  });
  return { ...proof, challenge, createdAt: new Date().toISOString() };
}

export async function disconnectTari(session?: WalletSession) {
  const provider = session?.wallet ?? window.tari;
  if (provider) await provider.request({ method: "tari_disconnect" }).catch(() => null);
}

export function shortAddress(address: string) {
  return address.length > 20 ? address.slice(0, 10) + "..." + address.slice(-7) : address;
}