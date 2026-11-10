import { RunTasksBatch } from '../core/taskrunner.js';
import { IsEqual } from '../geometry/geometry.js';
import { CreateObjectUrl, CreateObjectUrlWithMimeType } from '../io/bufferutils.js';
import { MaterialSource, MaterialType } from '../model/material.js';
import { MeshInstance, MeshInstanceId } from '../model/meshinstance.js';
import { IsEmptyMesh } from '../model/meshutils.js';
import { ConvertColorToThreeColor, GetShadingType, ShadingType } from './threeutils.js';

import * as THREE from 'three';
import { SetMaterialReflectionStrength } from '../viewer/materialreflection.js';

export const MaterialGeometryType =
{
	Line : 1,
	Face : 2
};

export class ModelToThreeConversionParams
{
	constructor ()
	{
		this.forceMediumpForMaterials = false;
	}
}

export class ModelToThreeConversionOutput
{
	constructor ()
	{
		this.defaultMaterials = [];
		this.objectUrls = [];
	}
}

export class ThreeConversionStateHandler
{
	constructor (callbacks)
	{
		this.callbacks = callbacks;
		this.texturesNeeded = 0;
		this.texturesLoaded = 0;
		this.threeObject = null; this.failed = false; this.finished = false;
	}

	OnTextureNeeded ()
	{
		this.texturesNeeded += 1;
	}

	OnTextureLoaded ()
	{
		this.texturesLoaded += 1;
		this.callbacks.onTextureLoaded ();
		this.Finish ();
	}

	OnModelLoaded (threeObject)
	{
		this.threeObject = threeObject;
		this.Finish ();
	}

    OnError (error)
    {
        if (this.failed || this.finished) { return; } this.failed = true;
        if (this.callbacks.onError) { this.callbacks.onError (error); } else { throw error; }
    }

	Finish ()
	{
		if (!this.failed && !this.finished && this.threeObject !== null && this.texturesNeeded === this.texturesLoaded) {
            this.finished = true;
			this.callbacks.onModelLoaded (this.threeObject);
		}
	}
}

export class ThreeNodeTree
{
	constructor (model, threeRootNode)
	{
		this.model = model;
		this.threeNodeItems = [];
		this.AddNode (model.GetRootNode (), threeRootNode);
	}

	AddNode (node, threeNode)
	{
		let matrix = node.GetTransformation ().GetMatrix ();
		let threeMatrix = new THREE.Matrix4 ().fromArray (matrix.Get ());
		threeNode.applyMatrix4 (threeMatrix);

		for (let childNode of node.GetChildNodes ()) {
			let threeChildNode = new THREE.Object3D ();
			threeNode.add (threeChildNode);
			this.AddNode (childNode, threeChildNode);
		}
		for (let meshIndex of node.GetMeshIndices ()) {
			let id = new MeshInstanceId (node.GetId (), meshIndex);
			let mesh = this.model.GetMesh (meshIndex);
			this.threeNodeItems.push ({
				meshInstance : new MeshInstance (id, node, mesh),
				threeNode : threeNode
			});
		}
	}

	GetNodeItems ()
	{
		return this.threeNodeItems;
	}
}

export class ThreeMaterialHandler
{
	constructor (model, stateHandler, conversionParams, conversionOutput)
	{
		this.model = model;
		this.stateHandler = stateHandler;
		this.conversionParams = conversionParams;
		this.conversionOutput = conversionOutput;

		this.shadingType = GetShadingType (model);
		this.modelToThreeLineMaterial = new Map ();
		this.modelToThreeMaterial = new Map ();
	}

