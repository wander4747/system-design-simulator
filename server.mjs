import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 8080;
const ALLOWED = new Set(['index.html', 'style.css', 'src']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const rel = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(
      /^[/\\]+/,
      '',
    );
    const file = join(ROOT, rel);
    const top = rel.split(sep)[0];
    if (!file.startsWith(ROOT + sep) || !ALLOWED.has(top) || !TYPES[extname(file)]) throw new Error('forbidden');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)], 'X-Content-Type-Options': 'nosniff' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(PORT, '0.0.0.0', () => console.log(`http://localhost:${PORT}`));
