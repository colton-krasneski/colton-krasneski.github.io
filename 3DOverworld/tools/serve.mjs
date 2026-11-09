/* Tiny static server, so the page runs on http://localhost rather than
   file:// - browsers refuse to load ES modules off the disk.
        node tools/serve.mjs  [port]                                      */
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.txt': 'text/plain' };
const port = Number(process.argv[2]) || 8124;
http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    }).end(buf);
  });
}).listen(port, () => console.log(`OVERWORLD → http://localhost:${port}/`));
