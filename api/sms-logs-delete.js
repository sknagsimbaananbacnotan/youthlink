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

  const role = String(staff.data?.role || '').toLowerCase();
  if (!staff.data?.active || !['admin', 'encoder'].includes(role)) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  return { user, role };
}

module.exports = async (req, res) => {
  try {
    const sb = sbServer();
    const auth = await authorize(req, sb);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('sms_logs')
        .select(`
          id,
          created_at,
          recipient_number,
          recipient_name,
          recipient_meta,
          message,
          status,
          semaphore_message_id,
          semaphore_status,
          error_message,
          sent_by_email
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        count: (data || []).length,
        logs: data || []
      });
    }

    if (req.method === 'DELETE') {
      if (auth.role !== 'admin') {
        return res.status(403).json({
          ok: false,
          error: 'Only an ADMIN account can delete SMS history.'
        });
      }

      const id = String(req.body?.id || '').trim();
      if (!id) {
        return res.status(400).json({ ok: false, error: 'SMS log ID is required.' });
      }

      const { data, error } = await sb
        .from('sms_logs')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({
          ok: false,
          error: 'SMS record was not found or was already deleted.'
        });
      }

      return res.status(200).json({ ok: true, deleted_id: data.id });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (e) {
    console.error('SMS LOGS API ERROR:', e);
    return res.status(e.statusCode || 500).json({
      ok: false,
      error: e.message || 'Unable to process SMS logs request.',
      code: e.code || null
    });
  }
};
