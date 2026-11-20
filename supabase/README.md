# Contari Supabase setup

The connected Supabase project has the Contari schema:

- `public.contari_lockers` stores encrypted locker payloads and ownership.
- `public.contari_claims` stores client-reported wallet claim attempts.

The matching SQL is tracked in `migrations/20261120210000_create_contari_tables.sql`. It has already been applied to the connected project. Do not rerun it as a new migration without checking migration history first.

## Authentication

Contari uses passwordless email magic links, not anonymous sign-ins. This gives creators a persistent account to own lockers across devices.

In Supabase Dashboard:

1. Open Authentication → URL Configuration.
2. Set Site URL to `https://contari-ten.vercel.app`.
3. Add `https://contari-ten.vercel.app/**` to Redirect URLs.
4. Add `http://localhost:5173/**` for local development if needed.

Email magic links are enabled by default. The browser uses the publishable key only. Never put a service-role key in the frontend.

## Security boundaries

RLS lets anyone read encrypted locker records, while only signed-in owners can create, update, and delete their lockers. Claim inserts require a signed-in session; owners can read claims for their own lockers.

The schema does not verify Tari signatures. Claim records are untrusted client reports until a verifier or Ootle contract is implemented. The decryption key is still carried in the URL fragment, so anyone with the complete link can extract it.
