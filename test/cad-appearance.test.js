import assert from 'node:assert/strict';
import { CadAppearanceReport, CadAppearanceLines } from '../source/website/cadconversionappearance.js';
import { CadConversions } from '../source/website/cadconversion.js';
import { PublicJob } from '../functions/_lib/conversionjobs.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { ParseConvertedGlb } from '../source/website/cadconversionimport.js';
import { readFileSync } from 'node:fs';

const jobId = '00000000-0000-4000-8000-000000000001';
export const appearance = () => ({ schemaVersion : 1, sourceFormat : 'step', colors : { detected : 2, glb : 'preserved', step : 'preserved' }, transparency : { detected : 1, glb : 'preserved', step : 'preserved' }, materials : { detected : 0, glb : 'not_present', step : 'not_present' }, imageTextures : { detected : null, status : 'not_exposed_by_reader' }, stl : 'geometry_only', validation : 'passed' });
const inventory = () => { const r = appearance (); r.validation = 'not_run'; for (const key of ['colors', 'transparency', 'materials']) { r[key].glb = r[key].step = 'not_run'; } return r; };

describe ('Private CAD appearance inventory', () => {
    it ('imports actual native body/face colors and alpha with correct linear-to-sRGB conversion', async () => {
        const bytes = Buffer.from (readFileSync ('test/testfiles/cad-conversion-box.glb.b64', 'utf8').trim (), 'base64');
        const { model } = await ParseConvertedGlb (bytes.buffer.slice (bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        const materials = model.materials;
        assert.equal (materials.length, 2);
        assert.ok (materials.some (m => Math.abs (m.opacity - .5) < 1e-6 && Math.abs (m.color.r - 63) <= 1 && Math.abs (m.color.g - 149) <= 1 && Math.abs (m.color.b - 218) <= 1));
        assert.ok (materials.some (m => m.opacity === 1 && Math.abs (m.color.r - 124) <= 1 && Math.abs (m.color.g - 63) <= 1 && Math.abs (m.color.b - 170) <= 1));
    });
    it ('accepts only exact bounded counts and statuses, without arbitrary source data', () => {
        assert.deepEqual (CadAppearanceReport (appearance ()), appearance ());
        for (const edit of [r => { r.path = '/private/model.step'; }, r => { r.colors.rgb = [1, 0, 0]; }, r => { r.colors.detected = 8193; }, r => { r.colors.detected = 1.5; }, r => { r.colors.detected = 0; }, r => { r.colors.glb = 'unknown'; }, r => { r.transparency.detected = 3; }, r => { r.imageTextures.detected = 0; }, r => { r.imageTextures.uri = 'https://private'; }, r => { r.validation = 'not_run'; }, r => { r.stl = 'textured'; }]) {
            const r = appearance (); edit (r); assert.throws (() => CadAppearanceReport (r));
        }
        assert.deepEqual (CadAppearanceReport (inventory (), true), inventory ());
        assert.throws (() => CadAppearanceReport (inventory ()));
        assert.ok (CadAppearanceLines (appearance ()).some (line => line.includes ('STL contains geometry only')));
        assert.ok (CadAppearanceLines (appearance ()).some (line => line.includes ('does not expose')));
    });
    it ('reads an owned inventory through the shared command, including read-only sessions', async () => {
        const site = { auth : { user : { id : jobId }, generation : 1 }, sessionEditor : { readOnly : true } };
        const cad = new CadConversions (site, async () => Response.json ({ job : { id : jobId, summary : { appearance : appearance () } } }));
        assert.equal ((await cad.Appearance (jobId)).report.colors.glb, 'preserved');
        site.cadConversions = cad;
        const registry = CreateAgentCommands (site); registry.context.readOnly = true;
        assert.equal (registry.Catalog ().find (item => item.id === 'conversion.appearance').mutates, false);
        assert.equal ((await registry.Execute ('conversion.appearance', { jobId })).ok, true);
        assert.equal ((await registry.Execute ('conversion.appearance', { jobId, sourcePath : '/private' })).ok, false);
    });
    it ('does not expose expired, malformed or arbitrary diagnostic inventory', () => {
        const job = { id : jobId, state : 'failed', expires_at : new Date (Date.now () + 60000).toISOString (), summary : { appearanceSource : inventory () } };
        assert.deepEqual (PublicJob (job).diagnostics.appearance, inventory ());
        job.summary.appearanceSource.colors.private = 'hidden'; assert.equal (PublicJob (job).diagnostics.appearance, null);
        job.summary.appearanceSource = inventory (); job.expires_at = new Date (0).toISOString ();
        assert.equal (PublicJob (job).diagnostics.appearance, null);
    });
});
