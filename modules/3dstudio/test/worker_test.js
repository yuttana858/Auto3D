import assert from 'node:assert/strict';
import { CreatePrimitiveDefinition } from '../src/definition.js';
import { HandleStudioJob } from '../src/worker.js';
import { StudioWorkerClient } from '../src/workerclient.js';

function WorkerHarness (options = {})
{
    const workers = [];
    const client = new StudioWorkerClient ({
        timeoutMs: 1000, ...options,
        workerFactory: url => {
            const worker = {
                url, terminated: false, messages: [],
                postMessage (message) { this.messages.push (message); },
                terminate () { this.terminated = true; },
                reply (data) { this.onmessage ({ data }); }
            };
            workers.push (worker);
            return worker;
        }
    });
    return { client, workers, definition: CreatePrimitiveDefinition () };
}

describe ('3Dstudio worker protocol and cancellation', function () {
    it ('transfers all four geometry buffers and preserves the request ID', async () => {
        const result = { positions: new Float64Array (3), normals: new Float32Array (3), indices: new Uint32Array (3), materialIndices: new Uint32Array (1) };
        let posted = null;
        const response = await HandleStudioJob ({ id: 4, type: 'evaluate', definition: {} }, (message, transfer) => { posted = { message, transfer }; }, async () => result);
        assert.equal (response.message.id, 4);
        assert.equal (response.message.result, result);
        assert.equal (response.transfer.length, 4);
        assert.deepEqual (response, posted);
    });

    it ('returns bounded error text and rejects an invalid protocol request', async () => {
        const failure = await HandleStudioJob ({ id: 1, type: 'evaluate' }, null, async () => { throw new Error ('x'.repeat (1000)); });
        assert.equal (failure.message.error.length, 500);
        const invalid = await HandleStudioJob ({ id: 0, type: 'evaluate' });
        assert.match (invalid.message.error, /Invalid/);
    });

    it ('reuses the idle worker while isolating request IDs and stale responses', async () => {
        const { client, workers, definition } = WorkerHarness ();
        const first = client.evaluate (definition);
        const staleHandler = workers[0].onmessage;
        workers[0].reply ({ id: 1, result: { first: true } });
        assert.deepEqual (await first, { first: true });
        const second = client.evaluate (definition);
        staleHandler ({ data: { id: 1, result: { stale: true } } });
        workers[0].reply ({ id: 1, result: { stale: true } });
        workers[0].reply ({ id: 2, result: { second: true } });
        assert.deepEqual (await second, { second: true });
        assert.equal (workers.length, 1);
        client.dispose ();
        assert.equal (workers[0].terminated, true);
    });

    it ('terminates running WASM when an edit supersedes a request and rejects stale completion', async () => {
        const { client, workers, definition } = WorkerHarness ();
        const first = client.evaluate (definition);
        const cancelled = assert.rejects (first, { name: 'AbortError' });
        const staleHandler = workers[0].onmessage;
        const second = client.evaluate (definition);
        await cancelled;
        assert.equal (workers[0].terminated, true);
        staleHandler ({ data: { id: 1, result: { stale: true } } });
        workers[1].reply ({ id: 2, result: { current: true } });
        assert.deepEqual (await second, { current: true });
        client.dispose ();
    });

    it ('times out the worker and creates a fresh worker for the next request', async () => {
        const { client, workers, definition } = WorkerHarness ({ timeoutMs: 10 });
        await assert.rejects (client.evaluate (definition), /timed out/);
        assert.equal (workers[0].terminated, true);
        const second = client.evaluate (definition);
        workers[1].reply ({ id: 2, result: { recovered: true } });
        assert.deepEqual (await second, { recovered: true });
        client.dispose ();
    });

    it ('propagates worker failures, supports explicit cancellation and refuses use after disposal', async () => {
        const { client, workers, definition } = WorkerHarness ();
        const first = client.evaluate (definition);
        workers[0].reply ({ id: 1, error: 'bad solid' });
        await assert.rejects (first, /bad solid/);
        assert.equal (workers[0].terminated, true);
        const second = client.evaluate (definition);
        const cancelled = assert.rejects (second, { name: 'AbortError' });
        client.cancel (); await cancelled;
        assert.equal (workers[1].terminated, true);
        client.dispose ();
        await assert.rejects (client.evaluate (definition), /disposed/);
    });
});
