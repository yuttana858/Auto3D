function Validate (value, schema, path = 'arguments')
{
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray (value)) { throw new Error (path + ' must be an object.'); }
        for (const key of schema.required || []) { if (!Object.hasOwn (value, key)) { throw new Error (path + '.' + key + ' is required.'); } }
        for (const key of Object.keys (value)) {
            if (!Object.hasOwn (schema.properties, key)) { throw new Error ('Unknown argument: ' + path + '.' + key); }
            Validate (value[key], schema.properties[key], path + '.' + key);
        }
    } else if (schema.type === 'array') {
        if (!Array.isArray (value) || (schema.minItems !== undefined && value.length < schema.minItems) || (schema.maxItems !== undefined && value.length > schema.maxItems)) { throw new Error (path + ' has an invalid array length.'); }
        value.forEach ((item, index) => Validate (item, schema.items, path + '[' + index + ']'));
    } else {
        if (typeof value !== schema.type || (schema.type === 'number' && !Number.isFinite (value))) { throw new Error (path + ' must be a finite ' + schema.type + '.'); }
        if (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum) { throw new Error (path + ' is out of range.'); }
        if (schema.enum && !schema.enum.includes (value)) { throw new Error (path + ' must be one of: ' + schema.enum.join (', ')); }
    }
}

function Resolve (value, results)
{
    if (Array.isArray (value)) { return value.map ((item) => Resolve (item, results)); }
    if (value && typeof value === 'object') {
        if (Object.hasOwn (value, '$ref')) {
            if (typeof value.$ref !== 'string' || Object.keys (value).length !== 1) { throw new Error ('Invalid result reference.'); }
            let current = results;
            for (const key of value.$ref.split ('.')) {
                if (!current || !Object.hasOwn (current, key) || ['__proto__', 'prototype', 'constructor'].includes (key)) { throw new Error ('Unresolved result reference: ' + value.$ref); }
                current = current[key];
            }
            return current;
        }
        return Object.fromEntries (Object.entries (value).map (([key, item]) => [key, Resolve (item, results)]));
    }
    return value;
}

export class CommandRegistry
{
    constructor (context)
    {
        this.context = context; this.commands = new Map (); this.tail = Promise.resolve (); this.running = null;
    }
    Register (metadata, handler)
    {
        if (this.commands.has (metadata.id)) { throw new Error ('Duplicate command: ' + metadata.id); }
        this.commands.set (metadata.id, { ...metadata, handler });
    }
    Catalog (query = '')
    {
        const words = query.toLowerCase ().split (/\s+/).filter (Boolean);
        return [...this.commands.values ()].filter ((command) => words.every ((word) => JSON.stringify ([command.id, command.title, command.category, command.description]).toLowerCase ().includes (word))).map (({ handler, ...metadata }) => structuredClone (metadata));
    }
    Queue (action)
    {
        const operation = this.tail.then (action); this.tail = operation.catch (() => {}); return operation;
    }
    async Invoke (id, args = {})
    {
        const command = this.commands.get (id);
        if (!command) { throw new Error ('Unknown command: ' + id); }
        Validate (args, command.inputSchema);
        if (command.mutates && this.context.readOnly) { throw new Error ('This shared viewer is read-only.'); }
        if (this.context.busy) { throw new Error ('The viewer is busy. Retry after loading completes.'); }
        return await command.handler (args) ?? null;
    }
    Execute (id, args = {})
    {
        return this.Queue (async () => {
            try { return { ok : true, command : id, result : await this.Invoke (id, args) }; }
            catch (error) { return { ok : false, command : id, error : { code : 'COMMAND_FAILED', message : error.message } }; }
        });
    }
    Cancel () { if (this.running) { this.running.cancelled = true; } return { requested : !!this.running }; }
    RunMacro (macro)
    {
        return this.Queue (async () => {
            const completed = []; const results = Object.create (null); const token = { cancelled : false }; this.running = token;
            try {
                if (macro?.version !== 1 || !Array.isArray (macro.steps) || !macro.steps.length || macro.steps.length > 100) { throw new Error ('Use a version 1 macro with 1–100 steps.'); }
                const ids = new Set ();
                for (const step of macro.steps) {
                    if (typeof step?.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test (step.id) || ids.has (step.id) || !this.commands.has (step.command)) { throw new Error ('Each step needs a unique ID and an existing command.'); }
                    ids.add (step.id);
                    // Validate every static input before any step changes the scene.
                    const hasReference = JSON.stringify (step.arguments || {}).includes ('"$ref"');
                    if (!hasReference) { Validate (step.arguments || {}, this.commands.get (step.command).inputSchema); }
                }
                for (const step of macro.steps) {
                    if (token.cancelled) { return { ok : false, cancelled : true, completed }; }
                    try {
                        const result = await this.Invoke (step.command, Resolve (step.arguments || {}, results));
                        results[step.id] = result; completed.push ({ id : step.id, command : step.command, result });
                    } catch (error) { return { ok : false, failedStep : step.id, error : { code : 'STEP_FAILED', message : error.message }, completed }; }
                }
                return { ok : true, completed };
            } catch (error) { return { ok : false, error : { code : 'INVALID_MACRO', message : error.message }, completed }; }
            finally { this.running = null; }
        });
    }
}
