import { CustomBlending, SrcAlphaFactor } from 'three';
import { ConvertModelToThreeObject, ModelToThreeConversionParams, ModelToThreeConversionOutput } from '../source/engine/threejs/threeconverter.js';
import { ImporterGltf } from '../source/engine/import/importergltf.js';
import { RGBColor } from '../source/engine/model/color.js';
import { RecoverySnapshot } from '../source/website/sessionrecovery.js';
import { PackRecoverySnapshot } from '../source/website/sessionrecoverypack.js';
import assert from 'node:assert/strict';
import * as module from '../modules/primary-products/src/index.js';
import { ValidateLabelSource, TextLabelSVG } from '../modules/primary-products/src/labelsource.js';
import { PrimaryProductModel } from '../source/website/primaryproductsadapter.js';
import { PrimaryProductsPanel } from '../source/website/primaryproductspanel.js';
import { PrimaryProductsWorkspace } from '../source/website/primaryproductsworkspace.js';
import { PrimaryProductsArtwork } from '../source/website/primaryproductsartwork.js';
import { PrimaryProfileWorkspace } from '../source/website/primaryprofileworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { PackSession, ReadSession } from '../source/website/sessionarchive.js';
import { Unit } from '../source/engine/model/unit.js';
import { ExporterGltf } from '../source/engine/export/exportergltf.js';
import { ExporterModel } from '../source/engine/export/exportermodel.js';
import { FileFormat } from '../source/engine/io/fileutils.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { ProductSurfaceMaps } from '../modules/primary-products/src/surfaces.js';
function fixture () {
    const editor = { document : new SceneDocument (), history : new SceneHistory (), selected : null, busy : false, readOnly : false, async Render () {}, RefreshButtons () {}, Status () {} };
    const panel = Object.assign (Object.create (PrimaryProductsPanel.prototype), { website : { auth : { user : { id : 'owner' } }, preferences : { units : 'metric' }, accountReady : true, sessionEditor : editor }, draft : module.UpdateProductDraft (module.ProductDesign ('rect-cleaner'), { material : 'glass' }), Refresh () {} });
    panel.products = new PrimaryProductsWorkspace (panel, async () => module); panel.artwork = new PrimaryProductsArtwork (panel); panel.profileEditor = new PrimaryProfileWorkspace (panel); panel.website.primaryProductsPanel = panel;
    return { panel, editor, registry : CreateAgentCommands (panel.website) };
}
function closedVolume (mesh) {
    const point = i => mesh.positions.slice (i*3, i*3+3), key = i => point (i).map (v => Math.round (v*1e6)).join (','), edges = new Map (); let volume = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const ids = mesh.indices.slice (i,i+3), [a,b,c] = ids.map (point);
        volume += (a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
        for (let j = 0; j < 3; j++) { const k = [key(ids[j]),key(ids[(j+1)%3])].sort ().join ('/'); edges.set (k,(edges.get(k)||0)+1); }
    }
    assert.ok ([...edges.values ()].every (n => n===2), 'Every welded edge must have two incident faces.'); assert.ok (volume > 0); return volume;
}
describe ('Bottle walls, contents and editable label sources', function () {
    this.timeout (20000);
    it ('fills actual round, oval and rectangle cavities with closed, finite geometry at low/partial/full heights', () => {
        for (const section of [undefined, { shape : 'oval', depthMm : 55 }, { shape : 'rectangle', depthMm : 55, cornerRadiusMm : 8 }]) {
            const d = module.UpdateProductDraft (module.ProductDesign ('boston-inspired'), { bottleSection : section || null, material : 'glass' }); let previous = 0;
            for (const fillPercent of [1,50,70,100]) {
                const data = module.CreatePrimaryProduct ({ ...d, contents : { type : 'oil', fillPercent } }), fill = data.components.find (m => m.id === 'contents'), body = data.components[0];
                assert.ok (fill.positions.every (Number.isFinite) && fill.normals.every (Number.isFinite)); assert.ok (fill.positions.every ((v,i) => v >= data.bounds.min[i%3] && v <= data.bounds.max[i%3]));
                const volume = closedVolume (fill); assert.ok (volume > previous); previous = volume;
                const half = body.positions.length / 2, inner = body.positions.slice (half); assert.ok (Math.min (...fill.positions.filter ((_,i) => i%3===1)) >= Math.min (...inner.filter ((_,i) => i%3===1)));
            }
            assert.equal (module.CreatePrimaryProduct ({ ...d, contents : { type : 'liquid', fillPercent : 0 } }).components.some (m=>m.id==='contents'), false);
        }
    });
    it ('validates settings and family transitions without changing the draft', () => {
        const d=module.UpdateProductDraft(module.ProductDesign ('boston-inspired'),{material:'glass'});
        for (const contents of [{type:'unknown'}, {type:'oil',fillPercent:101}, {type:'oil',viscosity:NaN}, {type:'oil',opacity:2}]) { assert.throws (() => module.UpdateProductDraft (d,{contents})); }
        assert.throws (()=>module.UpdateProductDraft(module.DefaultProductDraft ('can'),{contents:{type:'oil'}}));
        const next=module.ProfileChanges(d,{wallMm:1,contents:{type:'oil'},optics:{color:'#225533',opacity:.05}}); assert.equal(next.contents.viscosity,80); assert.equal(next.details.wallMm,1);
        assert.equal(module.UpdateProductDraft(next,{family:'can'}).contents,undefined); assert.equal(module.ProfileChanges(next,{contents:null}).contents,undefined);
        assert.throws(()=>module.ProfileChanges(next,{wallMm:9})); assert.throws(()=>module.ProfileChanges(next,{optics:{ior:4}}));
    });
    it ('preserves custom surfaces, updates optical thickness in scene units, supports commands/Undo and empties/reset optics', async () => {
        const {panel,editor,registry}=fixture(); await panel.products.Generate(); const id=editor.selected.id; editor.document.model.materials[0].clearcoat=.73;
        let result=await registry.Execute('primary.profile.update',{objectId:id,wallMm:1.4,optics:{color:'#336633',opacity:.1,ior:1.52,tintDistanceMm:18},contents:{type:'oil',fillPercent:65}}); assert.equal(result.ok,true,JSON.stringify(result));
        assert.equal(editor.selected.id,id); assert.equal(editor.document.objects.length,1); let model=editor.document.CompactModel([editor.selected],true),body=model.materials[0],fill=model.materials.find(m=>m.name.endsWith('contents'));
        assert.equal(body.clearcoat,.73); assert.equal(body.thickness,1.4); assert.equal(body.transmission,.9); assert.equal(body.attenuationDistance,18); assert.equal(fill.transmissionBackground,true); assert.equal(fill.transparent,false); assert.equal(fill.opacity,.48);
        const saved=ReadSession(PackSession(editor.document)).document; assert.equal(saved.model.materials[0].attenuationColor.g,102); assert.equal(JSON.parse(saved.objects[0].userData._auto3dPrimaryProduct).draft.contents.fillPercent,65);
        await editor.history.Undo(); assert.equal(panel.profileEditor.Inspect().draft.contents,undefined); await editor.history.Redo();
        result=await registry.Execute('primary.contents.set',{contents:null}); assert.equal(result.ok,true); assert.equal(editor.document.CompactModel([editor.selected],true).meshes.some(m=>m.name==='contents'),false);
        result=await registry.Execute('primary.glass.set',{optics:null}); assert.equal(result.ok,true); body=editor.document.CompactModel([editor.selected],true).materials[0]; assert.equal(body.attenuationDistance,0); assert.equal(body.transmission,1);
        const inches=PrimaryProductModel(module.CreatePrimaryProduct(module.ProfileChanges(panel.draft,{optics:{tintDistanceMm:25.4},wallMm:1.4})),Unit.Inch); assert.equal(inches.materials[0].thickness,1.4/25.4); assert.equal(inches.materials[0].attenuationDistance,1);
    });
    it ('retains long editable vector/text sources in archives and rejects malformed sources', async () => {
        const {panel,editor}=fixture(), svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><desc>'+ 'x'.repeat(4000)+'</desc><rect width="100" height="100"/></svg>';
        panel.artwork.entries=[{resourceId:'a'.repeat(64),name:'Art',mime:'image/png',zone:'front',widthMm:20,heightMm:25,source:{kind:'svg',svg}}];panel.artwork.resources.set('a'.repeat(64),ProductSurfaceMaps('paper').bumpMap);await panel.products.Generate();
        const saved=ReadSession(PackSession(editor.document)).document; assert.equal(JSON.parse(saved.objects[0].userData._auto3dPrimaryProduct).artwork[0].source.svg,svg);
        assert.match(TextLabelSVG({text:'A & <B>'}),/A &amp; &lt;B&gt;/);assert.throws(()=>ValidateLabelSource({kind:'text',text:'hi',fontFamily:'external'}));assert.throws(()=>ValidateLabelSource({kind:'svg',svg:'x'.repeat(70000)}));
    });
    it ('exports absorption and contents coverage with glTF volume and alpha properties', async () => {
        const d=module.ProfileChanges(module.ProductDesign('boston-inspired'),{material:'glass',optics:{color:'#336633',tintDistanceMm:20},contents:{type:'oil'}}),model=PrimaryProductModel(module.CreatePrimaryProduct(d),Unit.Millimeter);
        const files=await new Promise(resolve=>new ExporterGltf().Export(new ExporterModel(model),FileFormat.Text,resolve));
        const json=JSON.parse(files.find(f=>f.GetName().endsWith('.gltf')).GetTextContent()); const body=json.materials[0],fill=json.materials.find(m=>m.name.endsWith('contents'));
        assert.equal(body.extensions.KHR_materials_volume.attenuationDistance,20); assert.equal(body.extensions.KHR_materials_volume.attenuationColor.length,3); assert.equal(fill.alphaMode,'BLEND'); assert.equal(fill.extras.swAuto3D.transmissionBackground,true);
    });
    it ('composites smooth contents into refraction and retains optics through recovery and GLB import', async () => {
        const draft=module.ProfileChanges(module.ProductDesign('boston-inspired'),{material:'glass',optics:{color:'#336633',tintDistanceMm:20},contents:{type:'oil'}});draft.details.textureStrength=0;
        const model=PrimaryProductModel(module.CreatePrimaryProduct(draft),Unit.Millimeter);
        const converted=await new Promise(resolve=>ConvertModelToThreeObject(model,new ModelToThreeConversionParams(),new ModelToThreeConversionOutput(),{onModelLoaded:resolve,onTextureLoaded(){}}));
        let fill;converted.traverse(node=>{if(node.name==='contents'){fill=node;}});assert.ok(fill);const material=fill.material[0];assert.equal(material.blending,CustomBlending);assert.equal(material.blendSrc,SrcAlphaFactor);assert.equal(material.transparent,false);assert.equal(material.depthWrite,false);assert.equal(material.opacity,.48);assert.equal(fill.renderOrder,1);
        const doc=new SceneDocument();doc.AddImported(model,'Filled bottle');const recovered=ReadSession(PackRecoverySnapshot(structuredClone(RecoverySnapshot(doc,{})))).document;
        assert.equal(recovered.model.materials[0].attenuationDistance,20);assert.equal(recovered.model.materials.find(m=>m.name.endsWith('contents')).transmissionBackground,true);
        const files=await new Promise(resolve=>new ExporterGltf().Export(new ExporterModel(model),FileFormat.Binary,resolve)), importer=new ImporterGltf();
        await new Promise((resolve,reject)=>importer.Import(files[0].GetName(),'glb',files[0].GetBufferContent(),{getDefaultMaterialColor:()=>new RGBColor(0,0,0),getDefaultLineMaterialColor:()=>new RGBColor(0,0,0),getFileBuffer:()=>null,onSuccess:resolve,onError:()=>reject(new Error(importer.GetErrorMessage()))}));
        assert.equal(importer.GetModel().materials[0].attenuationDistance,20);assert.equal(importer.GetModel().materials[0].attenuationColor.g,102);assert.equal(importer.GetModel().materials.find(m=>m.name.endsWith('contents')).transmissionBackground,true);
    });

    it ('accepts heavier glass walls and preserves manual optical overrides on dimension-only rebuilds', async () => {
        const {panel,editor}=fixture();await panel.products.Generate();
        await panel.UpdateProfile({wallMm:3,contents:{type:'oil'},optics:{color:'#aacccc',ior:1.5}},editor.selected.id);
        const current=editor.document.model.materials.filter(m=>m.name==='Primary Products · body').at(-1);current.ior=1.6;
        await panel.UpdateProfile({heightMm:260},editor.selected.id);
        const body=editor.document.CompactModel([editor.selected],true).materials[0];assert.equal(body.thickness,3);assert.equal(body.ior,1.6);
        const changed=module.ProfileChanges(panel.draft,{color:'#ccaa88'});assert.equal(changed.optics.color,'#ccaa88');
        const data=module.CreatePrimaryProduct(changed);closedVolume(data.components.find(m=>m.id==='contents'));
    });

});
