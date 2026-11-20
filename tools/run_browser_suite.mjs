#!/usr/bin/env node
// Runs a list of browser regressions one after another and writes a report tied to the commit.
// The same runner is used by CI and for local validation, so a local report means the same thing
// as a CI shard. Servers (npm start, npm run preview_packaging) must already be running unless
// --serve is given.
//
//   node tools/run_browser_suite.mjs --suite smoke
//   node tools/run_browser_suite.mjs --suite full --shard 2/3
//   node tools/run_browser_suite.mjs --suite full --serve --keep-going --report work/browser-report.md

import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const Suites = { smoke : 'test/browser/smoke-suite.txt', full : 'test/browser/ci-suite.txt' };
// The complete product and pulp flows include many physical-material and refined-shell rebuilds under SwiftShader.
const LongTests = { 'primary-products' : 1200, 'molded-pulp' : 1200 };
const DefaultLimit = 600;

export function ParseArgs (argv)
{
    const options = { suite : 'smoke', shard : 1, shards : 1, keepGoing : false, serve : false, report : null, only : null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => {
            if (i + 1 >= argv.length) { throw new Error (`${arg} needs a value`); }
            return argv[++i];
        };
        if (arg === '--suite') { options.suite = value (); }
        else if (arg === '--shard') {
            const match = /^(\d+)\/(\d+)$/.exec (value ());
            if (!match) { throw new Error ('--shard must look like 1/3'); }
            options.shard = Number (match[1]); options.shards = Number (match[2]);
            if (options.shards < 1 || options.shard < 1 || options.shard > options.shards) { throw new Error ('--shard is out of range'); }
        }
        else if (arg === '--keep-going') { options.keepGoing = true; }
        else if (arg === '--serve') { options.serve = true; }
        else if (arg === '--report') { options.report = value (); }
        else if (arg === '--only') { options.only = value ().split (',').map (name => name.trim ()).filter (Boolean); }
        else { throw new Error (`Unknown option ${arg}`); }
    }
    if (!Object.hasOwn (Suites, options.suite)) { throw new Error (`--suite must be one of ${Object.keys (Suites).join (', ')}`); }
    return options;
}

