# Contari

Contari is an early Tari Ootle content-locker prototype. A creator writes content, the browser encrypts it with AES-GCM, and a visitor must connect a Tari wallet and sign a fresh wallet-ownership challenge before the demo reveals the content.

## Current implementation

- Multi-page React + TypeScript app with separate routes for the public site, workspace, locker creation, locker library, settings and public locker view.
- Tari wallet connection through the official \`window.tari\` provider and Tari connector script.
- Wallet ownership proof through \`tari_signWalletOwnershipChallenge\`.
- Browser-side AES-GCM encryption. The decryption key is carried in the URL fragment, not sent in HTTP requests.
- Optional wallet allowlist.
- Local locker library and claim history.

## Important prototype limits

This version is a functional browser demo, not a production content delivery service.

- Locker data is stored in the creator's browser localStorage. A link opened on another device cannot retrieve the encrypted payload yet.
- The URL fragment contains the decryption key. Anyone who receives the complete link has that key, so keep links private.
- The wallet ownership signature is requested from the wallet, but this frontend does not yet verify the Schnorr signature against an on-chain address.
- Claims are recorded locally. The Ootle Rust template is a starting point and is not published or connected to app transactions yet.
- The optional allowlist is an app-side demo check, not an on-chain access rule.
- Do not use this prototype for sensitive or valuable information.

These boundaries are explicit so the demo does not pretend to provide protections it has not implemented.

## Run locally

Requires Node.js 20+.

\`\`\`bash
npm install
npm run dev
\`\`\`

Open the local URL printed by Vite.

## Tari wallet

The app loads the official Tari connector from \`https://universe.tari.mw/tari-connector.js\`. It supports the wallet provider exposed in Tari Universe and compatible Tari wallet extensions. The user approves wallet connection and the ownership challenge in their wallet.

## Ootle template

The Rust template lives in \`contracts/contari\`. Build it with:

\`\`\`bash
rustup target add wasm32-unknown-unknown
cargo build --manifest-path contracts/contari/Cargo.toml --target wasm32-unknown-unknown --release
\`\`\`

Publishing requires a running Tari Ootle wallet and TARI for fees. Do not claim a mainnet launch until the template is actually published and its transaction proof is available.

## Routes

- \`/\` Public landing page
- \`/how-it-works\` Product explanation
- \`/app\` Workspace overview
- \`/app/create\` Create and encrypt a locker
- \`/app/library\` Browse and remove local lockers
- \`/app/settings\` Wallet and future contract configuration
- \`/l/:id\` Public locker view and wallet ownership challenge

## Stack

Vite, React 19, TypeScript, React Router, Lucide, Tari wallet connector, Web Crypto API.