import assert from 'node:assert/strict';
import { GenerateSurfaceRelief } from '../src/surfacerelief.js';
import { ValidateSurfaceRelief } from '../src/reliefsettings.js';

describe ('Visual corrugated and die-impression height maps', () => {
    it ('Makes light regions raised or recessed while transparency remains neutral', () => {
        const mask = { width : 2, height : 1, pixels : new Uint8Array ([255, 255, 255, 255, 255, 255, 255, 0]) };
        const raised = GenerateSurfaceRelief ({ grain : 0, flute : 0, impression : 'emboss', impressionStrength : 1 }, mask, 32);
        const recessed = GenerateSurfaceRelief ({ grain : 0, flute : 0, impression : 'deboss', impressionStrength : 1 }, mask, 32);
        assert.equal (raised.pixels[0], 193); assert.equal (recessed.pixels[0], 63);
        assert.equal (raised.pixels[31 * 3], 128); assert.equal (recessed.pixels[31 * 3], 128);
        assert.equal (raised.map.mimeType, 'image/png'); assert.deepEqual ([...new Uint8Array (raised.map.buffer).slice (0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    });
    it ('Inverts dark mask areas without raising transparent artwork backgrounds', () => {
        const mask = { width : 2, height : 1, pixels : new Uint8Array ([0, 0, 0, 255, 0, 0, 0, 0]) };
        const result = GenerateSurfaceRelief ({ grain : 0, flute : 0, polarity : 'dark', impression : 'emboss', impressionStrength : 0.5 }, mask, 32);
        assert.equal (result.pixels[0], 161); assert.equal (result.pixels[31 * 3], 128);
    });
    it ('Changes flute direction and spacing independently of grain and printing', () => {
        const a = GenerateSurfaceRelief ({ grain : 0, flute : 1, cycles : 4 }, null, 32).pixels;
        const b = GenerateSurfaceRelief ({ grain : 0, flute : 1, cycles : 4, direction : 'horizontal' }, null, 32).pixels;
        for (let y = 0; y < 32; y++) { for (let x = 0; x < 32; x++) { assert.equal (a[(y * 32 + x) * 3], b[(x * 32 + y) * 3]); } }
        assert.notDeepEqual (a, GenerateSurfaceRelief ({ grain : 0, flute : 1, cycles : 8 }, null, 32).pixels);
        const flat = GenerateSurfaceRelief ({ grain : 0, flute : 0 }, null, 32); assert.ok (flat.pixels.every (v => v === 128));
    });
    it ('Rejects unsupported settings and enabled impressions without valid masks', () => {
        for (const value of [{ grain : NaN }, { cycles : 0 }, { cycles : 2.5 }, { direction : 'bad' }, { strength : 3 }, { impression : 'bad' }, { heightMm : 1 }]) { assert.throws (() => ValidateSurfaceRelief (value)); }
        assert.throws (() => GenerateSurfaceRelief ({ impression : 'emboss' }), /mask/);
        assert.throws (() => GenerateSurfaceRelief ({}, { width : 1, height : 1, pixels : new Uint8Array (3) }), /RGBA/);
    });
});
