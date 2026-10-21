import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe ('Branded mini viewer access boundary', () => {
    const html = readFileSync (new URL ('../website/mini.html', import.meta.url), 'utf8');
    it ('uses only a local QR library and never puts access codes in QR URLs', () => {
        assert.match (html, /assets\/vendor\/qrcode\.min\.js/);
        assert.doesNotMatch (html, /cdn\.jsdelivr|api\.qrserver|chart\.googleapis/);
        assert.match (html, /link\.searchParams\.set\('view',token\)/);
        assert.match (html, /link\.searchParams\.set\('share',token\)/);
        assert.doesNotMatch (html, /searchParams\.set\('code'/);
    });
    it ('offers share QR preview and PNG export in the authenticated share dialog', () => {
        const editor = readFileSync (new URL ('../source/website/modellibrary.js', import.meta.url), 'utf8');
        assert.match (editor, /Show QR code/);
        assert.match (editor, /Save QR as PNG/);
        assert.match (editor, /\/assets\/vendor\/qrcode\.min\.js/);
        assert.match (editor, /text : input\.value/);
        assert.doesNotMatch (editor, /qrcode\.api|api\.qrserver\.com/);
    });
    it ('keeps legacy sign-in handling and separates the guest audience challenge from the workspace', () => {
        assert.doesNotMatch (html, /createElement\('iframe'\)/);
        const mini = readFileSync (new URL ('../source/website/miniviewer.js', import.meta.url), 'utf8');
        assert.match (mini, /Sign in to Auto3D/);
        assert.match (mini, /codeRequired/);
        assert.match (mini, /OpenSessionArchive/);
        assert.match (mini, /'\/archive'/);
        assert.doesNotMatch (mini, /\/api\/account-library/);
        assert.doesNotMatch (mini, /localStorage/);
    });
});