	GetThreeMaterial (modelMaterialIndex, geometryType)
	{
		if (geometryType === MaterialGeometryType.Face) {
			if (!this.modelToThreeMaterial.has (modelMaterialIndex)) {
				let threeMaterial = this.CreateThreeFaceMaterial (modelMaterialIndex);
				this.modelToThreeMaterial.set (modelMaterialIndex, threeMaterial);
			}
			return this.modelToThreeMaterial.get (modelMaterialIndex);
		} else if (geometryType === MaterialGeometryType.Line) {
			if (!this.modelToThreeLineMaterial.has (modelMaterialIndex)) {
				let threeMaterial = this.CreateThreeLineMaterial (modelMaterialIndex);
				this.modelToThreeLineMaterial.set (modelMaterialIndex, threeMaterial);
			}
			return this.modelToThreeLineMaterial.get (modelMaterialIndex);
		} else {
			return null;
		}
	}

	CreateThreeFaceMaterial (materialIndex)
	{
		let material = this.model.GetMaterial (materialIndex);
		let baseColor = ConvertColorToThreeColor (material.color);
		if (material.vertexColors) {
			baseColor.setRGB (1.0, 1.0, 1.0);
		}

		let materialParams = {
			color : baseColor,
			vertexColors : material.vertexColors,
			opacity : material.opacity,
			transparent : material.transparent,
			alphaTest : material.alphaTest,
            side : material.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
            emissiveIntensity : material.emissiveIntensity,
            bumpScale : material.bumpScale,
            normalScale : new THREE.Vector2 (material.normalScale, material.normalScale),
            aoMapIntensity : material.aoIntensity,
            displacementScale : material.displacementScale,
            displacementBias : material.displacementBias
		};

		if (this.conversionParams.forceMediumpForMaterials) {
			materialParams.precision = 'mediump';
		}

		let threeMaterial = null;
		if (this.shadingType === ShadingType.Phong) {
			threeMaterial = new THREE.MeshPhongMaterial (materialParams);
			if (material.type === MaterialType.Phong) {
				let specularColor = ConvertColorToThreeColor (material.specular);
				if (IsEqual (material.shininess, 0.0)) {
					specularColor.setRGB (0.0, 0.0, 0.0);
				}
				threeMaterial.specular = specularColor;
				threeMaterial.shininess = material.shininess * 100.0;
				this.LoadFaceTexture (threeMaterial, material.specularMap, (threeTexture) => {
					threeMaterial.specularMap = threeTexture;
				});
			}
		} else if (this.shadingType === ShadingType.Physical) {
            threeMaterial = new THREE.MeshPhysicalMaterial (materialParams);
			if (material.type === MaterialType.Physical) {
				threeMaterial.metalness = material.metalness;
				threeMaterial.roughness = material.roughness;
                threeMaterial.specularIntensity = material.specularIntensity;
                for (const key of ['transmission', 'ior', 'thickness']) { threeMaterial[key] = material[key]; }
                this.LoadFaceTexture (threeMaterial, material.specularMap, (threeTexture) => {
                    threeMaterial.specularColorMap = threeTexture;
                });
				this.LoadFaceTexture (threeMaterial, material.metalnessMap, (threeTexture) => {
					threeMaterial.metalnessMap = threeTexture;
					if (!material.roughnessMap) { threeMaterial.roughnessMap = threeTexture; }
				});
			}
            if (material.roughnessMap) { this.LoadFaceTexture (threeMaterial, material.roughnessMap, texture => { threeMaterial.roughnessMap = texture; }); }
		}

		let emissiveColor = ConvertColorToThreeColor (material.emissive);
		threeMaterial.emissive = emissiveColor;

		this.LoadFaceTexture (threeMaterial, material.diffuseMap, (threeTexture) => {
			if (!material.multiplyDiffuseMap) {
				threeMaterial.color.setRGB (1.0, 1.0, 1.0);
			}
			threeMaterial.map = threeTexture;
		});
		const activeRelief = material.reliefMode === 'off' ? 'off' :
			(material.reliefMode === 'bump' && material.bumpMap || !material.normalMap && material.bumpMap) ? 'bump' :
			material.normalMap ? 'normal' : material.bumpMap ? 'bump' : 'off';
		this.LoadFaceTexture (threeMaterial, material.bumpMap, (threeTexture) => {
			threeMaterial.auto3dBumpMap = threeTexture;
			if (activeRelief === 'bump') { threeMaterial.bumpMap = threeTexture; }
		});
		this.LoadFaceTexture (threeMaterial, material.normalMap, (threeTexture) => {
			threeMaterial.auto3dNormalMap = threeTexture;
			if (activeRelief === 'normal') { threeMaterial.normalMap = threeTexture; }
		});
		this.LoadFaceTexture (threeMaterial, material.emissiveMap, (threeTexture) => {
			threeMaterial.emissiveMap = threeTexture;
		});
        this.LoadFaceTexture (threeMaterial, material.aoMap, (threeTexture) => { threeMaterial.aoMap = threeTexture; });
        this.LoadFaceTexture (threeMaterial, material.displacementMap, (threeTexture) => { threeMaterial.displacementMap = threeTexture; });

        threeMaterial.name = material.name;
        if (material.type === MaterialType.Physical) {
            SetMaterialReflectionStrength (threeMaterial, material.specularIntensity);
        } else if (material.type === MaterialType.Phong) {
            SetMaterialReflectionStrength (threeMaterial, Math.max (material.specular.r / 255, material.specular.g / 255, material.specular.b / 255));
        } else {
            SetMaterialReflectionStrength (threeMaterial, 1);
        }

		if (material.source !== MaterialSource.Model) {
			threeMaterial.userData.source = material.source;
			this.conversionOutput.defaultMaterials.push (threeMaterial);
		}

		return threeMaterial;
	}

