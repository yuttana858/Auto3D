const DefaultSupabaseUrl = 'https://iesepcoxqochycckbwoh.supabase.co';
const DefaultPublishableKey = 'sb_publishable_CmRJpuYE32OBF9rIV1jwqQ_diMF7OXh';
const Bucket = 'auto3d-hdri';

function json (data, status = 200)
{
    return new Response (JSON.stringify (data), {
        status,
        headers : {
            'Content-Type' : 'application/json',
            'Cache-Control' : 'public, max-age=300, s-maxage=3600',
            'X-Content-Type-Options' : 'nosniff'
        }
    });
}

export async function onRequest (context)
{
    if (context.request.method !== 'GET') { return json ({ error : 'Method not allowed.' }, 405); }
    const url = String (context.env.SUPABASE_URL || DefaultSupabaseUrl).replace (/\/$/, '');
    const key = String (context.env.SUPABASE_PUBLISHABLE_KEY || DefaultPublishableKey);
    try {
        const response = await fetch (url + '/rest/v1/auto3d_environments?select=id,name,preview_path,render_path,thumbnail_path,source_url,license,sort_order&order=sort_order.asc,id.asc', {
            headers : { apikey : key }
        });
        if (!response.ok) { throw new Error ('Environment catalog unavailable.'); }
        const publicBase = url + '/storage/v1/object/public/' + Bucket + '/';
        const rows = await response.json ();
        return json (rows.map ((row) => ({
            id : row.id,
            name : row.name,
            previewUrl : publicBase + row.preview_path,
            renderUrl : row.render_path ? publicBase + row.render_path : null,
            thumbnailUrl : publicBase + row.thumbnail_path,
            sourceUrl : row.source_url,
            license : row.license
        })));
    } catch (error) {
        console.error ('Auto3D environment catalog error', error);
        return json ({ error : 'Environment catalog unavailable.' }, 502);
    }
}
