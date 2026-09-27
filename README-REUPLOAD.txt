YOUTHLINK FINAL SMS UPDATE

Upload/replace these in the ROOT of the GitHub repository:
- index.html
- logo.png
- vercel.json
- api/config.js
- api/send-sms.js

Keep the api folder as a folder.

Required Vercel Environment Variables:
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)
SEMAPHORE_API_KEY
SEMAPHORE_SENDER_NAME (optional/approved sender name)

Do NOT place API keys inside index.html or GitHub.

Included SMS types:
Official Advisory; Meeting Notice; Schedule Change; Reminder; Event Notice;
Birthday Greeting; Program Invitation; Registration Confirmation;
Attendance/Participation Notice; Emergency Alert.

Emergency subtypes:
Typhoon/Severe Weather; Flood Alert; Evacuation Notice; Earthquake Advisory;
Power/Utility Interruption; Other Emergency.

Events & Attendance now includes Send SMS to Attendees. It opens SMS Center,
selects Selected Event Attendees, and prepares the Attendance/Participation template.
