import assert from 'node:assert/strict';
import { EaseMotion, EaseSpan, MotionEasings, DefaultMotionEasing } from '../modules/packaging/src/easing.js';
import { AccountPreferenceState } from '../source/website/preferences.js';
import { Preferences as ValidatePreferences } from '../functions/_lib/accountstorage.js';

describe ('Motion easing', () => {
    it ('ramps in and out from 0 to 1 without overshoot', () => {
        for (const easing of MotionEasings) {
            assert.equal (EaseMotion (0, easing), 0); assert.equal (EaseMotion (1, easing), 1); assert.ok (Math.abs (EaseMotion (0.5, easing) - 0.5) < 1e-12, easing);
            let previous = 0; for (let t = 0; t <= 1.0001; t += 0.01) { const value = EaseMotion (t, easing); assert.ok (value >= previous - 1e-12 && value <= 1, easing + ' ' + t); previous = value; }
        }
        assert.equal (EaseMotion (-1), 0); assert.equal (EaseMotion (2), 1); assert.equal (DefaultMotionEasing, 'smooth');
        // Smooth and Strong start and finish slower than Linear; Strong lingers longest.
        assert.ok (EaseMotion (0.1, 'strong') < EaseMotion (0.1, 'smooth') && EaseMotion (0.1, 'smooth') < EaseMotion (0.1, 'linear'));
        assert.ok (EaseMotion (0.9, 'strong') > EaseMotion (0.9, 'smooth') && EaseMotion (0.9, 'smooth') > EaseMotion (0.9, 'linear'));
        assert.throws (() => EaseMotion (0.5, 'bounce')); assert.throws (() => EaseMotion (Number.NaN));
    });
    it ('eases within a span of a timeline', () => {
        assert.equal (EaseSpan (0.2, 0.3, 0.5), 0); assert.equal (EaseSpan (0.6, 0.3, 0.5), 1); assert.ok (Math.abs (EaseSpan (0.4, 0.3, 0.5, 'linear') - 0.5) < 1e-12);
        assert.equal (EaseSpan (0.5, 0.5, 0.5), 1); assert.equal (EaseSpan (0.49, 0.5, 0.5), 0);
    });
    it ('is an account preference that defaults to Smooth and rejects unknown values', () => {
        assert.equal (AccountPreferenceState ({ theme : 1 }).motionEasing, 'smooth'); assert.equal (AccountPreferenceState ({ motionEasing : 'strong' }).motionEasing, 'strong'); assert.equal (AccountPreferenceState ({ motionEasing : 'bounce' }).motionEasing, 'smooth');
        assert.equal (ValidatePreferences ({ units : 'metric', theme : 1, motionEasing : 'linear' }).motionEasing, 'linear');
        assert.throws (() => ValidatePreferences ({ units : 'metric', theme : 1, motionEasing : 'bounce' }));
    });
});
