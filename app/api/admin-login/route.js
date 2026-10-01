export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// YouthLink now authenticates staff through Supabase Auth on the client.
// This compatibility endpoint intentionally does not use the retired legacy _lib helper.
export async function POST() {
  return Response.json(
    { error: 'Legacy admin login is retired. Use Supabase Auth.' },
    { status: 410 }
  );
}

export async function GET() {
  return Response.json({ ok: true, auth: 'supabase' });
}
