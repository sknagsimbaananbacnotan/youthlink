const { createClient } = require('@supabase/supabase-js');

function sbServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server environment variables.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authorize(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });

  const sb = sbServer();
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });

  const s = await sb.from('staff_profiles').select('role,active').eq('user_id', user.id).maybeSingle();
  if (s.error) throw s.error;

  if (!s.data?.active || !['admin', 'encoder'].includes(String(s.data.role || '').toLowerCase())) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }
  return user;
}

// Accept strings or recipient objects from YouthLink, then normalize PH mobile numbers.
function extractRawNumber(raw) {
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
  if (!raw || typeof raw !== 'object') return '';

  const candidates = [
    raw.number, raw.mobile, raw.mobile_number, raw.mobileNumber,
    raw.phone, raw.phone_number, raw.phoneNumber,
    raw.contact, raw.contact_number, raw.contactNumber,
    raw.recipient
  ];
  const found = candidates.find(v => v !== undefined && v !== null && String(v).trim());
  return found == null ? '' : String(found);
}

function normalizePhMobile(raw) {
  let n = extractRawNumber(raw).replace(/\D/g, '');
  if (n.startsWith('0063')) n = n.slice(2);
  if (/^9\d{9}$/.test(n)) n = '0' + n;
  if (/^63(9\d{9})$/.test(n)) n = '0' + n.slice(2);
  return /^09\d{9}$/.test(n) ? n : null;
}

function maskNumber(n) {
  return n ? n.slice(0, 4) + '*******' : '(invalid)';
}

function parseSemaphoreResponse(txt) {
  try { return JSON.parse(txt); } catch (_) { return txt; }
}

function semaphoreAccepted(httpOk, payload) {
  if (!httpOk) return false;
  if (!Array.isArray(payload) || payload.length === 0) return false;
  return payload.every(item => {
    const status = String(item?.status || '').toLowerCase();
    return item?.message_id && !['failed', 'refunded'].includes(status);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    await authorize(req);

    const apiKey = process.env.SEMAPHORE_API_KEY;
    const senderName = process.env.SEMAPHORE_SENDER_NAME;

    console.log('SMS REQUEST STARTED');
    console.log('Semaphore API key exists:', !!apiKey);
    console.log('Semaphore sender exists:', !!senderName);

    if (!apiKey) throw new Error('SEMAPHORE_API_KEY is not configured.');

    let b = req.body || {};
    if (typeof b === 'string') {
      try { b = JSON.parse(b || '{}'); }
      catch (_) { return res.status(400).json({ ok: false, error: 'Invalid JSON body.' }); }
    }

    const recipients = Array.isArray(b.recipients) ? b.recipients : [];
    const message = String(b.message || '').trim();

    console.log('Recipient count:', recipients.length);
    console.log('Message length:', message.length);

    if (!recipients.length || !message) {
      return res.status(400).json({ ok: false, error: 'Recipients and message are required.' });
    }

    const results = [];

    for (const raw of recipients) {
      const original = extractRawNumber(raw);
      const number = normalizePhMobile(raw);

      if (!number) {
        console.log('Rejected invalid recipient format:', original ? original.replace(/\d(?=\d{4})/g, '*') : '(empty/object without phone field)');
        results.push({ number: original || '', ok: false, error: 'Invalid Philippine mobile number' });
        continue;
      }

      const form = new URLSearchParams();
      form.set('apikey', apiKey);
      form.set('number', number);
      form.set('message', message);
      if (senderName) form.set('sendername', senderName);

      console.log('Sending SMS to:', maskNumber(number));

      let r;
      try {
        r = await fetch('https://api.semaphore.co/api/v4/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString()
        });
      } catch (fetchError) {
        console.error('SEMAPHORE FETCH ERROR:', fetchError);
        results.push({ number, ok: false, error: 'Unable to connect to Semaphore API', details: fetchError.message });
        continue;
      }

      const txt = await r.text();
      const payload = parseSemaphoreResponse(txt);
      const accepted = semaphoreAccepted(r.ok, payload);

      console.log('Semaphore HTTP status:', r.status);
      console.log('Semaphore response:', txt);
      console.log('Semaphore accepted:', accepted);

      results.push({
        number,
        ok: accepted,
        status: r.status,
        response: payload,
        error: accepted ? undefined : 'Semaphore did not accept the message.'
      });
    }

    const sent = results.filter(x => x.ok).length;
    const failed = results.length - sent;
    console.log(`SMS COMPLETE: ${sent} sent, ${failed} failed`);

    // Keep HTTP 200 for per-recipient failures so the existing YouthLink UI can read sent/failed.
    return res.status(200).json({ ok: failed === 0, sent, failed, results });
  } catch (e) {
    console.error('SEND SMS FATAL ERROR:', e);
    return res.status(e.statusCode || 500).json({ ok: false, error: e.message || 'Server error', type: e.name || 'Error' });
  }
};
