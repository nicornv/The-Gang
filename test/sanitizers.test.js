// test/sanitizers.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
    sanitizeAvatar,
    sanitizePlayerName,
    sanitizeChatMessage,
    isValidEmote,
    DEFAULT_AVATAR
} = require('../js/game.js');

test('Sanitizers - Player Name', () => {
    // Normal name
    assert.strictEqual(sanitizePlayerName('Alice'), 'Alice');

    // Strips XSS and tags
    const xss = '<script>alert(1)</script>';
    const cleanedXss = sanitizePlayerName(xss);
    assert.strictEqual(cleanedXss.includes('\x00'), false);
    assert.strictEqual(cleanedXss.length <= 15, true);

    // Strips control and bidi characters
    const bidi = 'Test\u202E\u200FName\x00\x1F';
    assert.strictEqual(sanitizePlayerName(bidi), 'TestName');

    // Collapses whitespace & trims
    assert.strictEqual(sanitizePlayerName('   Agente    007   '), 'Agente 007');

    // Max 15 chars
    assert.strictEqual(sanitizePlayerName('12345678901234567890'), '123456789012345');

    // Empty fallback
    assert.strictEqual(sanitizePlayerName(''), 'Agente');
    assert.strictEqual(sanitizePlayerName(null), 'Agente');
    assert.strictEqual(sanitizePlayerName('   '), 'Agente');
});

test('Sanitizers - Avatar', () => {
    // Allowed emoji
    assert.strictEqual(sanitizeAvatar('🧠'), '🧠');
    assert.strictEqual(sanitizeAvatar('🕵️'), '🕵️');

    // Disallowed / unauthorized emojis fallback to default
    assert.strictEqual(sanitizeAvatar('💩'), DEFAULT_AVATAR);

    // Reject HTTP/HTTPS URLs (tracking pixels prevention)
    assert.strictEqual(sanitizeAvatar('https://evil.com/tracker.png'), DEFAULT_AVATAR);
    assert.strictEqual(sanitizeAvatar('http://evil.com/img.jpg'), DEFAULT_AVATAR);

    // Reject javascript: URLs
    assert.strictEqual(sanitizeAvatar('javascript:alert(1)'), DEFAULT_AVATAR);

    // Reject HTML injection
    assert.strictEqual(sanitizeAvatar('<img src=x onerror=alert(1)>'), DEFAULT_AVATAR);

    // Valid small base64 data URL
    const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    assert.strictEqual(sanitizeAvatar(validDataUrl), validDataUrl);

    // Reject oversized data URL (> 55KB)
    const hugeDataUrl = 'data:image/png;base64,' + 'A'.repeat(60000);
    assert.strictEqual(sanitizeAvatar(hugeDataUrl), DEFAULT_AVATAR);
});

test('Sanitizers - Chat Message', () => {
    assert.strictEqual(sanitizeChatMessage('Hola equipo!'), 'Hola equipo!');

    // Control characters stripped
    assert.strictEqual(sanitizeChatMessage('Hola\x00\x1F!'), 'Hola!');

    // Max 120 chars
    const longMsg = 'A'.repeat(150);
    assert.strictEqual(sanitizeChatMessage(longMsg).length, 120);

    // Empty drops
    assert.strictEqual(sanitizeChatMessage('   '), '');
    assert.strictEqual(sanitizeChatMessage(null), '');
});

test('Sanitizers - Emotes', () => {
    assert.strictEqual(isValidEmote('👀'), true);
    assert.strictEqual(isValidEmote('🚨'), true);
    assert.strictEqual(isValidEmote('💥'), false);
    assert.strictEqual(isValidEmote('<script>'), false);
});
