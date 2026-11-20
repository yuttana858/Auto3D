import { ValidateStudioDefinition } from './definition.js';

function CancelledError ()
{
    const error = new Error ('3Dstudio evaluation was cancelled.');
    error.name = 'AbortError';
    return error;
}

/**
 * One evaluation per dedicated worker. Cancelling, replacing, timing out or
 * disposing a request terminates WASM execution, including synchronous CSG.
 */
export class StudioWorkerClient
{
    constructor (options = {})
    {
        const workerUrl = new URL (options.workerUrl || './3dstudio.worker.js', import.meta.url);
        if (!options.workerUrl) {
            workerUrl.search = new URL (import.meta.url).search;
        }
        this.workerUrl = workerUrl.href;
        this.timeoutMs = options.timeoutMs === undefined ? 15000 : options.timeoutMs;
        if (!Number.isFinite (this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60000) {
            throw new Error ('3Dstudio worker timeout must be between 1 and 60000 milliseconds.');
        }
        this.workerFactory = options.workerFactory || ((url) => new Worker (url, { type: 'module', name: '3Dstudio geometry' }));
        this.worker = null;
        this.pending = null;
        this.nextId = 0;
        this.disposed = false;
    }

    evaluate (input)
    {
        if (this.disposed) {
            return Promise.reject (new Error ('3Dstudio worker client has been disposed.'));
        }
        let definition;
        try {
            definition = ValidateStudioDefinition (input);
        } catch (error) {
            return Promise.reject (error);
        }
        this.cancel ();
        return new Promise ((resolve, reject) => {
            const id = ++this.nextId;
            try {
                if (this.worker === null) {
                    this.worker = this.workerFactory (this.workerUrl);
                }
                const worker = this.worker;
                const finish = (error, result, terminate) => {
                    if (!this.pending || this.pending.id !== id || this.worker !== worker) {
                        return;
                    }
                    clearTimeout (this.pending.timer);
                    this.pending = null;
                    if (terminate) {
                        this.TerminateWorker ();
                    }
                    if (error) {
                        reject (error);
                    } else {
                        resolve (result);
                    }
                };
                const timer = setTimeout (() => finish (new Error ('3Dstudio evaluation timed out. Reduce detail or simplify the model.'), null, true), this.timeoutMs);
                this.pending = { id, reject, timer };
                worker.onmessage = (event) => {
                    const response = event.data;
                    if (!response || response.id !== id) {
                        return;
                    }
                    if (response.error) {
                        finish (new Error (response.error), null, true);
                    } else if (!response.result) {
                        finish (new Error ('3Dstudio worker returned an invalid result.'), null, true);
                    } else {
                        finish (null, response.result, false);
                    }
                };
                worker.onerror = () => finish (new Error ('3Dstudio geometry worker could not run. Try again.'), null, true);
                worker.onmessageerror = () => finish (new Error ('3Dstudio geometry worker returned unreadable data.'), null, true);
                worker.postMessage ({ type: 'evaluate', id, definition });
            } catch (error) {
                if (this.pending && this.pending.id === id) {
                    clearTimeout (this.pending.timer);
                    this.pending = null;
                }
                this.TerminateWorker ();
                reject (error);
            }
        });
    }

    TerminateWorker ()
    {
        if (this.worker !== null) {
            this.worker.onmessage = null;
            this.worker.onerror = null;
            this.worker.onmessageerror = null;
            this.worker.terminate ();
            this.worker = null;
        }
    }

    cancel ()
    {
        if (this.pending !== null) {
            const pending = this.pending;
            clearTimeout (pending.timer);
            this.pending = null;
            this.TerminateWorker ();
            pending.reject (CancelledError ());
        }
    }

    dispose ()
    {
        this.cancel ();
        this.TerminateWorker ();
        this.disposed = true;
    }
}
