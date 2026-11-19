import assert from 'node:assert/strict';

// History can retain unused materials; inspect only indices assigned to the current scene object.
export async function ObserveCurrentMaterials (page)
{
    await page.evaluate (() => {
        const prototype = OV.Engine.Viewer.prototype, original = prototype.SetMainObject;
        const probe = window.primaryMaterialProbe = { root : null, restore : () => { prototype.SetMainObject = original; } };
        prototype.SetMainObject = function (...args) {
            const result = original.apply (this, args);
            if (this.renderer?.domElement === document.querySelector ('#main_viewer canvas')) { probe.root = args[0]; }
            return result;
        };
    });
    return {
        read : async (call, objectId) => {
            const scene = await call ('scene.inspect'), index = scene.objects.findIndex (object => object.id === (objectId || scene.selectedObjectId));
            assert.ok (index >= 0, 'current material target exists');
            const ids = await page.evaluate (({ index, name }) => {
                const object = window.primaryMaterialProbe.root?.children[index];
                if (!object || object.name !== name) { throw new Error ('Current renderer and scene object order differ.'); }
                const indices = new Set (); object.traverse (mesh => { for (const material of mesh.userData.originalMaterials || []) { indices.add (material); } });
                return [...indices];
            }, { index, name : scene.objects[index].name });
            assert.ok (ids.length, 'current object has assigned materials');
            return (await call ('material.list')).filter (material => ids.includes (material.index));
        },
        dispose : async () => { if (!page.isClosed ()) { await page.evaluate (() => { window.primaryMaterialProbe?.restore (); delete window.primaryMaterialProbe; }).catch (() => {}); } }
    };
}
