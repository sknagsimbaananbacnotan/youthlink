YOUTHLINK FINAL AUTH VERSION — NEXT STEPS

1. SUPABASE
   Open SQL Editor > New Query.
   Paste ALL contents of YOUTHLINK_FINAL_AUTH_RLS.sql and click Run.
   Expected result: YOUTHLINK SECURE AUTH/RLS PATCH COMPLETE

2. GITHUB
   In the youthlink repository, replace:
   - index.html
   - api/config.js
   - api/send-sms.js
   - vercel.json
   Do NOT upload the SQL file to the public repo. It is only for Supabase setup.

3. VERCEL
   Let GitHub trigger a new deployment, or Redeploy the latest commit.
   Keep these Production environment variables:
   SUPABASE_URL
   SUPABASE_PUBLISHABLE_KEY
   SEMAPHORE_API_KEY
   SEMAPHORE_SENDER_NAME

4. TEST
   Open the production YouthLink site.
   It should show the YouthLink Sign In screen first.
   Sign in using the Supabase Auth account you created.
   The UID of that account must already exist in public.staff_profiles with:
   role = admin (or encoder)
   active = true

5. VERIFY
   Add ONE temporary KK member.
   Check Supabase > Table Editor > kk_members.
   Then test Edit, Archive/Restore, Event + Attendance, Delete Event, and SMS.

SECURITY
- The old anonymous read/write policies are removed.
- Only authenticated active staff can read YouthLink records.
- Only admin/encoder roles can modify records.
- The Semaphore endpoint now requires a valid YouthLink session and admin/encoder role.
- Never place SEMAPHORE_API_KEY inside index.html.
