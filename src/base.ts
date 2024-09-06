import {
  type NostrEvent,
  type VerifiedEvent,
  validateEvent,
  verifyEvent,
} from 'npm:nostr-tools/pure';
import * as nip19 from 'npm:nostr-tools/nip19';
import { Mode, Signer } from './utils.ts';
import { getResponseEvent } from './response.ts';

//入力イベントを検証するかどうか(デバッグ時は無効化した方が楽)
const verifyInputEvent = true;

export const base = async (rawBody: string, mode: Mode): Promise<Response> => {
  //署名用インスタンスを準備
  const nsec = Deno.env.get('NOSTR_PRIVATE_KEY');
  if (nsec === undefined) {
    const body = JSON.stringify({ error: 'NOSTR_PRIVATE_KEY is undefined' });
    return new Response(body, {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }
  const dr = nip19.decode(nsec);
  if (dr.type !== 'nsec') {
    const body = JSON.stringify({ error: 'NOSTR_PRIVATE_KEY is not `nsec`' });
    return new Response(body, {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }
  const seckey = dr.data;
  const signer = new Signer(seckey);
  //入力イベントを準備
  let requestBody: any;
  try {
    requestBody = JSON.parse(rawBody);
  } catch (_error) {
    const body = JSON.stringify({ error: 'JSON parse failed' });
    return new Response(body, {
      status: 400,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }
  const requestEvent: NostrEvent = requestBody;
  if (!validateEvent(requestEvent)) {
    const body = JSON.stringify({ error: 'Invalid event' });
    return new Response(body, {
      status: 400,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }
  if (verifyInputEvent && !verifyEvent(requestEvent)) {
    const body = JSON.stringify({ error: 'Unverified event' });
    return new Response(body, {
      status: 400,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }
  //出力イベントを取得
  let responseEvent: VerifiedEvent | null;
  try {
    responseEvent = await getResponseEvent(requestEvent, signer, mode);
  } catch (error) {
    let body;
    if (error instanceof Error) {
      body = JSON.stringify({ error: error.message });
    } else {
      console.warn(error);
      body = JSON.stringify({ error: 'Unexpected error' });
    }
    return new Response(body, {
      status: 400,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }
  //出力
  if (responseEvent === null) {
    const body = '';
    return new Response(body, {
      status: 204,
    });
  }
  const body = JSON.stringify(responseEvent);
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
};
