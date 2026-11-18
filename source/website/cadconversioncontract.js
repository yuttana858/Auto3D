// Public format contract. Provider credentials and storage paths belong only on the server.
export const CadLimits = Object.freeze ({ inputBytes : 50 * 1024 * 1024, artifactBytes : 64 * 1024 * 1024, manifestBytes : 16 * 1024 * 1024, totalBytes : 208 * 1024 * 1024, retentionHours : 24 });
export const CadArtifacts = Object.freeze ({ step : { file : 'model.step', units : 'mm', type : 'application/step' }, glb : { file : 'model.glb', units : 'm', type : 'model/gltf-binary' }, stl : { file : 'model.stl', units : 'mm', type : 'model/stl' }, manifest : { file : 'manifest.json', type : 'application/json' } });
export const CadMessages = Object.freeze ({
    invalid_request : 'Check the file, source units and conversion options.',
    unauthenticated : 'Sign in to convert CAD.', forbidden : 'This conversion is unavailable for this account.',
    conflict : 'This conversion changed. Refresh its status before retrying.', not_found : 'Conversion not found.',
    expired : 'This conversion has expired. Submit the source again.', queue_full : 'Conversion queue limit reached. Try again after a job finishes.',
    unavailable : 'CAD conversion is temporarily unavailable. Try again shortly.', not_ready : 'The CAD service has not completed its native verification.',
    too_large : 'The file exceeds the conversion size limit.', source_mismatch : 'The uploaded file does not match this submission.',
    cancelled : 'Conversion cancelled.', transfer_failed : 'A private file transfer failed. You can retry this job.',
    lease_expired : 'The worker stopped responding. You can retry this job.', dispatch_failed : 'The worker could not be started. You can retry this job.',
    conversion_failed : 'The earlier converter could not classify this failure. Retry once with the updated converter for a precise diagnosis.',
    worker_failed : 'The native converter stopped unexpectedly. You can retry this job once.',
    unsupported_schema : 'This Parasolid schema is not supported by the installed reader. Export STEP from the original CAD system.',
    invalid_parasolid : 'The reader could not read the complete Parasolid source. Check the export or provide STEP.',
    invalid_geometry : 'The source did not produce complete valid geometry. No partial model was published.',
    complexity_limit : 'This model exceeded the bounded conversion resource limits. Try a simpler source or a STEP export.',
    timeout : 'Native conversion exceeded its time limit. Try a simpler source or a STEP export.',
    unsupported_format : 'This CAD format is not enabled.', unsupported_entity : 'The CAD reader cannot import an entity or external reference in this file. Export a self-contained STEP from the original CAD system.',
    source_units_required : 'Select the actual Parasolid coordinate units.', validation_failed : 'Independent geometry validation failed; no result was published.',
    wrong_target : 'The active account or session changed. Select the intended session and try Add again.',
    unknown_units : 'Set the existing scene units before adding the converted model.'
});
export function CadError (code, status = 400) { return Object.assign (new Error (CadMessages[code] || CadMessages.conversion_failed), { code, status }); }
export function CadUuid (value) { return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test (value); }
export function CadHash (value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test (value); }
export function CadExact (value, keys)
{
    if (!value || typeof value !== 'object' || Array.isArray (value) || Object.keys (value).length !== keys.length || keys.some (key => !Object.hasOwn (value, key))) { throw CadError ('invalid_request'); }
    return value;
}
export function CadRequest (value)
{
    CadExact (value, ['requestKey', 'sourceName', 'extension', 'sourceBytes', 'sourceSha256', 'sourceUnit', 'quality', 'origin']);
    CadExact (value.origin, ['windowId', 'tabId', 'revision']);
    if (!CadUuid (value.requestKey) || !CadUuid (value.origin.windowId) || !CadUuid (value.origin.tabId) || !Number.isSafeInteger (value.origin.revision) || value.origin.revision < 0 || !CadHash (value.sourceSha256) || typeof value.sourceName !== 'string' || !value.sourceName.trim () || value.sourceName.length > 200 || /[\\/]/.test (value.sourceName) || [...value.sourceName].some (char => char.charCodeAt (0) < 32 || char.charCodeAt (0) === 127) || !['x_t', 'x_b', 'step', 'stp'].includes (value.extension) || !Number.isSafeInteger (value.sourceBytes) || value.sourceBytes < 1 || !['standard', 'fine'].includes (value.quality)) { throw CadError ('invalid_request'); }
    if (value.sourceBytes > CadLimits.inputBytes) { throw CadError ('too_large', 413); }
    if (['x_t', 'x_b'].includes (value.extension) ? !['mm', 'cm', 'm', 'in', 'ft'].includes (value.sourceUnit) : value.sourceUnit !== null) { throw CadError ('source_units_required'); }
    return value;
}
export function CadFailureCode (code)
{
    if (['cancelled', 'transfer_failed', 'lease_expired', 'dispatch_failed', 'unsupported_entity', 'unsupported_format', 'source_units_required', 'unsupported_schema', 'invalid_parasolid', 'invalid_geometry', 'complexity_limit', 'timeout', 'worker_failed'].includes (code)) { return code; }
    if (typeof code === 'string' && code.startsWith ('schema.')) { return 'unsupported_schema'; }
    if (typeof code === 'string' && /^(body|triangle|input|output)_limit$/.test (code)) { return 'complexity_limit'; }
    if (code === 'incomplete_conversion' || code === 'unsupported_geometry') { return 'invalid_geometry'; }
    if (typeof code === 'string' && /validation|reimport|mismatch/.test (code)) { return 'validation_failed'; }
    return 'conversion_failed';
}
export const CadPhases = Object.freeze ({ download_source : 'Reading private source', read_source : 'Reading CAD format', build_geometry : 'Building CAD geometry', validate_geometry : 'Checking geometry', write_step : 'Writing engineering STEP', validate_step : 'Reopening STEP for validation', tessellate : 'Tessellating surfaces', build_mesh : 'Building browser mesh', validate_mesh : 'Checking mesh exports', upload_artifacts : 'Publishing validated files', finalizing : 'Confirming completed conversion' });
export function CadProgress (value)
{
    CadExact (value, ['phase', 'completed', 'total', 'unit']);
    if (!Object.hasOwn (CadPhases, value.phase)) { throw CadError ('invalid_request'); }
    if (value.completed === null && value.total === null && value.unit === null) { return { ...value }; }
    if (!Number.isSafeInteger (value.completed) || !Number.isSafeInteger (value.total) || value.completed < 0 || value.total <= 0 || value.total > 1e12 || value.completed > value.total || !['bytes', 'faces', 'files'].includes (value.unit)) { throw CadError ('invalid_request'); }
    return { ...value };
}
export function CadProgressView (job)
{
    if (job.state === 'ready') { return { label : 'Ready · independently validated', percent : 100, active : false, detail : '' }; }
    let progress = null;
    try { if (job.progress) { progress = CadProgress (job.progress); } } catch { /* Untrusted or older progress is indeterminate. */ }
    const active = ['awaiting_upload', 'queued', 'running', 'cancelling'].includes (job.state);
    const labels = { awaiting_upload : 'Waiting for private upload', queued : 'Waiting for a worker', downloading : 'Reading private source', converting : 'Converting and validating CAD', uploading : 'Publishing validated files', cancelling : 'Cancelling', cancelled : 'Cancelled', failed : 'Failed', expired : 'Expired' };
    const label = active && progress ? CadPhases[progress.phase] : labels[job.stage] || labels[job.state] || 'Processing';
    const percent = active && progress?.total ? Math.floor (100 * progress.completed / progress.total) : null;
    const detail = progress?.total ? progress.unit === 'bytes' ? (progress.completed / 1048576).toFixed (1) + ' / ' + (progress.total / 1048576).toFixed (1) + ' MiB' : progress.completed + ' / ' + progress.total + ' ' + progress.unit : '';
    return { label, percent, active, detail };
}
