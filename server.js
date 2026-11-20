// server.js - Servidor HTTP estático nativo para "Abrimela si podés"
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_TYPES));
const ALLOWED_DIRS = new Set(['css', 'js', 'assets']);

const server = http.createServer((req, res) => {
    // 1. Only allow GET and HEAD methods
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Allow': 'GET, HEAD',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'
        });
        res.end('405 Method Not Allowed');
        return;
    }

    // 2. Decode URL safely and handle malformed percent-encoding
    let decodedUrl;
    try {
        decodedUrl = decodeURIComponent(req.url.split('?')[0]);
    } catch (e) {
        res.writeHead(400, {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'
        });
        res.end('400 Bad Request');
        return;
    }

    // 3. Reject NUL bytes
    if (decodedUrl.includes('\0')) {
        res.writeHead(400, {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'
        });
        res.end('400 Bad Request');
        return;
    }

    // Map root to index.html
    let normalized = path.normalize(decodedUrl).replace(/^(\.\.[\/\\])+/, '');
    if (normalized === '/' || normalized === '\\' || normalized === '.') {
        normalized = '/index.html';
    }

    // 4. Resolve absolute path and verify it stays inside project root
    const filePath = path.resolve(ROOT_DIR, '.' + normalized);
    const rootWithSep = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : ROOT_DIR + path.sep;

    if (!filePath.startsWith(rootWithSep) && filePath !== path.join(ROOT_DIR, 'index.html')) {
        res.writeHead(403, {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'
        });
        res.end('403 Forbidden');
        return;
    }

    // 5. Allowlist check: only index.html or files under css/, js/, assets/
    const relPath = path.relative(ROOT_DIR, filePath);
    const parts = relPath.split(path.sep);

    // Reject dotfiles (e.g. .git, .env)
    if (parts.some(p => p.startsWith('.'))) {
        res.writeHead(404, {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'
        });
        res.end('404 Not Found');
        return;
    }

    const isIndex = relPath === 'index.html';
    const isAllowedDir = ALLOWED_DIRS.has(parts[0]);
    const ext = path.extname(filePath).toLowerCase();

    // Never serve server.js, package.json, node_modules, or non-allowlisted files
    if ((!isIndex && !isAllowedDir) || !ALLOWED_EXTENSIONS.has(ext)) {
        res.writeHead(404, {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer'
        });
        res.end('404 Not Found');
        return;
    }

    // 6. Security headers
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' https://0.peerjs.com wss://0.peerjs.com https://*.peerjs.com wss://*.peerjs.com;"
    };

    fs.stat(filePath, (statErr, stats) => {
        if (statErr || !stats.isFile()) {
            res.writeHead(404, {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'no-referrer'
            });
            res.end('404 Not Found');
            return;
        }

        if (req.method === 'HEAD') {
            res.writeHead(200, headers);
            res.end();
            return;
        }

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'X-Content-Type-Options': 'nosniff',
                    'Referrer-Policy': 'no-referrer'
                });
                res.end(`Server Error: ${err.code}`);
                return;
            }

            res.writeHead(200, headers);
            res.end(content);
        });
    });
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`🏦 Operación Bóveda corriendo en http://localhost:${PORT}`);
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { server, ROOT_DIR, MIME_TYPES, ALLOWED_EXTENSIONS, ALLOWED_DIRS };
}
