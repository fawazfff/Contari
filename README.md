# Contari

Contari is a Tari Ootle content-locker prototype. It encrypts a note in the browser, stores only the encrypted payload in Supabase, and shares a link that includes the decryption key in its URL fragment.

## What works

- Public landing page, product explanation, workspace, locker creation, locker library, settings, and public locker routes.
- Browser-side AES-256-GCM encryption using the Web Crypto API.
- Encrypted locker records stored in Supabase and retrievable from another device.
- Email magic-link authentication for locker ownership and cloud library access.
- Supabase Row Level Security for locker ownership, public ciphertext reads, and claim records.
- Tari wallet connection through the official `window.tari` dApp connector.
- Ootle registry transaction helpers for registering locker hashes and submitting wallet-signed claims when a published component address is configured.
- Demo mode can request a fresh Tari wallet-ownership challenge through `tari_signWalletOwnershipChallenge`.
- Optional allowlist check in the browser demo.

## Important security boundaries

This is not yet a production access-control system.

- The complete share URL contains the AES decryption key in its fragment. Anyone who receives the complete link can extract the key and decrypt the content outside Contari, even when the Ootle claim flow is configured. A separate key-release service is still required to make the gate enforce confidentiality. Treat the link as a bearer secret.
- In Ootle mode, the registry checks the authenticated transaction signer against the owner key decoded from the Tari address. In demo mode, the app only records the wallet challenge response and does not independently verify it.
- The allowlist is checked in the browser and can be bypassed by someone who extracts the key.
- Claim rows are records of client-reported attempts. They are not independently verified wallet identities.
- The Rust Ootle template is not published yet. The web app can call its `register_locker` and `claim_locker` methods after you publish the template, instantiate the registry component, and save that component address in Settings.
- Do not use Contari for valuable, regulated, or highly confidential information.

## Supabase setup

The connected project already has the `contari_lockers` and `contari_claims` tables with RLS policies. The matching SQL is saved in `supabase/migrations/20261120210000_create_contari_tables.sql`.

1. Open Supabase Authentication → URL Configuration.
2. Set the Site URL to `https://contari-ten.vercel.app`.
3. Add `https://contari-ten.vercel.app/**` to the Redirect URLs list.
4. Email magic links are enabled by default on Supabase Auth. In Contari, enter an email in the workspace header and open the link sent to that inbox.
5. The authenticated session owns lockers. Do not enable anonymous sign-ins for this implementation.

For local development, copy `.env.example` to `.env.local` and set the project URL and publishable key. Add your local URL (for example `http://localhost:5173/**`) to Supabase Redirect URLs.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

## Tari wallet

Contari loads the official connector from `https://universe.tari.mw/tari-connector.js`. The integration methods and capability names follow the [Tari dApp integration guide](https://universe.tari.mw/integration/). The app asks the wallet to connect and sign a fresh wallet-ownership challenge. Signature verification is still outstanding.

## Ootle template

The Rust template lives in `contracts/contari`. See [`contracts/README.md`](contracts/README.md) for build and Esmeralda publishing instructions.

```bash
rustup target add wasm32-unknown-unknown
cargo build --manifest-path contracts/contari/Cargo.toml --target wasm32-unknown-unknown --release
```

Publishing requires a running Tari Ootle wallet and TARI for fees. Do not claim a mainnet launch until the template is published and transaction proof is available.

## Routes

- `/` Public landing page
- `/how-it-works` Product explanation
- `/app` Workspace overview
- `/app/create` Create and encrypt a locker
- `/app/library` Browse and delete cloud lockers
- `/app/settings` Wallet and contract settings
- `/l/:id` Public locker view and wallet challenge

## Stack

Vite, React, TypeScript, React Router, Supabase JS, Lucide, Tari wallet connector, Web Crypto API.
