import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { ParseArgs, ReadSuite, SelectShard, FormatReport } from '../tools/run_browser_suite.mjs';

describe ('Browser suite runner', function () {
    it ('keeps the smoke suite a subset of the full CI suite', function () {
        const full = ReadSuite ('test/browser/ci-suite.txt');
        const smoke = ReadSuite ('test/browser/smoke-suite.txt');
        assert.ok (smoke.length >= 5 && smoke.length <= 15, `smoke has ${smoke.length} tests`);
        assert.deepEqual (smoke.filter (name => !full.includes (name)), []);
    });

    it ('splits the full suite into round-robin shards that cover every test once', function () {
        const full = ReadSuite ('test/browser/ci-suite.txt');
        const shards = [1, 2, 3].map (shard => SelectShard (full, shard, 3));
        assert.deepEqual (shards.flat ().sort (), [...full].sort ());
        assert.deepEqual (shards[0].slice (0, 2), [full[0], full[3]]);
    });

    it ('validates options', function () {
        assert.deepEqual (ParseArgs (['--suite', 'full', '--shard', '2/3']).shards, 3);
        assert.throws (() => ParseArgs (['--suite', 'nightly']), /must be one of/);
        assert.throws (() => ParseArgs (['--shard', '4/3']), /out of range/);
        assert.throws (() => ParseArgs (['--shard']), /needs a value/);
        assert.throws (() => ParseArgs (['--fast']), /Unknown option/);
    });

    it ('reports the commit and fails when any test failed or did not run', function () {
        const base = { commit : 'abc123', suite : 'smoke', shard : 1, shards : 1, started : 0, finished : 90000 };
        const pass = FormatReport ({ ...base, results : [{ name : 'auth', status : 'pass', seconds : 12 }] });
        assert.match (pass, /smoke suite: PASS/);
        assert.match (pass, /`abc123`/);
        const fail = FormatReport ({ ...base, results : [{ name : 'auth', status : 'fail', seconds : 3 }, { name : 'fefco', status : 'skipped', seconds : null }] });
        assert.match (fail, /: FAIL/);
        assert.match (fail, /0 passed, 1 failed, 1 not run/);
    });
});
