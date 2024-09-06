import { base } from './base.ts';
import { Mode } from './utils.ts';

Deno.serve(async (req) => {
  console.log('Method:', req.method);
  if (req.method !== 'POST') {
    const body = JSON.stringify({ error: 'Method Not Allowed' });
    return new Response(body, {
      status: 405,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        Allow: 'POST',
      },
    });
  }
  if (req.body) {
    const body = await req.text();
    const mode: Mode = Mode.Normal;
    return await base(body, mode);
  } else {
    const body = JSON.stringify({ error: 'message body is not found' });
    return new Response(body, {
      status: 400,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }
});
