const SEMAPHORE_URL = 'https://api.semaphore.co/api/v4/messages';

function normalizePHMobile(value) {
  let n = String(value || '').replace(/\D/g, '');
  if (n.startsWith('63') && n.length === 12) return n;
  if (n.startsWith('0') && n.length === 11) return '63' + n.slice(1);
  if (n.startsWith('9') && n.length === 10) return '63' + n;
  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.SEMAPHORE_API_KEY;
  const senderName = process.env.SEMAPHORE_SENDER_NAME;
  if (!apiKey) return res.status(500).json({ error: 'SEMAPHORE_API_KEY is not configured in Vercel.' });
  if (!senderName) return res.status(500).json({ error: 'SEMAPHORE_SENDER_NAME is not configured in Vercel.' });

  const message = String(req.body?.message || '').trim();
  const input = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  if (message.length > 2000) return res.status(400).json({ error: 'Message is too long.' });

  const numbers = [...new Set(input.map(x => normalizePHMobile(typeof x === 'string' ? x : x?.mobile)).filter(Boolean))];
  if (!numbers.length) return res.status(400).json({ error: 'No valid Philippine mobile numbers supplied.' });
  if (numbers.length > 500) return res.status(400).json({ error: 'Maximum 500 recipients per request.' });

  const results = [];
  for (const number of numbers) {
    const body = new URLSearchParams({apikey: apiKey, number, message, sendername: senderName});
    const response = await fetch(SEMAPHORE_URL, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body});
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!response.ok) return res.status(502).json({ error: 'Semaphore rejected an SMS request.', number, details: data });
    results.push({number, response: data});
  }
  return res.status(200).json({ok: true, sent: results.length, results});
}
