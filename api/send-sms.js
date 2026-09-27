export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.SEMAPHORE_API_KEY;
  const sender = process.env.SEMAPHORE_SENDER_NAME || '';
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Semaphore API key is not configured.' });
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || !supabaseUrl || !supabaseKey) return res.status(401).json({ error: 'Unauthorized.' });
  const token = auth.slice(7);
  const u = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` } });
  if (!u.ok) return res.status(401).json({ error: 'Invalid or expired YouthLink session.' });
  const { recipients = [], message = '' } = req.body || {};
  if (!message.trim() || !Array.isArray(recipients) || !recipients.length) return res.status(400).json({ error: 'Recipients and message are required.' });
  if (recipients.length > 500) return res.status(400).json({ error: 'Recipient limit exceeded.' });
  const numbers = [...new Set(recipients.map(r => String(r.mobile || '').replace(/\D/g, '')).filter(n => /^639\d{9}$/.test(n)))];
  if (!numbers.length) return res.status(400).json({ error: 'No valid Philippine mobile numbers.' });
  const body = new URLSearchParams({ apikey: apiKey, number: numbers.join(','), message: message.trim() });
  if (sender) body.set('sendername', sender);
  const r = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const data = await r.json().catch(() => null);
  if (!r.ok) return res.status(r.status).json({ error: 'Semaphore rejected the SMS request.', details: data });
  return res.status(200).json({ sent: numbers.length, provider: data });
}
