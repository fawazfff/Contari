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

## Security model and current limits

New lockers use browser-side AES-256-GCM encryption. The raw AES key is sent over HTTPS to the Contari Secure Edge Function, encrypted again with a random server-held master key, and stored in a private key-vault table. The URL contains only the locker ID. A visitor must connect a Tari wallet and sign a fresh, five-minute, single-use ownership challenge. The Edge Function verifies the Tari Ristretto Schnorr signature against the owner key encoded in the Ootle address, checks the wallet network and the locker access rule, then releases the key over HTTPS.

The key-vault and challenge tables deny access to `anon` and `authenticated`; only the service role can access them. The server master key is stored in a private database schema and exposed to the Edge Function only through a service-role-only function. Challenge creation is rate-limited per wallet.

Important limits:
1. **Old lockers are not retroactively secured.** Their old URLs still contain their original decryption keys. They are marked as legacy and the app refuses to unlock them through the new flow. Recreate those lockers and stop sharing their old links.
2. **The secure preview enforces wallet signatures and access rules server-side.** The Ootle registry has not been published or instantiated, and server-side verification of an on-chain transaction is still a separate mainnet integration task. Do not claim on-chain enforcement is active yet.
3. **The master key is server-held, not end-to-end recipient encryption.** The service operator can decrypt vault-wrapped keys. For a zero-knowledge operator model, replace this with recipient-specific public-key wrapping or a recipient key agreement supported by Tari.
4. **The wallet proof implementation must be verified against a real supported Tari wallet and negative test vectors before production.** Automated UI tests mock the wallet and Edge Function; they do not constitute a cryptographic interoperability audit.
5. **Mainnet has not been tested with a funded Tari wallet.** Wallet prompts, contract calls, fees, and finality still require a live test.

## Development checks

Run `npm run build` for the production frontend build and `npm run test:e2e` for browser-level tests. GitHub Actions also runs Deno tests for Tari Ristretto signature verification and an integration test against the deployed Supabase secure-key function. The integration test creates a synthetic test locker, verifies an unauthorized wallet is denied, confirms the recipient can recover the key, and leaves only encrypted test data behind. CI also builds the Ootle contract WASM and stores it as a downloadable artifact. See [the launch checklist](docs/launch-checklist.md) for the testnet-first publishing and mainnet handoff.

## Supabase

The connected Supabase project uses `contari_lockers` for encrypted locker records. The `contari-secure` Edge Function verifies Tari wallet ownership proofs, creates one-time challenges, checks allowlists, and wraps/releases AES keys. `contari_key_vault` and `contari_auth_challenges` are service-role-only. Email authentication is not used by the current app. The wallet-first migration is:

`supabase/migrations/20261121070000_wallet_first_storage.sql` plus the secure key delivery migrations `20261121060429`, `20261121060446`, and `20261121060543`.

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
