//curl -X POST -H "Content-Type: application/json" -d @test/fixtures/input.json https://nostr-beefriends.deno.dev/
import * as fs from 'node:fs/promises';
import { generateSecretKey, type NostrEvent } from 'npm:nostr-tools/pure';
import { Mode, Signer } from './src/utils.ts';
import { getResponseEvent } from './src/response.ts';

const main = async () => {
  const text = await fs.readFile('./test/fixtures/input.json', {
    encoding: 'utf8',
  });
  const json = JSON.parse(text);
  const event_req: NostrEvent = json;
  const sk_res = generateSecretKey();
  const signer = new Signer(sk_res);
  const mode: Mode = Mode.Normal;
  const event_res = await getResponseEvent(event_req, signer, mode);
  const request = JSON.stringify(event_req, undefined, 2);
  const response = JSON.stringify(event_res, undefined, 2);
  console.log(request, response);
};

main();
