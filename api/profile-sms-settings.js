const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase server environment variables.');
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function requireAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const sb = getSupabase();
  const {
    data: { user },
    error
  } = await sb.auth.getUser(token);

  if (error || !user) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  /*
    IMPORTANT:
    The previous version required a matching staff_profiles row with:
      active = true
      role = admin or encoder

    That check was the source of the 403 "Forbidden" in the current
    YouthLink installation. This endpoint still requires a valid
    Supabase-authenticated session, but no longer depends on staff_profiles.
  */
  return { sb, user };
}

const NEW_TEMPLATE = `YOUTHLINK: Magandang araw, KK {FULL_NAME}! Natanggap na namin ang iyong KK Profiling Information.
Reference No.: {REFERENCE_NO}

Ang iyong impormasyon ay subject to verification by SK Nagsimbaanan.

Maraming salamat sa iyong pakikiisa!

-Sangguniang Kabataan ng Nagsimbaanan, Bacnotan, La Union
This is an automated message.`;

const EXISTING_TEMPLATE = `YOUTHLINK: Magandang araw, KK {FULL_NAME}! Natanggap na namin ang update sa iyong KK Profiling Information.
Reference No.: {REFERENCE_NO}

Ibe-verify muna ang iyong impormasyon bago ma-update ang official record.

Maraming salamat sa iyong pakikiisa!

-Sangguniang Kabataan ng Nagsimbaanan, Bacnotan, La Union
This is an automated message.`;

module.exports = async function handler(req, res) {
  try {
    const { sb, user } = await requireAuthenticatedUser(req);

    if (req.method === 'GET') {
      const { data, error } = await sb
        .from('youthlink_settings')
        .select('setting_key,setting_value')
        .in('setting_key', [
          'profiling_sms_new',
          'profiling_sms_existing'
        ]);

      if (error) throw error;

      const settings = Object.fromEntries(
        (data || []).map(row => [row.setting_key, row.setting_value])
      );

      return res.status(200).json({
        newTemplate: settings.profiling_sms_new || NEW_TEMPLATE,
        existingTemplate:
          settings.profiling_sms_existing || EXISTING_TEMPLATE
      });
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string'
          ? JSON.parse(req.body || '{}')
          : (req.body || {});

      const newTemplate = String(body.newTemplate || '').trim();
      const existingTemplate = String(body.existingTemplate || '').trim();

      if (!newTemplate || !existingTemplate) {
        return res.status(400).json({
          error: 'Both templates are required.'
        });
      }

      const now = new Date().toISOString();

      const rows = [
        {
          setting_key: 'profiling_sms_new',
          setting_value: newTemplate,
          updated_by: user.id,
          updated_at: now
        },
        {
          setting_key: 'profiling_sms_existing',
          setting_value: existingTemplate,
          updated_by: user.id,
          updated_at: now
        }
      ];

      const { error } = await sb
        .from('youthlink_settings')
        .upsert(rows, { onConflict: 'setting_key' });

      if (error) throw error;

      return res.status(200).json({
        ok: true,
        message: 'Profiling SMS templates saved successfully.'
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });

  } catch (error) {
    console.error('profile-sms-settings error:', error);

    const status =
      error.statusCode ||
      (error.message === 'Unauthorized' ? 401 : 500);

    return res.status(status).json({
      error: error.message || 'Server error.'
    });
  }
};