	CreateThreeLineMaterial (materialIndex)
	{
		let material = this.model.GetMaterial (materialIndex);
		let baseColor = ConvertColorToThreeColor (material.color);
		let materialParams = {
			color : baseColor,
			opacity : material.opacity
		};

		if (this.conversionParams.forceMediumpForMaterials) {
			materialParams.precision = 'mediump';
		}

		let threeMaterial = new THREE.LineBasicMaterial (materialParams);
		if (material.source !== MaterialSource.Model) {
			threeMaterial.userData.source = material.source;
			this.conversionOutput.defaultMaterials.push (threeMaterial);
		}

		return threeMaterial;
	}

	LoadFaceTexture (threeMaterial, texture, onTextureLoaded)
	{
		function SetTextureParameters (texture, threeTexture)
		{
            threeTexture.name = texture.name;
			threeTexture.wrapS = THREE.RepeatWrapping;
			threeTexture.wrapT = THREE.RepeatWrapping;
			threeTexture.rotation = texture.rotation;
			threeTexture.offset.x = texture.offset.x;
			threeTexture.offset.y = texture.offset.y;
			threeTexture.repeat.x = texture.scale.x;
			threeTexture.repeat.y = texture.scale.y;
		}

		if (texture === null || !texture.IsValid ()) {
			return;
		}
		let loader = new THREE.TextureLoader ();
		this.stateHandler.OnTextureNeeded ();
		let textureObjectUrl = null;
		if (texture.mimeType !== null) {
			textureObjectUrl = CreateObjectUrlWithMimeType (texture.buffer, texture.mimeType);
		} else {
			textureObjectUrl = CreateObjectUrl (texture.buffer);
		}
		this.conversionOutput.objectUrls.push (textureObjectUrl);
		loader.load (textureObjectUrl,
			(threeTexture) => {
                try {
                    SetTextureParameters (texture, threeTexture); threeMaterial.needsUpdate = true; onTextureLoaded (threeTexture); this.stateHandler.OnTextureLoaded ();
                } catch (error) { this.stateHandler.OnError (error); }
			},
			null,
			(err) => {
				this.stateHandler.OnTextureLoaded ();
			}
		);
	}
}

