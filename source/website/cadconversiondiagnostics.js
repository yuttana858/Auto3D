import { CadError, CadExact, CadFailureCode, CadPhases } from './cadconversioncontract.js';

export const CadDiagnosticCodes = Object.freeze ('occt.bodies_failed occt.construction_failed occt.faces_dropped occt.healing_unavailable occt.invalid_geometry occt.invalid_reference occt.invalid_shape occt.invalid_topology occt.limit_exceeded occt.source_incomplete occt.unknown_orientation occt.unsupported_body occt.unsupported_curve occt.unsupported_surface occt.unsupported_topology'.split (' '));
export const CadDiagnosticExceptions = Object.freeze ('TypeError ValueError AttributeError RuntimeError MemoryError OSError ConversionError SchemaError ParseError LimitExceededError OcctConversionError InteropError NativeError Standard_ConstructionError Standard_DomainError Standard_Failure Standard_OutOfRange Standard_NullObject Standard_NoSuchObject StdFail_NotDone'.split (' '));
export const CadDiagnosticChecks = Object.freeze ({ sourceRead : 'Read source', geometryBuild : 'Build geometry', geometryValidation : 'Validate geometry', stepExport : 'Write STEP', stepReimport : 'Reopen STEP' });
const phases = Object.keys (CadPhases), checkPhases = phases.slice (1, 6);
export function CadDiagnosticReport (value)
{
    CadExact (value, ['schemaVersion', 'versions', 'outcome', 'phase', 'failureCode', 'readerCode', 'exception', 'frames', 'checks']);
    CadExact (value.versions, ['worker', 'reader', 'occt']); CadExact (value.checks, Object.keys (CadDiagnosticChecks));
    const version = text => typeof text === 'string' && /^[0-9]{1,5}(?:\.[0-9]{1,5}){1,5}$/.test (text);
    if (value.schemaVersion !== 1 || !['error_detected', 'cad_validated'].includes (value.outcome) || !Object.hasOwn (CadPhases, value.phase) || !version (value.versions.worker) || ['reader', 'occt'].some (key => value.versions[key] !== null && !version (value.versions[key])) || value.readerCode !== null && !CadDiagnosticCodes.includes (value.readerCode) || !Array.isArray (value.frames) || value.frames.length > 4 || !value.frames.every (frame => typeof frame === 'string' && /^[A-Za-z0-9_]{1,64}:[0-9]{1,8}$/.test (frame))) { throw CadError ('invalid_request'); }
    const success = value.outcome === 'cad_validated';
    if (success ? value.phase !== 'validate_step' || value.failureCode !== null || value.readerCode !== null || value.exception !== null || value.frames.length !== 0 : !CadDiagnosticExceptions.includes (value.exception) || typeof value.failureCode !== 'string' || CadFailureCode (value.failureCode) !== value.failureCode) { throw CadError ('invalid_request'); }
    for (const [index, key] of Object.keys (CadDiagnosticChecks).entries ()) {
        const expected = success || phases.indexOf (checkPhases[index]) < phases.indexOf (value.phase) ? 'passed' : checkPhases[index] === value.phase ? 'failed' : 'not_run';
        if (value.checks[key] !== expected) { throw CadError ('invalid_request'); }
    }
    return { ...value, versions : { ...value.versions }, frames : [...value.frames], checks : { ...value.checks } };
}
export function CadDiagnosticAdvice (report)
{
    if (report.outcome === 'cad_validated') { return 'The server read and validated the CAD geometry and reopened its STEP export. Mesh generation was not tested by this diagnostic pass.'; }
    if (['unsupported_schema', 'unsupported_entity'].includes (report.failureCode)) { return 'The installed reader does not support this source. Use a STEP export or add reader support for the reported entity.'; }
    if (report.phase === 'read_source') { return 'The server could not finish reading this source. Check its format and export version.'; }
    if (report.phase === 'build_geometry') { return 'The reader failed while constructing geometry. An engineering review of the reported reader code is needed; this does not establish that the original CAD file is corrupt.'; }
    return 'The server stopped at the reported validation stage. No partial model was published.';
}
