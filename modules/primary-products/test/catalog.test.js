import assert from 'node:assert/strict';
import {ListProductDesigns,ProductDesign,ProductCategories} from '../src/catalog.js';
import {CreatePrimaryProduct} from '../src/geometry.js';
import {CreateLabelMesh,ValidateProductArtwork} from '../src/artwork.js';
import {ListProductMaterials} from '../src/materials.js';
describe('Product design catalog and shells',()=>{
 it('builds every catalog design with finite geometry, supported materials and accurate closed bounds',()=>{
  assert.equal(Object.keys(ProductCategories).length,5); assert.equal(ListProductDesigns().length,38);assert.equal(ListProductDesigns('pouches').filter(d=>d.changes.pouchShape?.style==='standup').length,5); assert.equal(ListProductDesigns('clamshells').length,8);
  for(const item of ListProductDesigns()){const d=ProductDesign(item.id),p=CreatePrimaryProduct(d),bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];assert.ok(item.source.startsWith('https://'));assert.ok(ListProductMaterials(d.family).some(m=>m.id===d.material));for(const m of p.components){for(let i=0;i<m.positions.length;i++){const v=m.positions[i];assert.ok(Number.isFinite(v));bounds[0][i%3]=Math.min(bounds[0][i%3],v);bounds[1][i%3]=Math.max(bounds[1][i%3],v);}}for(let i=0;i<3;i++){assert.ok(Math.abs(bounds[0][i]-p.bounds.min[i])<1e-6);assert.ok(Math.abs(bounds[1][i]-p.bounds.max[i])<1e-6);}}
 });
 it('creates closed shell components with positive volume and planar top/bottom artwork',()=>{
  const d=ProductDesign('food-deli'),p=CreatePrimaryProduct(d);
  for(const m of p.components){const edges=new Map();let volume=0;const point=i=>m.positions.slice(i*3,i*3+3),key=i=>point(i).map(v=>Math.round(v*1e6)).join();for(let i=0;i<m.indices.length;i+=3){const ids=m.indices.slice(i,i+3),[a,b,c]=ids.map(point);volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;for(let j=0;j<3;j++){const k=[key(ids[j]),key(ids[(j+1)%3])].sort().join('/');edges.set(k,(edges.get(k)||0)+1);}}assert.ok(volume>0);assert.ok([...edges.values()].every(v=>v===2));}
  for(const zone of ['front','back']){const [a]=ValidateProductArtwork(d,[{resourceId:'a'.repeat(64),name:'Art',mime:'image/png',zone,widthMm:50,heightMm:40}]);const m=CreateLabelMesh(d,a);assert.ok(m.positions.filter((v,i)=>i%3===1).every(v=>v===(zone==='front'?65.15:-.15)));assert.equal(m.normals[1],zone==='front'?1:-1);}
 });
 it('isolates catalog snapshots and rejects unknown designs',()=>{const a=ListProductDesigns();a[0].changes.heightMm=999;assert.notEqual(ListProductDesigns()[0].changes.heightMm,999);assert.throws(()=>ProductDesign('missing'));assert.throws(()=>ListProductDesigns('missing'));});
});
