import { base } from './base.ts';
import { Mode } from './utils.ts';

Deno.serve(async (req) => {
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
    const url = new URL(req.url);
    let mode: Mode | undefined;
    switch (url.pathname) {
      case '/normal':
        mode = Mode.Normal;
        break;
      case '/reply':
        mode = Mode.Reply;
        break;
      case '/fav':
        mode = Mode.Fav;
        break;
      default:
        break;
    }
    if (mode === undefined) {
      const body = JSON.stringify({ error: '404 not found' });
      return new Response(body, {
        status: 404,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      });
    }
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
