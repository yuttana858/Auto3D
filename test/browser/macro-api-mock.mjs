// In-memory /api/macros for browser tests, with the same owner/administrator rules as the
// database functions. Never used outside tests.
export async function MockMacroApi (page, { user, admins = [] })
{
    const rows = [];
    await page.route ('**/api/macros', async route => {
        const request = route.request (), method = request.method (), body = request.postData () ? JSON.parse (request.postData ()) : null, admin = admins.includes (user);
        const find = name => rows.find (row => row.name.toLowerCase () === name.toLowerCase ());
        if (method === 'GET') { return route.fulfill ({ json : { isAdmin : admin, macros : rows.map (row => ({ name : row.name, macro : row.macro, savedBy : row.savedBy, mine : row.owner === user, canEdit : row.owner === user || admin, revision : row.revision, updatedAt : row.updatedAt })) } }); }
        const row = find (body.name);
        if (row && row.owner !== user && !admin) { return route.fulfill ({ status : 403, json : { error : 'Only the person who saved this macro, or an administrator, can replace it.' } }); }
        if (method === 'DELETE') { if (!row) { return route.fulfill ({ status : 404, json : { error : 'No shared macro with that name.' } }); } rows.splice (rows.indexOf (row), 1); return route.fulfill ({ json : { deleted : row.name } }); }
        if (row && body.revision && body.revision !== row.revision) { return route.fulfill ({ status : 409, json : { error : 'This macro changed in another session. Reload the library before saving.' } }); }
        const next = { name : body.name, macro : body.macro, owner : row?.owner || user, savedBy : row?.savedBy || 'tester', revision : crypto.randomUUID (), updatedAt : new Date ().toISOString () };
        if (row) { Object.assign (row, next); } else { rows.push (next); }
        return route.fulfill ({ json : { name : next.name, revision : next.revision, savedBy : next.savedBy, updatedAt : next.updatedAt, created : !row } });
    });
    return rows;
}
