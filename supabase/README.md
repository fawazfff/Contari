# Contari Supabase setup

The Contari schema is created in the connected Supabase project with `contari_lockers` and `contari_claims`. Encrypted content only is stored in the database. The AES-GCM decryption key is kept in the URL fragment and is not sent to Supabase.

For local development, copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

In the Supabase dashboard, open **Authentication → Sign In / Providers** and enable **Anonymous Sign-Ins**. Contari uses anonymous Supabase Auth sessions to assign locker ownership without asking creators for email or password. Public locker reads use the `anon` role; locker creation and owner management require an authenticated anonymous session.

The browser wallet connector and server-side Tari signature verification are separate from Supabase. A recorded client-side wallet response is not equivalent to cryptographic signature verification or an on-chain access-control decision.
