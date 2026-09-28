const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase server environment variables.');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function requireAuthenticatedUser(req) {
  const token = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();

  if (!token) {
    const e = new Error('Unauthorized');
    e.statusCode = 401;
    throw e;
  }

  const admin = getSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);

  if (error || !user) {
    const e = new Error('Unauthorized');
    e.statusCode = 401;
    throw e;
  }

  // Current YouthLink uses Supabase Auth for the private admin system.
  // Do not depend on staff_profiles, which caused the false 403 Forbidden.
  return { admin, user };
}

module.exports = async (req, res) => {
  try {
    const { admin: sb, user } = await requireAuthenticatedUser(req);

    if (req.method === 'GET') {
      const q = await sb
        .from('kk_profile_submissions')
        .select('*')
        .order('submitted_at', { ascending: false })
        .limit(500);

      if (q.error) throw q.error;
      return res.status(200).json({ submissions: q.data || [] });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id, decision, note } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Submission ID is required.' });

    const q = await sb
      .from('kk_profile_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (q.error) throw q.error;
    if (!q.data) return res.status(404).json({ error: 'Submission not found' });

    const x = q.data;

    if (x.status !== 'PENDING' && x.status !== 'NEEDS_REVIEW') {
      return res.status(409).json({ error: 'Submission already reviewed' });
    }

    if (decision === 'reject') {
      const u = await sb
        .from('kk_profile_submissions')
        .update({
          status: 'REJECTED',
          admin_notes: note || '',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id
        })
        .eq('id', id);

      if (u.error) throw u.error;
      return res.status(200).json({ message: 'Submission rejected.' });
    }

    if (decision !== 'approve') {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    const member = {
      first_name: x.first_name,
      middle_name: x.middle_name,
      last_name: x.last_name,
      suffix: x.suffix,
      full_name: [x.first_name, x.middle_name, x.last_name, x.suffix].filter(Boolean).join(' '),
      birth_date: x.date_of_birth,
      sector: x.sector,
      sex_assigned_at_birth: x.sex,
      civil_status: x.civil_status,
      youth_classification: x.youth_classification,
      specific_needs_indicator: x.youth_specific_needs,
      email: x.email,
      contact_number: x.contact_number,
      region: x.region,
      province: x.province,
      municipality: x.municipality,
      barangay: x.barangay,
      home_address: x.home_address,
      educational_attainment: x.educational_attainment,
      work_status: x.work_status,
      registered_sk_voter: x.registered_sk_voter,
      registered_national_voter: x.registered_national_voter,
      voted_last_sk_election: x.voted_last_sk_election,
      attended_kk_assembly: x.attended_kk_assembly,
      kk_assembly_times: x.kk_assembly_times,
      kk_assembly_no_reason: x.kk_assembly_no_reason,
      profile_source: 'PUBLIC_KK_PROFILING',
      last_public_profile_update: new Date().toISOString()
    };

    if (x.matched_member_id) {
      const u = await sb.from('kk_members').update(member).eq('id', x.matched_member_id);
      if (u.error) throw u.error;
    } else {
      const ids = await sb.from('kk_members').select('youthlink_id');
      if (ids.error) throw ids.error;

      const max = Math.max(
        0,
        ...(ids.data || []).map(r =>
          Number((String(r.youthlink_id || '').match(/^KK-NAGS-(\d+)$/) || [])[1] || 0)
        )
      );

      member.youthlink_id = 'KK-NAGS-' + String(max + 1).padStart(3, '0');
      member.archived = false;

      const i = await sb.from('kk_members').insert(member);
      if (i.error) throw i.error;
    }

    const done = await sb
      .from('kk_profile_submissions')
      .update({
        status: 'APPROVED',
        admin_notes: note || '',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id
      })
      .eq('id', id);

    if (done.error) throw done.error;

    return res.status(200).json({
      message: x.matched_member_id
        ? 'Existing KK record updated.'
        : 'New KK member added to YouthLink.'
    });

  } catch (e) {
    console.error('profile-admin error:', e);
    return res.status(e.statusCode || 500).json({ error: e.message || 'Server error' });
  }
};
