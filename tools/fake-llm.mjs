#!/usr/bin/env node
/**
 * A stand-in model endpoint, for proving the real fetch path works without
 * needing a model or a key.
 *
 * Speaks enough of the OpenAI-compatible and Anthropic shapes for the game to
 * talk to it, and can be told to misbehave so the failure paths can be
 * exercised on purpose.
 *
 *   node tools/fake-llm.mjs                 # answers sensibly
 *   node tools/fake-llm.mjs --mode=garbage  # replies that fail the schema
 *   node tools/fake-llm.mjs --mode=slow     # never answers, to test the timeout
 *   node tools/fake-llm.mjs --mode=500      # server error
 *   node tools/fake-llm.mjs --no-cors       # omits the headers a browser needs
 */
import { createServer } from 'node:http';

const args = process.argv.slice(2);
const mode = (args.find((a) => a.startsWith('--mode=')) ?? '--mode=good').split('=')[1];
const cors = !args.includes('--no-cors');
const port = Number((args.find((a) => a.startsWith('--port=')) ?? '--port=11435').split('=')[1]);

const GOOD = JSON.stringify({
  say: 'Hold on to something.',
  actions: [{ type: 'sculpt', shape: 'raise', at: { x: 32, y: 14, z: 32 }, radius: 6, amount: 3 }],
});
const GARBAGE = JSON.stringify({ say: 'Resetting.', actions: [{ type: 'exec', code: 'oops' }] });

function send(response, status, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cors) {
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Headers'] = '*';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  response.writeHead(status, headers);
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = createServer((request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, '');

  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    if (mode === 'slow') return; // never answers, so the client's timeout fires
    if (mode === '500') return send(response, 500, { error: 'on purpose' });
    if (mode === '401') return send(response, 401, { error: 'no key' });

    const content = mode === 'garbage' ? GARBAGE : GOOD;
    const anthropic = request.url?.includes('/v1/messages');
    send(
      response,
      200,
      anthropic
        ? { content: [{ type: 'text', text: content }] }
        : { choices: [{ message: { content } }] },
    );
  });
});

server.listen(port, () => {
  console.log(
    `fake model listening on http://localhost:${String(port)} (mode: ${mode}, cors: ${String(cors)})`,
  );
});
