import { Validate } from '../source/website/commandregistry.js';
import { AgentError, ErrorCode, Identifier, MissingScopeError, ReadTools } from './common.js';

const CatalogTools = Object.freeze ([
    { id : 'auto3d.commands.categories', title : 'List command categories', description : 'List command catalog categories and command counts. Requires auto3d.write.', mutates : false, inputSchema : { type : 'object', properties : {}, additionalProperties : false } },
    { id : 'auto3d.commands.list', title : 'Search command catalog', description : 'List command schemas for one category or search query. Results are paginated; requires auto3d.write.', mutates : false, inputSchema : { type : 'object', properties : { category : { type : 'string', maxLength : 80 }, search : { type : 'string', maxLength : 120 }, offset : { type : 'integer', minimum : 0, maximum : 10000 }, limit : { type : 'integer', minimum : 1, maximum : 25 } }, additionalProperties : false } },
    { id : 'auto3d.commands.invoke', title : 'Run an Auto3D command', description : 'Run one command discovered with auto3d.commands.list. Use its exact input schema. May change the app or account; requires auto3d.write.', mutates : true, inputSchema : { type : 'object', properties : { command : { type : 'string', pattern : '^[A-Za-z0-9._-]{1,128}$' }, arguments : { type : 'object', additionalProperties : true } }, required : ['command', 'arguments'], additionalProperties : false } }
]);

// Families provide stable entry points; the underlying registry remains the
// source of truth, so newly registered commands appear without a hard-coded count.
const Families = Object.freeze ({
    design : { title : 'Design', categories : ['Scene', 'Objects', 'Materials', 'Lighting', 'View', 'Camera', 'Rendering', 'Animation', 'History'] },
    commands : { title : 'Commands & Macros', categories : ['Commands', 'Macros'] },
    capture : { title : 'Screen capture', categories : ['Capture'] },
    modules : { title : 'Modules', categories : ['Packaging', 'Primary Products', 'AI', 'Panels', 'Knowledge'] },
    sessions : { title : 'Sessions & Library', categories : ['Sessions', 'Library'] },
    settings : { title : 'Settings & Administration', categories : ['Account', 'Administration', 'Preferences', 'Diagnostics'] }
});
const FamilySchema = { type : 'object', properties : { category : { type : 'string', maxLength : 80 }, search : { type : 'string', maxLength : 120 }, offset : { type : 'integer', minimum : 0, maximum : 10000 }, limit : { type : 'integer', minimum : 1, maximum : 25 } }, additionalProperties : false };
export const FamilyCategories = Object.freeze (Object.values (Families).flatMap (family => family.categories));
// Descriptions depend on the grant so read-only agents are not pointed at tools they lack.
const FamilyToolsFor = write => Object.entries (Families).map (([id, family]) => ({ id : 'auto3d.' + id, title : family.title, description : 'Browse ' + family.title + ' categories, then request a category to see paginated command schemas. ' + (write ? 'Run a selected command with auto3d.commands.invoke.' + (id === 'modules' ? ' Also lists the connected window’s panels.' : '') : 'This grant is read-only: only the basic inspect tools can run. Authorize again with auto3d.write to run catalog commands.'), mutates : false, inputSchema : FamilySchema }));
const FamilyTools = FamilyToolsFor (true);
function Check (value, schema)
{
    try { Validate (value, schema); } catch (error) { throw ErrorCode (error) ? error : AgentError ('invalid_arguments', error.message); }
}
const HeadlessTools = [
    { id : 'auto3d.headless', title : 'Headless workspace capabilities', description : 'List server-side operations that do not require a connected app window. The headless draft is separate from live sessions.', mutates : false, inputSchema : { type : 'object', properties : {}, additionalProperties : false } },
    { id : 'auto3d.headless.inspect', title : 'Inspect headless CAD draft', description : 'Read this agent registration’s separate temporary server-side CAD draft. No browser or window code required.', mutates : false, inputSchema : { type : 'object', properties : {}, additionalProperties : false } },
    { id : 'auto3d.headless.fefco', title : 'Generate a headless FEFCO CAD draft', description : 'Replace this agent registration’s separate temporary server-side FEFCO cut/score draft. Dimensions are score-to-score in mm, not certified inside/outside allowances. Requires auto3d.write. Does not modify an open app or save to Library.', mutates : true, inputSchema : { type : 'object', properties : { code : { type : 'string', enum : ['0200', '0201', '0202', '0203'] }, length : { type : 'number', minimum : 20, maximum : 10000 }, width : { type : 'number', minimum : 20, maximum : 10000 }, height : { type : 'number', minimum : 20, maximum : 10000 }, thickness : { type : 'number', minimum : 0.5, maximum : 15 }, overlap : { type : 'number', minimum : 0, maximum : 10000 }, closure : { type : 'string', enum : ['open', 'closed'] } }, required : ['code', 'length', 'width', 'height', 'thickness'], additionalProperties : false } },
    { id : 'auto3d.headless.projects', title : 'Manage headless CAD projects', description : 'List or read account-owned headless CAD projects; explicitly save the current draft or delete a project with its expected revision. Save/delete require auto3d.write. Projects are independent of Library and live sessions.', mutates : true, inputSchema : { type : 'object', properties : { action : { type : 'string', enum : ['list', 'get', 'save', 'delete'] }, name : { type : 'string', minLength : 1, maxLength : 80 }, projectId : { type : 'string', pattern : '^[A-Za-z0-9_-]{1,128}$' }, expectedRevision : { type : 'integer', minimum : 1 } }, required : ['action'], additionalProperties : false } }
];

