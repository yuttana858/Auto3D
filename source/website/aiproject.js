import { Unit } from '../engine/model/unit.js';
import { Importer, ImportSettings } from '../engine/import/importer.js';
import { InputFilesFromFileObjects } from '../engine/import/importerfiles.js';
import { SceneDocument } from './scenedocument.js';
import { CreateSessionArchive, PackSession } from './sessionarchive.js';

export async function AIProjectArchive (assets, name, tasks = [])
{
    if (!assets.length) { throw new Error ('Preview a completed 3D model before saving the project.'); }
    const document = new SceneDocument (); document.name = name;
    for (const asset of assets) {
        const filename = 'meshy-' + asset.id + '.glb'; const file = new File ([asset.buffer], filename, { type : 'model/gltf-binary' });
        const importer = new Importer ();
        const result = await new Promise ((resolve, reject) => importer.ImportFiles (InputFilesFromFileObjects ([file]), new ImportSettings (), { onFileListProgress : () => {}, onFileLoadProgress : () => {}, onLoadStart : () => {}, onImportStart : () => {}, onSelectMainFile : (files, select) => select (0), onImportSuccess : resolve, onImportError : error => reject (new Error (error.message || 'AI model could not be archived.')) }));
        result.model.SetUnit (Unit.Meter); result.model.materials.forEach ((material, index) => { material.gltfMaterialIndex = index; });
        const object = document.AddImported (result.model, asset.name || filename, result.upVector); object.scale = [asset.scale, asset.scale, asset.scale]; document.ApplyTransform (object);
        object.animationAsset = { main : filename, files : [{ name : filename, buffer : asset.buffer }] };
        object.userData.ai = JSON.stringify ({ id : asset.id, type : asset.type, route : asset.route, prompt : asset.name || '' });
    }
    return { archive : CreateSessionArchive (PackSession (document, { aiProject : { version : 1, tasks : tasks.map (({ id, name, type, status }) => ({ id, name, type, status })) } })), objects : document.objects.length };
}
