const { createClient } = require('@supabase/supabase-js');

function sbServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase server environment variables.');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function authorize(req) {
  const token = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();

  if (!token) {
    throw Object.assign(new Error('Unauthorized'), {
      statusCode: 401
    });
  }

  const sb = sbServer();

  const {
    data: { user },
    error
  } = await sb.auth.getUser(token);

  if (error || !user) {
    throw Object.assign(new Error('Unauthorized'), {
      statusCode: 401
    });
  }

  const s = await sb
    .from('staff_profiles')
    .select('role,active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (s.error) throw s.error;

  if (
    !s.data?.active ||
    !['admin', 'encoder'].includes(
      String(s.data.role || '').toLowerCase()
    )
  ) {
    throw Object.assign(new Error('Forbidden'), {
      statusCode: 403
    });
  }

  return user;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        error: 'Method not allowed'
      });
    }

    await authorize(req);

    const apiKey = process.env.SEMAPHORE_API_KEY;
    const senderName = process.env.SEMAPHORE_SENDER_NAME;

    console.log('SMS REQUEST STARTED');
    console.log('Semaphore API key exists:', !!apiKey);
    console.log('Semaphore sender exists:', !!senderName);

    if (!apiKey) {
      throw new Error('SEMAPHORE_API_KEY is not configured.');
    }

    const b =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body || {};

    const recipients = Array.isArray(b.recipients)
      ? b.recipients
      : [];

    const message = String(b.message || '').trim();

    console.log('Recipient count:', recipients.length);
    console.log('Message length:', message.length);

    if (!recipients.length || !message) {
      return res.status(400).json({
        error: 'Recipients and message are required.'
      });
    }

    const results = [];

    for (const raw of recipients) {
      const number = String(raw || '')
        .replace(/\D/g, '');

      if (!/^09\d{9}$/.test(number)) {
        results.push({
          number,
          ok: false,
          error: 'Invalid Philippine mobile number'
        });

        continue;
      }

      const form = new URLSearchParams();

      form.set('apikey', apiKey);
      form.set('number', number);
      form.set('message', message);

      if (senderName) {
        form.set('sendername', senderName);
      }

      console.log(
        'Sending SMS to:',
        number.slice(0, 4) + '*******'
      );

      let r;

      try {
        r = await fetch(
          'https://api.semaphore.co/api/v4/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/x-www-form-urlencoded'
            },
            body: form.toString()
          }
        );
      } catch (fetchError) {
        console.error(
          'SEMAPHORE FETCH ERROR:',
          fetchError
        );

        results.push({
          number,
          ok: false,
          error:
            'Unable to connect to Semaphore API',
          details: fetchError.message
        });

        continue;
      }

      const txt = await r.text();

      console.log(
        'Semaphore HTTP status:',
        r.status
      );

      console.log(
        'Semaphore response:',
        txt
      );

      let semaphoreResponse = txt;

      try {
        semaphoreResponse = JSON.parse(txt);
      } catch (_) {}

      results.push({
        number,
        ok: r.ok,
        status: r.status,
        response: semaphoreResponse
      });
    }

    const sent = results.filter(
      x => x.ok
    ).length;

    const failed = results.length - sent;

    console.log(
      `SMS COMPLETE: ${sent} sent, ${failed} failed`
    );

    return res.status(200).json({
      ok: failed === 0,
      sent,
      failed,
      results
    });

  } catch (e) {

    console.error('SEND SMS FATAL ERROR:', e);

    return res
      .status(e.statusCode || 500)
      .json({
        error:
          e.message ||
          'Server error',
        type:
          e.name ||
          'Error'
      });
  }
};
