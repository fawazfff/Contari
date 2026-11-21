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
7. Open Contari → Workspace → Wallet & network. Save the component address.
8. Test registration, an allowed claim, a rejected allowlist claim, a wrong-network claim, a duplicate claim, and transaction-finality handling.
9. Repeat the checks on mainnet with a small test locker before inviting users.

Official Tari guides:
- [Publishing templates](https://ootle.tari.com/guides/publishing-templates/)
- [Testing templates](https://ootle.tari.com/guides/testing-templates/)
- [Tari dApp integration and wallet methods](https://universe.tari.mw/integration/)

## Production security blocker

New lockers no longer put the AES key in the URL. The key is wrapped by a server-held AES-256-GCM master key and stored in a private key-vault table. Unlock requires a fresh, single-use Tari wallet ownership proof verified by the Edge Function, plus a server-side access-rule check. The Edge Function releases the key only after those checks pass. The Ootle contract must never store the plaintext key.

Old lockers created with the previous URL-fragment format cannot be made secure retroactively. Recreate them and stop sharing the old links. The current server-held master key means the service operator can decrypt the wrapped keys; recipient-specific key wrapping is a future improvement if the product needs operator-blind encryption. Real Tari wallet signature interoperability and on-chain transaction verification still need testnet/mainnet validation.

## Test commands

```sh
npm install
npm run build
npx playwright install chromium
npm run test:e2e
cargo build --manifest-path contracts/contari/Cargo.toml --target wasm32-unknown-unknown --release
```

GitHub Actions runs the frontend build, Playwright browser tests, and contract WASM build on pushes and pull requests to `main`.
