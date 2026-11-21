// Optional Tari WalletConnect transport for Sapient mobile.
// The connector uses a shared Reown project ID when none is supplied.
// For production, create a project ID and allowlist contari-ten.vercel.app.
window.TARI_WALLETCONNECT = {
  network: "mainnet",
  metadata: {
    name: "Contari",
    description: "Share encrypted content with the Tari wallets you choose.",
    url: window.location.origin,
  },
};
