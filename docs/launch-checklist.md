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

The current link still carries the AES key in its URL fragment. That makes the full link a bearer secret. A recipient can extract the key and decrypt the ciphertext without connecting a wallet or submitting an Ootle claim. The registry can record and enforce who is allowed to claim, but it cannot make the browser-held key secret after the creator shares it.

Do not describe this version as confidential or launch it for sensitive content until key delivery is redesigned and tested. A production design needs a cryptographically verified wallet authorization step and a secure key-release or recipient key-wrapping scheme. The Ootle contract must never store the plaintext key.

## Test commands

```sh
npm install
npm run build
npx playwright install chromium
npm run test:e2e
cargo build --manifest-path contracts/contari/Cargo.toml --target wasm32-unknown-unknown --release
```

GitHub Actions runs the frontend build, Playwright browser tests, and contract WASM build on pushes and pull requests to `main`.