export class ThreeMeshMaterialHandler
{
	constructor (threeGeometry, geometryType, materialHandler)
	{
		this.threeGeometry = threeGeometry;
		this.geometryType = geometryType;
		this.materialHandler = materialHandler;

		this.itemVertexCount = null;
		if (geometryType === MaterialGeometryType.Face) {
			this.itemVertexCount = 3;
		} else if (geometryType === MaterialGeometryType.Line) {
			this.itemVertexCount = 2;
		}

		this.meshThreeMaterials = [];
		this.meshOriginalMaterials = [];

		this.groupStart = null;
		this.previousMaterialIndex = null;
	}

	ProcessItem (itemIndex, materialIndex)
	{
		if (this.previousMaterialIndex !== materialIndex) {
			if (this.groupStart !== null) {
				this.AddGroup (this.groupStart, itemIndex - 1);
			}
			this.groupStart = itemIndex;

			let threeMaterial = this.materialHandler.GetThreeMaterial (materialIndex, this.geometryType);
			this.meshThreeMaterials.push (threeMaterial);
			this.meshOriginalMaterials.push (materialIndex);

			this.previousMaterialIndex = materialIndex;
		}
	}

	Finalize (itemCount)
	{
		this.AddGroup (this.groupStart, itemCount - 1);
	}

	AddGroup (start, end)
	{
		let materialIndex = this.meshThreeMaterials.length - 1;
		this.threeGeometry.addGroup (start * this.itemVertexCount, (end - start + 1) * this.itemVertexCount, materialIndex);
	}
}

