import { VerifyEntraToken } from './auth/entra-jwt.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const Kinds = new Set (['model', 'session']);

function list (value, fallback)
{
    return String (value || fallback).split (',').map ((item) => item.trim ()).filter (Boolean);
}

export function ValidateId (id)
{
    if (!UUID.test (String (id || ''))) { const error = new Error ('Invalid library id.'); error.status = 400; throw error; }
}

export function ValidateMetadata (item)
{
    ValidateId (item.id);
    if (typeof item.name !== 'string' || !item.name.trim () || item.name.trim ().length > 100) { throw Object.assign (new Error ('Name must contain 1-100 characters.'), { status : 400 }); }
    if (typeof item.category !== 'string' || !item.category.trim () || item.category.length > 100) { throw Object.assign (new Error ('Category is invalid.'), { status : 400 }); }
    if (!Kinds.has (item.kind)) { throw Object.assign (new Error ('Kind must be model or session.'), { status : 400 }); }
    if (!Number.isInteger (item.objectCount) || item.objectCount < 1 || item.objectCount > 1000) { throw Object.assign (new Error ('Object count is invalid.'), { status : 400 }); }
    if (item.version !== undefined && (!Number.isInteger (item.version) || item.version < 1)) { throw Object.assign (new Error ('Version is invalid.'), { status : 400 }); }
    if (item.supersedesId) { ValidateId (item.supersedesId); }
    return { ...item, name : item.name.trim (), category : item.category.trim () };
}

export async function Authenticate (authorization, env = process.env, verify = VerifyEntraToken)
{
    const match = /^Bearer\s+(.+)$/i.exec (authorization || '');
    if (!match) { throw Object.assign (new Error ('Authentication required.'), { status : 401 }); }
    try { return await verify (match[1], env); }
    catch (error) { throw Object.assign (new Error (error.message), { status : 401 }); }
}

export function RequireRole (actor, roles)
{
    if (!actor.roles.some ((role) => roles.includes (role))) { throw Object.assign (new Error ('Insufficient Auto3D role.'), { status : 403 }); }
}

export class LibraryService
{
    constructor (adapter, env = process.env, verify = VerifyEntraToken)
    {
        this.adapter = adapter; this.env = env; this.verify = verify;
        this.publisherRoles = list (env.AUTO3D_PUBLISH_ROLES, 'Auto3D.Publisher,Auto3D.Admin');
        this.adminRoles = list (env.AUTO3D_ADMIN_ROLES, 'Auto3D.Admin');
    }

    List () { return this.adapter.List (); }
    async Get (id) { ValidateId (id); return this.adapter.Get (id); }
    async Download (id, type) { ValidateId (id); return this.adapter.Download (id, type); }

    async Publish (authorization, metadata, archive, thumbnail)
    {
        const actor = await Authenticate (authorization, this.env, this.verify); RequireRole (actor, this.publisherRoles);
        const item = ValidateMetadata (metadata);
        if (!archive?.byteLength || !thumbnail?.byteLength) { throw Object.assign (new Error ('Archive and thumbnail are required.'), { status : 400 }); }
        if (archive.byteLength > 64 * 1024 * 1024) { throw Object.assign (new Error ('Archive exceeds the 64 MB limit.'), { status : 413 }); }
        return this.adapter.Publish (item, archive, thumbnail, actor);
    }

    async Delete (authorization, id)
    {
        ValidateId (id);
        const actor = await Authenticate (authorization, this.env, this.verify); RequireRole (actor, this.adminRoles);
        return this.adapter.Delete (id);
    }
}
