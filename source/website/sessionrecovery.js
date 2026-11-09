// Snapshot only session data, never DOM/WebGL objects. Geometry packing and ZIP
// compression run in a worker; structured cloning remains a bounded UI cost.
function SnapshotNode (node)
{
    return { name : node.name, gltfNodeIndex : node.gltfNodeIndex, matrix : node.GetTransformation ().GetMatrix ().Get (), meshes : node.meshIndices, children : node.childNodes.map (SnapshotNode) };
}

export function RecoverySnapshot (document, view, kind = 'session', name = document.name)
{
    return {
        name, kind, view, dimensions : (document.dimensions || []).filter (d => document.objects.some (o => o.id === d.objectId)).map (d => ({ ...d })), dimensionsVisible : document.dimensionsVisible !== false, packaging : kind === 'session' ? document.packaging : null, unit : document.model.unit, properties : document.model.propertyGroups,
        meshes : document.model.meshes, materials : document.model.materials,
        objects : document.objects.map ((object) => {
            const { threeObject, player, node, animationError, ...data } = object;
            return { ...data, playback : object.playback ? { ...object.playback, playing : false } : undefined, node : SnapshotNode (node) };
        })
    };
}

export class RecoveryWriter
{
    Create (document, view, kind = 'session', name = document.name)
    {
        if (this.pending) { throw new Error ('Recovery save is already running.'); }
        const script = Array.from (window.document.scripts).find ((item) => item.src.includes ('o3dv.website.min.js'));
        if (!script) { throw new Error ('Recovery worker bundle location is unavailable.'); }
        return new Promise ((resolve, reject) => {
            this.reject = reject; this.pending = true;
            try {
                const workerURL = new URL ('o3dv.recovery.js', script.src); workerURL.search = new URL (script.src).search;
                this.worker ||= new Worker (workerURL);
                this.worker.onmessage = ({ data }) => { this.pending = false; this.reject = null; if (data.error) { reject (new Error (data.error)); } else { resolve (data.archive); } };
                this.worker.onerror = (event) => { this.Finish (); reject (new Error (event.message || 'Recovery worker failed.')); };
                const snapshot = RecoverySnapshot (document, view, kind, name);
                const sameGeometry = this.meshes && this.meshes.length === snapshot.meshes.length && this.meshes.every ((mesh, index) => mesh === snapshot.meshes[index]);
                if (sameGeometry) { delete snapshot.meshes; } else { this.meshes = [...snapshot.meshes]; }
                this.worker.postMessage (snapshot);
            } catch (error) { this.Finish (); reject (error); }
        });
    }
    Finish () { this.worker?.terminate (); this.worker = null; this.reject = null; this.pending = false; this.meshes = null; }
    Cancel () { const reject = this.reject; this.Finish (); reject?.(new Error ('Recovery save canceled.')); }
}
