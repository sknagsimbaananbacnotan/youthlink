YOUTHLINK — VERCEL READY FILES

Upload these to the ROOT of the existing GitHub repository:
  index.html
  vercel.json
  api/send-sms.js   (inside an api folder)

Vercel Environment Variables required:
  SEMAPHORE_API_KEY      = your actual Semaphore API key (Secret)
  SEMAPHORE_SENDER_NAME  = your approved Semaphore sender name

After GitHub commit/push:
1. Vercel will normally deploy automatically if GitHub is connected.
2. If needed, open Vercel > YouthLink > Deployments and redeploy the latest commit.
3. Open the live YouthLink URL.
4. SMS Center > choose a recipient/group > type message > Review & Send.

IMPORTANT:
- Never put the Semaphore API key inside index.html or GitHub.
- The current YouthLink member/event database in this version still uses browser/localStorage for members and in-memory sample events. Supabase migration is a separate next step.
- The Supabase environment variables are not used by this package yet, because the supplied index.html has not yet been converted from localStorage to Supabase database calls.