export function ConvertModelToThreeObject (model, conversionParams, conversionOutput, callbacks)
{
	function CreateThreeTriangleMesh (meshInstance, materialHandler)
	{
		let mesh = meshInstance.mesh;
		let triangleCount = mesh.TriangleCount ();
		if (triangleCount === 0) {
			return null;
		}

		// Most generated meshes use a single material. Avoid allocating and sorting
		// a triangle-index array in that common case; for dense meshes this removes
		// a large O(n log n) main-thread step and significant temporary memory.
		let firstMaterial = mesh.GetTriangle (0).mat;
		let hasMultipleMaterials = false;
		for (let i = 1; i < triangleCount; i++) {
			if (mesh.GetTriangle (i).mat !== firstMaterial) {
				hasMultipleMaterials = true;
				break;
			}
		}
		let triangleIndices = null;
		if (hasMultipleMaterials) {
			triangleIndices = new Array (triangleCount);
			for (let i = 0; i < triangleCount; i++) {
				triangleIndices[i] = i;
			}
			triangleIndices.sort ((a, b) => mesh.GetTriangle (a).mat - mesh.GetTriangle (b).mat);
		}

		let threeGeometry = new THREE.BufferGeometry ();
		let meshMaterialHandler = new ThreeMeshMaterialHandler (threeGeometry, MaterialGeometryType.Face, materialHandler);

		let meshHasVertexColors = (mesh.VertexColorCount () > 0);
		let meshHasUVs = (mesh.TextureUVCount () > 0);
		// Preallocate GPU-ready buffers instead of growing large JavaScript number
		// arrays and then copying them again into Float32Array inside Three.js.
		let vertices = new Float32Array (triangleCount * 9);
		let vertexColors = meshHasVertexColors ? new Float32Array (triangleCount * 9) : null;
		let normals = new Float32Array (triangleCount * 9);
		let uvs = meshHasUVs ? new Float32Array (triangleCount * 6) : null;

		for (let processedTriangleCount = 0; processedTriangleCount < triangleCount; processedTriangleCount++) {
			let triangleIndex = triangleIndices === null ? processedTriangleCount : triangleIndices[processedTriangleCount];
			let triangle = mesh.GetTriangle (triangleIndex);
			let vertexOffset = processedTriangleCount * 9;
			let uvOffset = processedTriangleCount * 6;

			let v0 = mesh.GetVertex (triangle.v0);
			let v1 = mesh.GetVertex (triangle.v1);
			let v2 = mesh.GetVertex (triangle.v2);
			vertices[vertexOffset] = v0.x; vertices[vertexOffset + 1] = v0.y; vertices[vertexOffset + 2] = v0.z;
			vertices[vertexOffset + 3] = v1.x; vertices[vertexOffset + 4] = v1.y; vertices[vertexOffset + 5] = v1.z;
			vertices[vertexOffset + 6] = v2.x; vertices[vertexOffset + 7] = v2.y; vertices[vertexOffset + 8] = v2.z;

			if (vertexColors !== null && triangle.HasVertexColors ()) {
				let vc0 = ConvertColorToThreeColor (mesh.GetVertexColor (triangle.c0));
				let vc1 = ConvertColorToThreeColor (mesh.GetVertexColor (triangle.c1));
				let vc2 = ConvertColorToThreeColor (mesh.GetVertexColor (triangle.c2));
				vertexColors[vertexOffset] = vc0.r; vertexColors[vertexOffset + 1] = vc0.g; vertexColors[vertexOffset + 2] = vc0.b;
				vertexColors[vertexOffset + 3] = vc1.r; vertexColors[vertexOffset + 4] = vc1.g; vertexColors[vertexOffset + 5] = vc1.b;
				vertexColors[vertexOffset + 6] = vc2.r; vertexColors[vertexOffset + 7] = vc2.g; vertexColors[vertexOffset + 8] = vc2.b;
			}

			let n0 = mesh.GetNormal (triangle.n0);
			let n1 = mesh.GetNormal (triangle.n1);
			let n2 = mesh.GetNormal (triangle.n2);
			normals[vertexOffset] = n0.x; normals[vertexOffset + 1] = n0.y; normals[vertexOffset + 2] = n0.z;
			normals[vertexOffset + 3] = n1.x; normals[vertexOffset + 4] = n1.y; normals[vertexOffset + 5] = n1.z;
			normals[vertexOffset + 6] = n2.x; normals[vertexOffset + 7] = n2.y; normals[vertexOffset + 8] = n2.z;

			if (uvs !== null && triangle.HasTextureUVs ()) {
				let u0 = mesh.GetTextureUV (triangle.u0);
				let u1 = mesh.GetTextureUV (triangle.u1);
				let u2 = mesh.GetTextureUV (triangle.u2);
				uvs[uvOffset] = u0.x; uvs[uvOffset + 1] = u0.y; uvs[uvOffset + 2] = u1.x; uvs[uvOffset + 3] = u1.y; uvs[uvOffset + 4] = u2.x; uvs[uvOffset + 5] = u2.y;
			}

			meshMaterialHandler.ProcessItem (processedTriangleCount, triangle.mat);
		}
		meshMaterialHandler.Finalize (triangleCount);

		threeGeometry.setAttribute ('position', new THREE.Float32BufferAttribute (vertices, 3));
		if (vertexColors !== null) {
			threeGeometry.setAttribute ('color', new THREE.Float32BufferAttribute (vertexColors, 3));
		}
		threeGeometry.setAttribute ('normal', new THREE.Float32BufferAttribute (normals, 3));
		if (uvs !== null) {
			threeGeometry.setAttribute ('uv', new THREE.Float32BufferAttribute (uvs, 2));
		}

		let threeMesh = new THREE.Mesh (threeGeometry, meshMaterialHandler.meshThreeMaterials);
		threeMesh.name = mesh.GetName ();
		threeMesh.userData = {
			originalMeshInstance : meshInstance,
			originalMaterials : meshMaterialHandler.meshOriginalMaterials,
			threeMaterials : null
		};

		return threeMesh;
	}

	function CreateThreeLineMesh (meshInstance, materialHandler)
	{
		let mesh = meshInstance.mesh;
		let lineCount = mesh.LineCount ();
		if (lineCount === 0) {
			return null;
		}

		let lineIndices = [];
		for (let i = 0; i < lineCount; i++) {
			lineIndices.push (i);
		}
		lineIndices.sort ((a, b) => {
			let aLine = mesh.GetLine (a);
			let bLine = mesh.GetLine (b);
			return aLine.mat - bLine.mat;
		});

		let threeGeometry = new THREE.BufferGeometry ();
		let meshMaterialHandler = new ThreeMeshMaterialHandler (threeGeometry, MaterialGeometryType.Line, materialHandler);

		let vertices = [];
		let segmentCount = 0;
		for (let i = 0; i < lineIndices.length; i++) {
			let line = mesh.GetLine (lineIndices[i]);
			let lineVertices = line.GetVertices ();
			for (let i = 0; i < lineVertices.length; i++) {
				let vertexIndex = lineVertices[i];
				let vertex = mesh.GetVertex (vertexIndex);
				vertices.push (vertex.x, vertex.y, vertex.z);
				if (i > 0 && i < lineVertices.length - 1) {
					vertices.push (vertex.x, vertex.y, vertex.z);
				}
			}
			meshMaterialHandler.ProcessItem (segmentCount, line.mat);
			segmentCount += line.SegmentCount ();
		}
		meshMaterialHandler.Finalize (segmentCount);

		threeGeometry.setAttribute ('position', new THREE.Float32BufferAttribute (vertices, 3));

		let threeLine = new THREE.LineSegments (threeGeometry, meshMaterialHandler.meshThreeMaterials);
		threeLine.userData = {
			originalMeshInstance : meshInstance,
			originalMaterials : meshMaterialHandler.meshOriginalMaterials,
			threeMaterials : null
		};
		return threeLine;
	}

	const meshTemplates = new Map ();
	function ConvertMesh (threeObject, meshInstance, materialHandler)
	{
		if (IsEmptyMesh (meshInstance.mesh)) {
			return;
		}

        const cached = meshTemplates.get (meshInstance.mesh);
        if (cached) {
            cached.forEach ((template) => { const copy = new template.constructor (template.geometry, Array.isArray (template.material) ? [...template.material] : template.material); copy.position.copy (template.position); copy.quaternion.copy (template.quaternion); copy.scale.copy (template.scale); copy.userData = { ...template.userData, originalMeshInstance : meshInstance, originalMaterials : [...template.userData.originalMaterials], threeMaterials : null }; threeObject.add (copy); });
            return;
        }
        const templates = [];
		let triangleMesh = CreateThreeTriangleMesh (meshInstance, materialHandler);
		if (triangleMesh !== null) {
			threeObject.add (triangleMesh); templates.push (triangleMesh);
		}

		let lineMesh = CreateThreeLineMesh (meshInstance, materialHandler);
		if (lineMesh !== null) {
			threeObject.add (lineMesh); templates.push (lineMesh);
		}
		meshTemplates.set (meshInstance.mesh, templates);
	}

	function ConvertNodeHierarchy (threeRootNode, model, materialHandler, stateHandler)
	{
		let nodeTree = new ThreeNodeTree (model, threeRootNode);
		let threeNodeItems = nodeTree.GetNodeItems ();

		RunTasksBatch (threeNodeItems.length, 100, {
			runTask : (firstMeshInstanceIndex, lastMeshInstanceIndex, onReady) => {
                try {
                    for (let meshInstanceIndex = firstMeshInstanceIndex; meshInstanceIndex <= lastMeshInstanceIndex; meshInstanceIndex++) {
                        let nodeItem = threeNodeItems[meshInstanceIndex]; ConvertMesh (nodeItem.threeNode, nodeItem.meshInstance, materialHandler);
                    }
                    onReady ();
                } catch (error) { stateHandler.OnError (error); }
			},
			onReady : () => {
				stateHandler.OnModelLoaded (threeRootNode);
			}
		});
	}

	let stateHandler = new ThreeConversionStateHandler (callbacks);
	let materialHandler = new ThreeMaterialHandler (model, stateHandler, conversionParams, conversionOutput);
	let threeObject = new THREE.Object3D ();
	ConvertNodeHierarchy (threeObject, model, materialHandler, stateHandler);
}
