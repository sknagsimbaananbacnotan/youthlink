const { createClient } = require('@supabase/supabase-js');

function sbServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server environment variables.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function authorize(req, sb) {
  const token = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();

  if (!token) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });

  const staff = await sb
    .from('staff_profiles')
    .select('role,active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (staff.error) throw staff.error;

  if (!staff.data?.active ||
      !['admin','encoder'].includes(String(staff.data.role || '').toLowerCase())) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  return user;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const sb = sbServer();
    await authorize(req, sb);

    const { data, error } = await sb
      .from('sms_logs')
      .select('id,created_at,recipient_number,recipient_name,recipient_meta,message,status,semaphore_message_id,semaphore_status,error_message,sent_by,sent_by_email')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ ok: true, logs: data || [] });
  } catch (e) {
    console.error('SMS LOGS API ERROR:', e);
    return res.status(e.statusCode || 500).json({
      ok: false,
      error: e.message || 'Unable to load SMS logs.'
    });
  }
};
