const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const clean = v => String(v || '').trim().replace(/\s+/g, ' ');
const fullName = p =>
  [p.first_name, p.middle_name, p.last_name, p.suffix]
    .map(clean).filter(Boolean).join(' ').toUpperCase();

function normalizePHNumber(value) {
  let n = clean(value).replace(/[^\d+]/g, '');
  if (/^09\d{9}$/.test(n)) return n;
  if (/^\+639\d{9}$/.test(n)) return '0' + n.slice(3);
  if (/^639\d{9}$/.test(n)) return '0' + n.slice(2);
  return n;
}

async function sendConfirmationSMS(p, referenceNo, isExisting, sb) {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  const number = normalizePHNumber(p.contact_number);

  if (!apiKey) {
    console.error('Profiling SMS skipped: SEMAPHORE_API_KEY is missing.');
    return { sent: false, reason: 'SEMAPHORE_API_KEY is missing' };
  }
  if (!number) return { sent: false, reason: 'Contact number is missing' };

  const defaults = {
    new: `YOUTHLINK: Magandang araw, KK {FULL_NAME}! Natanggap na namin ang iyong KK Profiling Information.
Reference No.: {REFERENCE_NO}

Ang iyong impormasyon ay subject to verification by SK Nagsimbaanan.

Maraming salamat sa iyong pakikiisa!

-Sangguniang Kabataan ng Nagsimbaanan, Bacnotan, La Union
This is an automated message.`,
    existing: `YOUTHLINK: Magandang araw, KK {FULL_NAME}! Natanggap na namin ang update sa iyong KK Profiling Information.
Reference No.: {REFERENCE_NO}

Ibe-verify muna ang iyong impormasyon bago ma-update ang official record.

Maraming salamat sa iyong pakikiisa!

-Sangguniang Kabataan ng Nagsimbaanan, Bacnotan, La Union
This is an automated message.`
  };

  let template = isExisting ? defaults.existing : defaults.new;

  try {
    const q = await sb
      .from('youthlink_settings')
      .select('setting_value')
      .eq('setting_key', isExisting ? 'profiling_sms_existing' : 'profiling_sms_new')
      .maybeSingle();

    if (!q.error && q.data?.setting_value) template = q.data.setting_value;
  } catch (e) {
    console.error('SMS template load failed; using default:', e);
  }

  const message = template
    .replaceAll('{FULL_NAME}', fullName(p))
    .replaceAll('{FIRST_NAME}', clean(p.first_name).toUpperCase())
    .replaceAll('{REFERENCE_NO}', referenceNo);

  const body = new URLSearchParams({
    apikey: apiKey,
    number,
    message
  });

  if (process.env.SEMAPHORE_SENDER_NAME) {
    body.set('sendername', process.env.SEMAPHORE_SENDER_NAME);
  }

  try {
    const r = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    const text = await r.text();

    if (!r.ok) {
      console.error('Profiling confirmation SMS failed:', r.status, text);
      return { sent: false, reason: `Semaphore HTTP ${r.status}` };
    }

    let response;
    try { response = JSON.parse(text); } catch { response = text; }

    // Semaphore can return an error payload even when transport succeeds.
    if (response && !Array.isArray(response) && response.error) {
      console.error('Semaphore returned an error:', response);
      return { sent: false, reason: String(response.error) };
    }

    console.log('Profiling confirmation SMS accepted by Semaphore.');
    return { sent: true };
  } catch (e) {
    console.error('Profiling confirmation SMS error:', e);
    return { sent: false, reason: e.message || 'SMS request failed' };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) throw new Error('Server database configuration is incomplete');

    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const p = req.body || {};
    const contactNumber = normalizePHNumber(p.contact_number);

    for (const f of ['first_name', 'last_name', 'birth_date', 'sector', 'contact_number', 'home_address']) {
      if (!clean(p[f])) return res.status(400).json({ error: 'Please complete all required fields.' });
    }

    if (!/^09\d{9}$/.test(contactNumber)) {
      return res.status(400).json({ error: 'Enter a valid Philippine mobile number.' });
    }

    const q = await sb
      .from('kk_members')
      .select('id,youthlink_id,first_name,middle_name,last_name,suffix,birth_date')
      .ilike('first_name', clean(p.first_name))
      .ilike('last_name', clean(p.last_name))
      .eq('birth_date', p.birth_date)
      .limit(2);

    if (q.error) throw q.error;

    const match = (q.data || [])[0] || null;
    const ref =
      'KKP-' +
      new Date().toISOString().slice(0, 10).replace(/-/g, '') +
      '-' +
      crypto.randomBytes(3).toString('hex').toUpperCase();

    const row = {
      reference_no: ref,
      matched_member_id: match?.id || null,
      first_name: clean(p.first_name),
      middle_name: clean(p.middle_name),
      last_name: clean(p.last_name),
      suffix: clean(p.suffix),
      date_of_birth: p.birth_date,
      sector: String(p.sector),
      sex: p.sex_assigned_at_birth || '',
      civil_status: p.civil_status || '',
      youth_classification: p.youth_classification || '',
      youth_specific_needs: p.specific_needs_indicator || '',
      email: clean(p.email),
      contact_number: contactNumber,
      region: 'Region I',
      province: 'La Union',
      municipality: 'Bacnotan',
      barangay: 'Nagsimbaanan',
      home_address: clean(p.home_address),
      educational_attainment: p.educational_attainment || '',
      work_status: p.work_status || '',
      registered_sk_voter: p.registered_sk_voter || '',
      registered_national_voter: p.registered_national_voter || '',
      voted_last_sk_election: p.voted_last_sk_election || '',
      attended_kk_assembly: p.attended_kk_assembly || '',
      kk_assembly_times: p.kk_assembly_times || '',
      kk_assembly_no_reason: p.kk_assembly_no_reason || '',
      submission_type: match ? 'UPDATE' : 'NEW',
      status: 'PENDING',
      privacy_consent: true
    };

    const ins = await sb.from('kk_profile_submissions').insert(row);
    if (ins.error) throw ins.error;

    const sms = await sendConfirmationSMS(p, ref, !!match, sb);

    return res.status(200).json({
      ok: true,
      referenceNo: ref,
      matchType: match ? 'existing' : 'new',
      smsSent: sms.sent,
      smsStatus: sms.sent ? 'accepted' : 'not_sent',
      smsReason: sms.sent ? undefined : sms.reason
    });

  } catch (e) {
    console.error('profile-submit error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
