export function onRequestGet ()
{
    return Response.json ({ service : 'auto3d-library-api', status : 'ok', publishing : 'awaiting-corporate-identity' }, {
        headers : { 'Cache-Control' : 'no-store', 'X-Content-Type-Options' : 'nosniff' }
    });
}
