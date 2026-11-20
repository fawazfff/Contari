# Contari Ootle registry

This template records locker registration and wallet claims on Tari Ootle. It stores only a SHA-256 hash of the Contari locker ID, the creator's authenticated signer key, the network, the gate type, allowlisted owner keys, and wallet keys that have claimed.

It does **not** store locker content or decryption keys.

## Build

Install Rust and the WASM target:

```bash
rustup target add wasm32-unknown-unknown
cargo build --manifest-path contracts/contari/Cargo.toml --target wasm32-unknown-unknown --release
```

The output is:

`contracts/contari/target/wasm32-unknown-unknown/release/contari.wasm`

## Publish to Esmeralda

1. Install the Tari Ootle CLI and set up an Esmeralda wallet using the [official wallet setup guide](https://ootle.tari.com/guides/setup-a-wallet/).
2. Claim testnet funds if the faucet has funds available. Publishing and contract calls require testnet TTARI.
3. Publish the compiled WASM using the [official template publishing guide](https://ootle.tari.com/guides/publishing-templates/).
4. Instantiate the published template's `ContariRegistry::new` constructor from the Ootle wallet UI/CLI.
5. Copy the resulting component address into Contari → Workspace → Settings → Ootle contract.

The web app does not publish or instantiate the template automatically yet. It needs a funded wallet and a published template address first. Do not use mainnet for initial testing.

## On-chain methods

- `register_locker(locker_id_hash, network, gate, allowed_wallet_addresses)`: binds a new locker hash to the authenticated transaction signer. Allowlist addresses are decoded and their owner keys stored.
- `claim_locker(locker_id_hash, network, wallet_address)`: checks the transaction's authenticated signer equals the owner key decoded from the supplied Tari address, checks network and allowlist, then records the claim. Duplicate claims are rejected.
- `get_counts()`: returns the number of registered lockers and claims.

The wallet's signed Ootle transaction is the authentication proof. The contract does not trust a wallet address passed as a function argument without comparing it to the transaction signer.

## Important content-key limitation

Contari currently puts the AES decryption key in the URL fragment so the recipient's browser can decrypt the content. Anyone who receives the complete URL can extract that key and decrypt the ciphertext outside the app. The Ootle claim is therefore an on-chain authorization/claim record and an in-app gate, **not yet a cryptographic barrier against someone who has the complete share link**.

A production access gate needs a separate key-release design, such as a server-side key broker that verifies the finalized Ootle claim before releasing a wrapped key, or recipient-specific key wrapping. Do not use this prototype for valuable or highly confidential content.
