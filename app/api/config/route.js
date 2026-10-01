export const dynamic = 'force-dynamic';
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!supabaseUrl || !supabasePublishableKey) {
    return Response.json({ error: 'Supabase public configuration is incomplete.' }, { status: 500 });
  }
  return Response.json({ supabaseUrl, supabasePublishableKey }, { headers: { 'Cache-Control': 'no-store' } });
}
