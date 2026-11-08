// A shared-secret gate in front of a local Ollama, for exposing it through a tunnel when the app is deployed elsewhere.
// Forwards a request to Ollama only when its X-Gate-Key header equals GATE_KEY, and returns 401 otherwise.
//
//   GATE_KEY=<secret> node scripts/ollama-gate.mjs          # listens on 127.0.0.1:11435
//   cloudflared tunnel --url http://127.0.0.1:11435         # prints the public https URL
//
// The deployed app then sets OLLAMA_URL=<that URL> and OLLAMA_HEADERS={"X-Gate-Key":"<secret>"}.

import { createServer, request } from "node:http";
import { timingSafeEqual } from "node:crypto";

const KEY = process.env.GATE_KEY;
if (!KEY || KEY.length < 16) {
  console.error("Set GATE_KEY to a secret of at least 16 characters.");
  process.exit(1);
}
const PORT = Number(process.env.GATE_PORT ?? 11435);
const OLLAMA = new URL(process.env.OLLAMA_TARGET ?? "http://127.0.0.1:11434");
const expected = Buffer.from(KEY);

function allowed(header) {
  const got = Buffer.from(typeof header === "string" ? header : "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

createServer((req, res) => {
  if (!allowed(req.headers["x-gate-key"])) {
    res.writeHead(401).end("unauthorized");
    return;
  }
  const { "x-gate-key": _key, ...headers } = req.headers;
  const upstream = request(
    { hostname: OLLAMA.hostname, port: OLLAMA.port, path: req.url, method: req.method, headers: { ...headers, host: OLLAMA.host } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502);
    res.end(`ollama unreachable: ${e.message}`);
  });
  req.pipe(upstream);
}).listen(PORT, "127.0.0.1", () => console.log(`ollama-gate on http://127.0.0.1:${PORT} -> ${OLLAMA.origin}`));
