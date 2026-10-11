import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe ('Branded mini viewer access boundary', () => {
    const html = readFileSync (new URL ('../website/mini.html', import.meta.url), 'utf8');
    it ('uses only a local QR library and never puts access codes in QR URLs', () => {
        assert.match (html, /assets\/vendor\/qrcode\.min\.js/);
        assert.doesNotMatch (html, /cdn\.jsdelivr|api\.qrserver|chart\.googleapis/);
        assert.match (html, /external\.searchParams\.set\('view',token\)/);
        assert.doesNotMatch (html, /searchParams\.set\('code'/);
    });
    it ('does not embed the protected workspace or bypass sign-in', () => {
        assert.doesNotMatch (html, /createElement\('iframe'\)/);
        assert.match (html, /Sign in to Auto3D/);
        assert.match (html, /codeRequired/);
        assert.match (html, /Open the secure viewer to enter it/);
    });
});
