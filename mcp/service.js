import { Validate } from '../source/website/commandregistry.js';
import { Identifier, ReadTools } from './common.js';

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
    modules : { title : 'Modules', categories : ['Packaging', 'AI', 'Panels', 'Knowledge'] },
    sessions : { title : 'Sessions & Library', categories : ['Sessions', 'Library'] },
    settings : { title : 'Settings & Administration', categories : ['Account', 'Administration', 'Preferences', 'Diagnostics'] }
});
const FamilySchema = { type : 'object', properties : { category : { type : 'string', maxLength : 80 }, search : { type : 'string', maxLength : 120 }, offset : { type : 'integer', minimum : 0, maximum : 10000 }, limit : { type : 'integer', minimum : 1, maximum : 25 } }, additionalProperties : false };
const FamilyTools = Object.entries (Families).map (([id, family]) => ({ id : 'auto3d.' + id, title : family.title, description : 'Browse ' + family.title + ' categories, then request a category to see paginated command schemas. Run a selected command using auto3d.commands.invoke with auto3d.write. Modules shows connected panels when permission permits.', mutates : false, inputSchema : FamilySchema }));

function ValidateInvocation (value)
{
    if (!value || typeof value !== 'object' || Array.isArray (value) || Object.keys (value).some (key => !['command', 'arguments'].includes (key)) || typeof value.command !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test (value.command) || !value.arguments || typeof value.arguments !== 'object' || Array.isArray (value.arguments)) { throw new Error ('Invalid command invocation. Use a command ID and object arguments from the catalog.'); }
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
        return actor.scope.includes ('auto3d.write') ? [...basic, ...FamilyTools, ...CatalogTools] : [...basic, ...FamilyTools];
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
        Validate (args, CatalogTools[1].inputSchema);
        const categories = this.Categories (), category = args.category && categories.find (item => item.category.toLowerCase () === args.category.toLowerCase ())?.category;
        if (args.category && !category) { throw new Error ('Unknown category. Use auto3d.commands.categories to list available categories.'); }
        const search = (args.search || '').trim ().toLowerCase (), offset = args.offset || 0, limit = args.limit || 20;
        const matches = this.tools.filter (tool => (!category || tool.category === category) && (!search || JSON.stringify ([tool.id, tool.title, tool.category, tool.description]).toLowerCase ().includes (search)));
        const commands = matches.slice (offset, offset + limit).map (({ id, title, category : group, description, mutates, inputSchema, example }) => ({ id, title, category : group, description, mutates, inputSchema, example }));
        return { total : matches.length, offset, limit, nextOffset : offset + commands.length < matches.length ? offset + commands.length : null, commands };
    }
    BrowseFamily (familyId, args)
    {
        Validate (args, FamilySchema);
        const family = Families[familyId]; if (!family) { throw new Error ('Unknown tool family.'); }
        const categories = this.Categories ().filter (item => family.categories.includes (item.category) || familyId === 'settings' && !Object.values (Families).some (entry => entry.categories.includes (item.category)));
        if (!args.category && !args.search) { return { family : family.title, categories, hint : familyId === 'modules' ? 'Use auto3d.commands.invoke with ui.modules.inspect to list running panels.' : 'Choose a category to list its commands.' }; }
        const category = args.category && categories.find (item => item.category.toLowerCase () === args.category.toLowerCase ())?.category;
        if (args.category && !category) { throw new Error ('Category is not in this family.'); }
        const allowed = new Set (categories.map (item => item.category));
        const search = (args.search || '').trim ().toLowerCase (), offset = args.offset || 0, limit = args.limit || 20;
        const matches = this.tools.filter (tool => allowed.has (tool.category) && (!category || tool.category === category) && (!search || JSON.stringify ([tool.id, tool.title, tool.description]).toLowerCase ().includes (search)));
        const commands = matches.slice (offset, offset + limit).map (({ id, title, category : group, description, mutates, inputSchema, example }) => ({ id, title, category : group, description, mutates, inputSchema, example }));
        return { family : family.title, total : matches.length, offset, limit, nextOffset : offset + commands.length < matches.length ? offset + commands.length : null, commands };
    }
    async Assert (actor)
    {
        if (!actor?.scope?.includes ('auto3d.read') || !Number.isFinite (actor.expiresAt) || actor.expiresAt * 1000 <= Date.now ()) { throw new Error ('Read permission required.'); }
        Identifier (actor.userId); Identifier (actor.props?.registrationId);
        return this.broker.AssertRegistration ({ accountId : actor.userId, id : actor.props.registrationId });
    }
    async Call (actor, name, args, requestId = crypto.randomUUID ())
    {
        await this.Assert (actor);
        let result;
        if (name === 'auto3d.sessions.list') {
            Validate (args, { type : 'object', properties : {} }); result = await this.broker.List (actor.userId);
        } else if (name === 'auto3d.sessions.select') {
            Validate (args, { type : 'object', properties : { connectionId : { type : 'string', pattern : '^[A-Za-z0-9_-]{1,128}$' }, sessionId : { type : 'string', pattern : '^[A-Za-z0-9_-]{1,128}$' } }, required : ['connectionId', 'sessionId'] });
            await this.broker.Pair ({ accountId : actor.userId, grantId : actor.props.registrationId, ...args, expiresAt : actor.expiresAt * 1000 }); result = args;
        } else if (FamilyTools.some (tool => tool.id === name)) {
            result = this.BrowseFamily (name.slice ('auto3d.'.length), args);
            if (name === 'auto3d.modules' && !args.category && !args.search && actor.scope.includes ('auto3d.write')) {
                try {
                    const response = await this.broker.Dispatch ({ accountId : actor.userId, grantId : actor.props.registrationId, requestId, command : 'ui.modules.inspect', arguments : {} });
                    if (response?.ok !== true || response.command !== 'ui.modules.inspect') { throw new Error ('Module inspection unavailable.'); }
                    result.running = response.result;
                } catch { result.running = null; result.hint = 'Connect an active window to list its modules; categories remain available.'; }
            }
        } else if (name === 'auto3d.commands.categories') {
            if (!actor.scope.includes ('auto3d.write')) { throw new Error ('Write permission required.'); }
            Validate (args, CatalogTools[0].inputSchema); result = this.Categories ();
        } else if (name === 'auto3d.commands.list') {
            if (!actor.scope.includes ('auto3d.write')) { throw new Error ('Write permission required.'); }
            result = this.ListCommands (args);
        } else if (name === 'auto3d.commands.invoke') {
            if (!actor.scope.includes ('auto3d.write')) { throw new Error ('Write permission required.'); }
            ValidateInvocation (args);
            const tool = this.tools.find (item => item.id === args.command); if (!tool) { throw new Error ('Unknown command. List the command catalog to find an available ID.'); }
            Validate (args.arguments, tool.inputSchema);
            result = await this.broker.Dispatch ({ accountId : actor.userId, grantId : actor.props.registrationId, requestId, command : tool.id, arguments : args.arguments });
            if (result?.ok !== true || result.command !== tool.id) { throw new Error ('Browser request failed.'); }
            result = result.result;
        } else {
            const tool = this.Tools (actor).find (item => item.id === name); if (!tool) { throw new Error ('Tool unavailable.'); }
            Validate (args, tool.inputSchema);
            result = await this.broker.Dispatch ({ accountId : actor.userId, grantId : actor.props.registrationId, requestId, command : name, arguments : args });
            if (result?.ok !== true || result.command !== name) { throw new Error ('Browser request failed.'); }
            result = result.result;
        }
        await this.Assert (actor); return result;
    }
}
export function CaptureContent (result)
{
    const content = result?.content;
    if (!Array.isArray (content) || content.length !== 1 || content[0].type !== 'image' || content[0].mimeType !== 'image/png' || typeof content[0].data !== 'string' || content[0].data.length > 2000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test (content[0].data)) { throw new Error ('Invalid or oversized screenshot.'); }
    const data = content[0].data;
    if (data.length % 4 || !data.startsWith ('iVBORw0KGgo')) { throw new Error ('Invalid PNG image.'); }
    return [{ type : 'text', text : JSON.stringify ({ scope : result.scope, width : result.width, height : result.height, capturedAt : result.capturedAt }) }, content[0]];
}
