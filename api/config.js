export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabasePublishableKey) return res.status(500).json({ error: 'YouthLink database environment variables are not configured.' });
  return res.status(200).json({ supabaseUrl, supabasePublishableKey });
}
