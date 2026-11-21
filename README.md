# Contari

Contari is a Tari Ootle locker for sharing encrypted notes and messages. A creator connects a Tari wallet, creates a locker, and chooses who may open it:

- **Any Tari wallet** on the same supported network.
- **Selected Tari wallets** supplied as a list of addresses.

Email sign-in has been removed. The connected Tari wallet is the creator and visitor identity used by the app.

## Current implementation

- React + Vite frontend.
- Official Tari dApp connector loaded from `https://universe.tari.mw/tari-connector.js`.
- Browser-side AES-256-GCM encryption using the Web Crypto API.
- Supabase storage for encrypted locker records.
- Wallet-based locker filtering by creator address.
- Ootle registry template source in `contracts/contari`.
- Ootle transaction helpers for locker registration and claims.
- Locker creation waits for a committed Ootle registration when a component is configured.
- Locker opening waits for a committed Ootle claim when a component is configured.
- Responsive landing page, workspace, wallet settings, and restrained motion/hover feedback.

## Current deployment status

The frontend is deployed at https://contari-ten.vercel.app.

The Ootle contract has compiled to WASM in GitHub Actions, but it has **not** yet been published as a mainnet template or instantiated as a mainnet component. Until that is done, the app is still in preview mode.

## Security limits to fix before production

Contari is not yet safe for sensitive content.

1. **The share link contains the decryption key.** Anyone with the complete link can extract the key and decrypt the content outside Contari. A secure key-release service must replace this bearer-link design.
2. **Preview wallet challenges are not independently verified.** The preview requests `tari_signWalletOwnershipChallenge`, but the returned proof is not cryptographically verified by the app.
3. **Cloud creator filtering is not proof of wallet ownership.** Supabase stores the creator address and filters lockers by that address. The on-chain registry is the authority for wallet ownership once deployed; database identity alone is not.
4. **Allowlist checks in preview mode are client-side.** They become enforceable only after the Ootle registry is published, instantiated, and configured.
5. **Mainnet has not been tested with a funded Tari wallet.** Wallet prompts, contract calls, fees, and finality must be tested against a live wallet before calling this production-ready.

Do not use the preview for valuable, regulated, or highly confidential information.

## Development checks

Run `npm run build` for the production frontend build and `npm run test:e2e` for browser-level tests. GitHub Actions also builds the Ootle contract WASM and stores it as a downloadable artifact. See [the launch checklist](docs/launch-checklist.md) for the testnet-first publishing and mainnet handoff.

## Supabase

The connected Supabase project uses `contari_lockers` for encrypted locker records. Email authentication is not used by the current app. The wallet-first migration is:

`supabase/migrations/20261121070000_wallet_first_storage.sql`

The public locker-read policy exposes ciphertext and metadata, not plaintext. The app encrypts content before it is stored.

## Ootle contract

The registry supports:

- `register_locker`: records a locker hash, network, gate type, allowlist and authenticated transaction signer.
- `claim_locker`: checks the transaction signer against the wallet address, checks the network and applies the selected-wallet allowlist.
- `get_counts`: reads registry counters.

The contract uses the authenticated Ootle transaction signer, not a caller-supplied address, as the authority for creator and claimant identity.

## Mainnet release checklist

1. Publish the compiled template to Tari Ootle mainnet.
2. Instantiate the Contari registry component on mainnet.
3. Save the real mainnet component address in Contari Settings.
4. Connect a Tari Ootle mainnet wallet and test registration and claims.
5. Verify committed transaction results and failure cases.
6. Replace the URL-fragment key with a secure key-release mechanism.
7. Add independent wallet challenge verification for app sessions and cloud identity.
8. Test the complete flow on mobile and desktop before public launch.