function RequireWrite (actor)
{
    if (!actor.scope.includes ('auto3d.write')) { throw MissingScopeError ('auto3d.write', 'Write permission required. Authorize again with auto3d.write.'); }
}
function ValidateInvocation (value)
{
    if (!value || typeof value !== 'object' || Array.isArray (value) || Object.keys (value).some (key => !['command', 'arguments'].includes (key)) || typeof value.command !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test (value.command) || !value.arguments || typeof value.arguments !== 'object' || Array.isArray (value.arguments)) { throw AgentError ('invalid_arguments', 'Invalid command invocation. Use a command ID and object arguments from the catalog.'); }
}

export class PilotService
{
    constructor (broker, catalog)
    {
        this.broker = broker;
        this.tools = catalog;
    }
    Tools (actor)
    {
        const basic = this.tools.filter (tool => ReadTools.includes (tool.id) && (tool.id !== 'capture.image' || actor.scope.includes ('auto3d.capture')));
        return actor.scope.includes ('auto3d.write') ? [...basic, ...FamilyTools, ...HeadlessTools, ...CatalogTools] : [...basic, ...FamilyToolsFor (false), ...HeadlessTools.slice (0, 2), HeadlessTools[3]];
    }
    Categories ()
    {
        const categories = new Map ();
        for (const tool of this.tools) {
            const count = categories.get (tool.category) || { category : tool.category, total : 0, mutating : 0 };
            count.total++; if (tool.mutates) { count.mutating++; } categories.set (tool.category, count);
        }
        return [...categories.values ()].sort ((left, right) => left.category.localeCompare (right.category));
    }
    ListCommands (args)
    {
        Check (args, CatalogTools[1].inputSchema);
        const categories = this.Categories (), category = args.category && categories.find (item => item.category.toLowerCase () === args.category.toLowerCase ())?.category;
        if (args.category && !category) { throw AgentError ('invalid_arguments', 'Unknown category. Use auto3d.commands.categories to list available categories.'); }
        const search = (args.search || '').trim ().toLowerCase (), offset = args.offset || 0, limit = args.limit || 20;
        const matches = this.tools.filter (tool => (!category || tool.category === category) && (!search || JSON.stringify ([tool.id, tool.title, tool.category, tool.description]).toLowerCase ().includes (search)));
        const commands = matches.slice (offset, offset + limit).map (({ id, title, category : group, description, mutates, inputSchema, example }) => ({ id, title, category : group, description, mutates, inputSchema, example }));
        return { total : matches.length, offset, limit, nextOffset : offset + commands.length < matches.length ? offset + commands.length : null, commands };
    }
    BrowseFamily (familyId, args, write = true)
    {
        Check (args, FamilySchema);
        const family = Families[familyId]; if (!family) { throw AgentError ('unknown_command', 'Unknown tool family.'); }
        const categories = this.Categories ().filter (item => family.categories.includes (item.category) || familyId === 'settings' && !Object.values (Families).some (entry => entry.categories.includes (item.category)));
        if (!args.category && !args.search) { return { family : family.title, categories, hint : write ? 'Choose a category to list its commands.' : 'Choose a category to read command schemas. This grant is read-only; authorize again with auto3d.write to run them.' }; }
        const category = args.category && categories.find (item => item.category.toLowerCase () === args.category.toLowerCase ())?.category;
        if (args.category && !category) { throw AgentError ('invalid_arguments', 'Category is not in this family.'); }
        const allowed = new Set (categories.map (item => item.category));
        const search = (args.search || '').trim ().toLowerCase (), offset = args.offset || 0, limit = args.limit || 20;
        const matches = this.tools.filter (tool => allowed.has (tool.category) && (!category || tool.category === category) && (!search || JSON.stringify ([tool.id, tool.title, tool.description]).toLowerCase ().includes (search)));
        const commands = matches.slice (offset, offset + limit).map (({ id, title, category : group, description, mutates, inputSchema, example }) => ({ id, title, category : group, description, mutates, inputSchema, example, ...(write || ReadTools.includes (id) ? {} : { runnable : false }) }));
        return { family : family.title, total : matches.length, offset, limit, nextOffset : offset + commands.length < matches.length ? offset + commands.length : null, commands };
    }
    async Assert (actor)
    {
        if (!actor?.scope?.includes ('auto3d.read') || !Number.isFinite (actor.expiresAt) || actor.expiresAt * 1000 <= Date.now ()) { throw AgentError ('revoked', 'Access token expired or lacks read permission.'); }
        Identifier (actor.userId); Identifier (actor.props?.registrationId);
        return this.broker.AssertRegistration ({ accountId : actor.userId, id : actor.props.registrationId });
    }
    async Call (actor, name, args, requestId = crypto.randomUUID ())
    {
        const registration = await this.Assert (actor);
        let result;
        if (name === 'auto3d.sessions.list') {
            Check (args, { type : 'object', properties : {} }); result = await this.broker.List (actor.userId);
        } else if (name === 'auto3d.sessions.select') {
            Check (args, { type : 'object', properties : { connectionId : { type : 'string', pattern : '^[A-Za-z0-9_-]{1,128}$' }, sessionId : { type : 'string', pattern : '^[A-Za-z0-9_-]{1,128}$' } }, required : ['connectionId', 'sessionId'] });
            await this.broker.Pair ({ accountId : actor.userId, grantId : actor.props.registrationId, ...args, expiresAt : registration.expiresAt }); result = args;
        } else if (name === 'auto3d.sessions.pair_code') {
            Check (args, { type : 'object', properties : { code : { type : 'string', pattern : '^(?:[A-HJ-NP-Za-hj-np-z2-9]{4}-){3}[A-HJ-NP-Za-hj-np-z2-9]{4}$' } }, required : ['code'] });
            await this.broker.PairWithCode ({ accountId : actor.userId, grantId : actor.props.registrationId, code : args.code, expiresAt : registration.expiresAt });
            result = { paired : true };
        } else if (name === 'auto3d.headless') {
            Check (args, HeadlessTools[0].inputSchema); result = { mode : 'headless', description : 'Separate CAD drafts and account-owned headless projects; live viewer, Library, rendering and UI operations require a connected window.', tools : HeadlessTools.slice (1).map (tool => ({ ...tool, available : tool.id === 'auto3d.headless.projects' || !tool.mutates || actor.scope.includes ('auto3d.write'), ...(tool.id === 'auto3d.headless.projects' ? { writeRequires : 'auto3d.write' } : {}) })) };
        } else if (name === 'auto3d.headless.inspect') {
            Check (args, HeadlessTools[1].inputSchema); result = await this.broker.HeadlessInspect ({ accountId : actor.userId, grantId : actor.props.registrationId });
        } else if (name === 'auto3d.headless.fefco') {
            RequireWrite (actor);
            Check (args, HeadlessTools[2].inputSchema); result = await this.broker.HeadlessGenerate ({ accountId : actor.userId, grantId : actor.props.registrationId, parameters : args });
        } else if (name === 'auto3d.headless.projects') {
            Check (args, HeadlessTools[3].inputSchema);
            const base = { accountId : actor.userId, grantId : actor.props.registrationId }, keys = Object.keys (args);
            if (args.action === 'list' && keys.length === 1) { result = await this.broker.HeadlessProjects (base); }
            else if (args.action === 'get' && keys.length === 2 && args.projectId) { result = await this.broker.HeadlessProjectGet ({ ...base, projectId : args.projectId }); }
            else if (args.action === 'save' && args.name && keys.every (key => ['action', 'name', 'projectId', 'expectedRevision'].includes (key))) {
                RequireWrite (actor);
                result = await this.broker.HeadlessProjectSave ({ ...base, name : args.name, projectId : args.projectId || null, expectedRevision : args.expectedRevision ?? null });
            } else if (args.action === 'delete' && keys.length === 3 && args.projectId && args.expectedRevision) {
                RequireWrite (actor);
                result = await this.broker.HeadlessProjectDelete ({ ...base, projectId : args.projectId, expectedRevision : args.expectedRevision });
            } else { throw AgentError ('invalid_arguments', 'Invalid project action arguments.'); }
        } else if (FamilyTools.some (tool => tool.id === name)) {
            result = this.BrowseFamily (name.slice ('auto3d.'.length), args, actor.scope.includes ('auto3d.write'));
            if (name === 'auto3d.modules' && !args.category && !args.search && actor.scope.includes ('auto3d.write')) {
                try {
                    const response = await this.broker.Dispatch ({ accountId : actor.userId, grantId : actor.props.registrationId, requestId, command : 'ui.modules.inspect', arguments : {} });
                    if (response?.ok !== true || response.command !== 'ui.modules.inspect') { throw new Error ('Module inspection unavailable.'); }
                    result.running = response.result;
                } catch { result.running = null; result.hint = 'Connect an active window to list its modules; categories remain available.'; }
            }
        } else if (name === 'auto3d.commands.categories') {
            RequireWrite (actor);
            Check (args, CatalogTools[0].inputSchema); result = this.Categories ();
        } else if (name === 'auto3d.commands.list') {
            RequireWrite (actor);
            result = this.ListCommands (args);
        } else if (name === 'auto3d.commands.invoke') {
            RequireWrite (actor);
            ValidateInvocation (args);
            const tool = this.tools.find (item => item.id === args.command); if (!tool) { throw AgentError ('unknown_command', 'Unknown command. List the command catalog to find an available ID.'); }
            Check (args.arguments, tool.inputSchema);
            result = await this.broker.Dispatch ({ accountId : actor.userId, grantId : actor.props.registrationId, requestId, command : tool.id, arguments : args.arguments });
            if (result?.ok !== true || result.command !== tool.id) { throw AgentError ('command_failed', 'Unexpected result from the app window.'); }
            result = result.result;
        } else {
            const tool = this.Tools (actor).find (item => item.id === name); if (!tool) { throw AgentError ('unknown_command', 'Tool unavailable for this grant.'); }
            Check (args, tool.inputSchema);
            result = await this.broker.Dispatch ({ accountId : actor.userId, grantId : actor.props.registrationId, requestId, command : name, arguments : args });
            if (result?.ok !== true || result.command !== name) { throw AgentError ('command_failed', 'Unexpected result from the app window.'); }
            result = result.result;
        }
        await this.Assert (actor); return result;
    }
}
export function CaptureContent (result)
{
    const content = result?.content;
    if (!Array.isArray (content) || content.length !== 1 || content[0].type !== 'image' || content[0].mimeType !== 'image/png' || typeof content[0].data !== 'string' || content[0].data.length > 2000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test (content[0].data)) { throw AgentError ('result_too_large', 'Invalid or oversized screenshot. Capture a smaller viewport.'); }
    const data = content[0].data;
    if (data.length % 4 || !data.startsWith ('iVBORw0KGgo')) { throw AgentError ('command_failed', 'Invalid PNG image.'); }
    return [{ type : 'text', text : JSON.stringify ({ scope : result.scope, width : result.width, height : result.height, capturedAt : result.capturedAt }) }, content[0]];
}
