# YouthLink — Next.js + Supabase

Migration build for SK Nagsimbaanan.

## What is migrated
- Next.js App Router project
- Native Next.js `/profiling` React form
- Existing server API business logic exposed through Next.js Route Handlers under `/api/*`
- Existing Supabase database/Auth retained; no data reset
- Existing YouthLink admin is retained under a compatibility frame while its large dashboard is progressively componentized, so current production functions are not lost during cut-over.
- Existing logo/header assets retained

## Environment variables (Vercel)
Copy `.env.example` names and set the same production values already used by YouthLink. Do not commit secrets.

## Deploy
1. Upload the contents of this folder to the GitHub repository root.
2. In Vercel, Framework Preset should detect Next.js.
3. Keep/add the environment variables.
4. Deploy.
5. Test sign-in, KK records, profiling submission, SMS, communication history, Budget & Finance, documents, and audit trail before replacing the current production deployment.

## Important
The existing Supabase project remains the source of truth. Do not create a new Supabase project and do not run destructive SQL for this migration.

## Migration fixes included
- Corrected Next.js Route Handler import paths for all legacy API adapters.
- Added `/api/config` for the existing YouthLink Supabase client bootstrap.
- Kept `/api/*` URLs compatible with the legacy admin while migrating.
- Added legacy-relative copies of the logo/header assets.
- Do not upload the old root `vercel.json` from the static HTML deployment; Next.js should use Vercel's automatic framework detection.
