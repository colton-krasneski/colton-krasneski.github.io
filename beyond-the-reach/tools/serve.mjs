/* Tiny static server so the page runs on http://localhost instead of file://
   (some APIs reject requests from a file:// origin).   node tools/serve.mjs  */
import http from 'node:http'; import fs from 'node:fs';
import path from 'node:path'; import url from 'node:url';
const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.mp3':'audio/mpeg', '.json':'application/json', '.svg':'image/svg+xml' };
const port = Number(process.argv[2]) || 8123;
http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root) || /(^|[\/])\.env/.test(rel)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(buf);
  });
}).listen(port, () => console.log(`BEYOND THE REACH → http://localhost:${port}/`));
