import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import * as fs from 'node:fs/promises';
import {
  generateSecretKey,
  getPublicKey,
  type NostrEvent,
} from 'npm:nostr-tools/pure';
import * as nip19 from 'npm:nostr-tools/nip19';
import { Mode, Signer } from '../src/utils.ts';
import { getResponseEvent } from '../src/response.ts';

Deno.test('get response with JSON file', async () => {
  const sk = generateSecretKey();
  const text = await fs.readFile('./test/fixtures/input.json', {
    encoding: 'utf8',
  });
  const json = JSON.parse(text);
  const event: NostrEvent = json;
  const signer = new Signer(sk);
  const mode: Mode = Mode.Normal;
  const actual = await getResponseEvent(event, signer, mode);
  const quote = nip19.noteEncode(event.id);
  const expected = {
    kind: event.kind,
    pubkey: getPublicKey(sk),
    created_at: event.created_at + 1,
    content: `3ねるねです！\nnostr:${quote}`,
    tags: [
      ...event.tags.filter(
        (tag: string[]) =>
          tag.length >= 4 && tag[0] === 'e' && tag[3] === 'root',
      ),
      ['q', event.id],
    ],
  };
  assert(actual !== null);
  assertEquals(actual.kind, expected.kind);
  assertEquals(actual.pubkey, expected.pubkey);
  assertEquals(actual.created_at, expected.created_at);
  assertEquals(actual.tags, expected.tags);
  assertEquals(actual.content, expected.content);
});
