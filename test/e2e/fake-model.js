// A tiny stand-in for llama.cpp's server, enough to test components that
// call /completion with n_probs. Answers in the current llama.cpp format.

import { createServer } from 'node:http';

const WORDS = [' the', ' a', ' energy', ' plants', ' sugar', ' light', ' and', ' into', ' water', ' oxygen'];

export function startFakeModel(port = 0) {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const { prompt = '', n_probs: n = 10 } = JSON.parse(body || '{}');
      // Shift the list with the prompt length so each step looks different.
      const shift = prompt.length % WORDS.length;
      const words = [...WORDS.slice(shift), ...WORDS.slice(0, shift)].slice(0, n);
      const weights = words.map((_, i) => 1 / (i + 1.5));
      const sum = weights.reduce((a, b) => a + b, 0);
      const top = words.map((w, i) => ({ id: i, token: w, logprob: Math.log(weights[i] / sum) }));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        content: top[0].token,
        completion_probabilities: [{ ...top[0], top_logprobs: top }],
      }));
    });
  });
  return new Promise((ok) => {
    server.listen(port, '127.0.0.1', () => ok({ port: server.address().port, close: () => server.close() }));
  });
}
