'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
// Serve every renderer asset (index.html loads several scripts and stylesheets). Flat file names only; no traversal.
const rendererDir = path.join(__dirname, '../src/renderer');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const files = new Map([['/', ['index.html', types['.html']]]]);
for (const name of fs.readdirSync(rendererDir)) if (/^[\w.-]+\.(html|css|js)$/.test(name)) files.set('/' + name, [name, types[path.extname(name)]]);
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://preview.invalid').pathname; }
  catch { res.writeHead(400); res.end(); return; }
  const entry = files.get(pathname);
  if (!entry || !['GET','HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(path.join(rendererDir, entry[0])).pipe(res);
});
const port = Number(process.env.PORT || 8081);
server.listen(port, '0.0.0.0', () => console.log(`Arena Core UI preview on port ${port}. Static UI only; run npm start for desktop capabilities.`));
