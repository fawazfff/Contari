# Contari launch checklist

This is the handoff for the remaining Tari deployment work. The application and contract can be built without a funded mainnet wallet. Publishing and instantiating the registry are network transactions and are deliberately left for the wallet owner.

## What is prepared

- Frontend build: `npm run build`.
- Contract WASM build: `cargo build --manifest-path contracts/contari/Cargo.toml --target wasm32-unknown-unknown --release`.
- CI uploads the compiled contract as the `contari-ootle-template-wasm` artifact.
- Settings accepts a component address after the registry has been instantiated.
- Browser tests cover landing navigation, workspace routes, wallet connect/disconnect, form validation, locker creation, preview unlock, allowlist rejection, settings validation, and link copying.

## Before any mainnet transaction

1. Test the template and app on an Ootle test network first.
2. Read the current Tari Ootle publishing guide and confirm the network selected in the wallet.
3. Download the WASM artifact from a successful GitHub Actions run, or build it locally using the command above.
4. In the Tari Ootle Wallet UI, choose **Publish Template**, select the fee account, upload `contari.wasm`, estimate the fee, and publish. Do not guess the fee.
5. After finality, copy the published template address.
6. Instantiate the template's `ContariRegistry::new` constructor on the same network. Copy the resulting component address.
7. Open Contari → Workspace → Wallet & network. Save the component address **before creating lockers**. Each new locker stores the component address it must use for claims. Mainnet locker creation is blocked until a component is configured.
8. Test registration, an allowed claim, a rejected allowlist claim, a wrong-network claim, repeat claims (each must emit an event without increasing the unique-wallet counter), and independent indexer verification of the finalized `LockerClaimed` event.
9. Repeat the checks on mainnet with a small test locker before inviting users.

Official Tari guides:
- [Publishing templates](https://ootle.tari.com/guides/publishing-templates/)
- [Testing templates](https://ootle.tari.com/guides/testing-templates/)
- [Tari dApp integration and wallet methods](https://universe.tari.mw/integration/)

## Security model and remaining production checks

New lockers no longer put the AES key in the URL. The key is wrapped by a server-held AES-256-GCM master key and stored in a private key-vault table. Direct client reads of the locker table are revoked; public links use a single-ID Edge Function read, while the workspace list requires a fresh signed wallet challenge. Unlock requires a fresh, single-use Tari wallet ownership proof verified by the Edge Function, plus a server-side access-rule check. The Edge Function releases the key only after those checks pass. When a locker has a configured Ootle component, the server independently checks the transaction result and a matching `LockerClaimed` event on a trusted public indexer. It matches the locker hash and the claimant public key to the connected Tari wallet. A locker without a component is protected by the signed-wallet and server-side access checks only. The Ootle contract must never store the plaintext key.

Old lockers created with the previous URL-fragment format cannot be made secure retroactively. Recreate them and stop sharing the old links. The current server-held master key means the service operator can decrypt the wrapped keys; recipient-specific key wrapping is a future improvement if the product needs operator-blind encryption. Real Tari wallet signature interoperability and the on-chain path still need a testnet deployment and live wallet validation.

## Test commands

```sh
npm install
npm run build
npx playwright install chromium
npm run test:e2e
deno test --allow-net supabase/functions/contari-secure/crypto_test.ts supabase/functions/contari-secure/ootle_verification_test.ts
# CI also runs edge_integration_test.ts against the configured Supabase project
cargo build --manifest-path contracts/contari/Cargo.toml --target wasm32-unknown-unknown --release
```

GitHub Actions runs the frontend build, Playwright browser tests, Deno cryptographic proof tests, a live integration test against the deployed secure-key Edge Function, and the contract WASM build on pushes and pull requests to `main`.
