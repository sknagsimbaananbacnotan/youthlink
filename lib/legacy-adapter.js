export async function runLegacy(handler, request) {
  let body = undefined;
  if (!['GET','HEAD'].includes(request.method)) {
    const text = await request.text();
    if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  }
  const url = new URL(request.url);
  const headersObj = Object.fromEntries(request.headers.entries());
  const req = { method: request.method, headers: headersObj, body, query: Object.fromEntries(url.searchParams.entries()), url: url.pathname + url.search };
  let statusCode = 200; const outHeaders = new Headers(); let payload = null;
  const res = {
    status(code){ statusCode=code; return this; },
    setHeader(k,v){ outHeaders.set(k, Array.isArray(v)?v.join(', '):String(v)); return this; },
    json(data){ payload = JSON.stringify(data); if(!outHeaders.has('content-type')) outHeaders.set('content-type','application/json; charset=utf-8'); return this; },
    send(data){ payload = typeof data==='string'?data:JSON.stringify(data); return this; },
    end(data=''){ payload = String(data); return this; }
  };
  await handler(req,res);
  return new Response(payload ?? '', { status: statusCode, headers: outHeaders });
}
