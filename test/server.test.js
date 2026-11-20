// test/server.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { server } = require('../server.js');

function request(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

test('Static Server Security and Correctness', async (t) => {
    // Start server on an ephemeral port (port 0)
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    t.after(() => {
        server.close();
    });

    // 1. GET / returns 200 with index.html
    const resRoot = await request({ host: '127.0.0.1', port, path: '/', method: 'GET' });
    assert.strictEqual(resRoot.statusCode, 200);
    assert.strictEqual(resRoot.headers['content-type'].includes('text/html'), true);
    assert.strictEqual(resRoot.headers['x-content-type-options'], 'nosniff');

    // 2. Static CSS asset returns 200
    const resCss = await request({ host: '127.0.0.1', port, path: '/css/style.css', method: 'GET' });
    assert.strictEqual(resCss.statusCode, 200);
    assert.strictEqual(resCss.headers['content-type'].includes('text/css'), true);

    // 3. Path traversal attempt (e.g. /..%2f..%2fetc%2fpasswd)
    const resTraversal = await request({ host: '127.0.0.1', port, path: '/..%2f..%2fetc%2fpasswd', method: 'GET' });
    assert.strictEqual(resTraversal.statusCode >= 400, true);
    assert.notStrictEqual(resTraversal.statusCode, 200);

    // 4. Access to server.js must be forbidden (404/403)
    const resServerJs = await request({ host: '127.0.0.1', port, path: '/server.js', method: 'GET' });
    assert.strictEqual([403, 404].includes(resServerJs.statusCode), true);

    // 5. Access to package.json must be forbidden
    const resPkgJson = await request({ host: '127.0.0.1', port, path: '/package.json', method: 'GET' });
    assert.strictEqual([403, 404].includes(resPkgJson.statusCode), true);

    // 6. Access to dotfiles (e.g. /.git/config or /.env) must be forbidden
    const resGit = await request({ host: '127.0.0.1', port, path: '/.git/config', method: 'GET' });
    assert.strictEqual([403, 404].includes(resGit.statusCode), true);

    // 7. POST method must be rejected with 405 Method Not Allowed
    const resPost = await request({ host: '127.0.0.1', port, path: '/', method: 'POST' }, 'test');
    assert.strictEqual(resPost.statusCode, 405);
});