export function ReadSuite (file)
{
    const names = readFileSync (file, 'utf8').split (/\r?\n/).map (line => line.replace (/#.*$/, '').trim ()).filter (Boolean);
    const seen = new Set ();
    for (const name of names) {
        if (!/^[a-z0-9-]+$/.test (name)) { throw new Error (`${file}: invalid test name "${name}"`); }
        if (seen.has (name)) { throw new Error (`${file}: "${name}" is listed twice`); }
        seen.add (name);
    }
    return names;
}

// Same round-robin split as the original CI loop, so shards stay balanced as tests are added.
export function SelectShard (names, shard, shards)
{
    return names.filter ((_, index) => index % shards === shard - 1);
}

export function FormatReport ({ commit, suite, shard, shards, results, started, finished })
{
    const passed = results.filter (r => r.status === 'pass').length;
    const failed = results.filter (r => r.status === 'fail').length;
    const skipped = results.filter (r => r.status === 'skipped').length;
    const verdict = failed === 0 && skipped === 0 ? 'PASS' : 'FAIL';
    const minutes = ((finished - started) / 60000).toFixed (1);
    const lines = [
        `## Browser ${suite} suite${shards > 1 ? ` (shard ${shard}/${shards})` : ''}: ${verdict}`,
        '',
        `- Commit: \`${commit}\``,
        `- Started: ${new Date (started).toISOString ()}; took ${minutes} min`,
        `- ${passed} passed, ${failed} failed, ${skipped} not run`,
        '',
        '| Test | Result | Seconds |',
        '| --- | --- | ---: |',
        ...results.map (r => `| ${r.name} | ${r.status} | ${r.seconds === null ? '' : r.seconds.toFixed (0)} |`),
        ''
    ];
    return lines.join ('\n');
}

function Commit ()
{
    const head = spawnSync ('git', ['rev-parse', 'HEAD'], { encoding : 'utf8' });
    const dirty = spawnSync ('git', ['status', '--porcelain', '--untracked-files=no'], { encoding : 'utf8' });
    const sha = head.status === 0 ? head.stdout.trim () : 'unknown';
    return dirty.status === 0 && dirty.stdout.trim () ? `${sha} (with uncommitted changes)` : sha;
}

async function WaitFor (url, seconds)
{
    for (let attempt = 0; attempt < seconds / 2; attempt++) {
        try { if ((await fetch (url)).ok) { return; } } catch { /* not up yet */ }
        await new Promise (resolve => setTimeout (resolve, 2000));
    }
    throw new Error (`${url} did not start within ${seconds} s`);
}

function StartServers ()
{
    mkdirSync ('work', { recursive : true });
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const children = [['start', 'work/dev-server.log'], ['run preview_packaging', 'work/packaging-preview.log']].map (([args, log]) => {
        const child = spawn (npm, args.split (' '), { stdio : ['ignore', 'pipe', 'pipe'], detached : process.platform !== 'win32' });
        child.stdout.on ('data', chunk => appendFileSync (log, chunk));
        child.stderr.on ('data', chunk => appendFileSync (log, chunk));
        return child;
    });
    return () => {
        for (const child of children) {
            try { process.platform === 'win32' ? child.kill () : process.kill (-child.pid); } catch { /* already gone */ }
        }
    };
}

function RunTest (name)
{
    const limit = LongTests[name] || DefaultLimit;
    return new Promise (resolve => {
        const started = Date.now ();
        const child = spawn (process.execPath, [path.join ('test/browser', `${name}.mjs`)], { stdio : 'inherit' });
        const timer = setTimeout (() => { console.error (`::error::${name} exceeded ${limit} s`); child.kill ('SIGKILL'); }, limit * 1000);
        child.on ('exit', code => {
            clearTimeout (timer);
            resolve ({ name, status : code === 0 ? 'pass' : 'fail', seconds : (Date.now () - started) / 1000 });
        });
    });
}

async function Main ()
{
    const options = ParseArgs (process.argv.slice (2));
    let names = SelectShard (ReadSuite (Suites[options.suite]), options.shard, options.shards);
    if (options.only) {
        const unknown = options.only.filter (name => !names.includes (name));
        if (unknown.length > 0) { throw new Error (`Not in this suite/shard: ${unknown.join (', ')}`); }
        names = options.only;
    }
    const stopServers = options.serve ? StartServers () : null;
    const started = Date.now ();
    const results = [];
    try {
        await WaitFor ('http://127.0.0.1:8080/website/index.html', 180);
        await WaitFor ('http://127.0.0.1:8082/', 180);
        let stopped = false;
        for (const name of names) {
            if (stopped) { results.push ({ name, status : 'skipped', seconds : null }); continue; }
            console.log (`::group::${name}`);
            // Only mcp-access needs the isolated pilot assets.
            if (name === 'mcp-access') { spawnSync (process.execPath, ['tools/build_mcp_pilot.mjs'], { stdio : 'inherit' }); }
            const result = await RunTest (name);
            console.log ('::endgroup::');
            results.push (result);
            if (result.status === 'fail') {
                console.error (`::error::Browser regression failed: ${name}`);
                stopped = !options.keepGoing;
            }
        }
    } finally {
        if (stopServers) { stopServers (); }
    }
    const report = FormatReport ({ commit : Commit (), suite : options.suite, shard : options.shard, shards : options.shards, results, started, finished : Date.now () });
    console.log (`\n${report}`);
    if (options.report) {
        mkdirSync (path.dirname (options.report), { recursive : true });
        writeFileSync (options.report, report);
    }
    if (process.env.GITHUB_STEP_SUMMARY) { appendFileSync (process.env.GITHUB_STEP_SUMMARY, `${report}\n`); }
    return results.every (r => r.status === 'pass') ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith ('run_browser_suite.mjs')) {
    Main ().then (code => { process.exitCode = code; }, error => { console.error (error.message); process.exitCode = 2; });
}
