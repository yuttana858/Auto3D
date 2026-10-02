import * as assert from 'assert';
import * as THREE from 'three';
import { Viewer } from '../../source/engine/viewer/viewer.js';
import { ViewerMainModel } from '../../source/engine/viewer/viewermodel.js';
import { ShadingModel } from '../../source/engine/viewer/shadingmodel.js';
import { Direction } from '../../source/engine/geometry/geometry.js';
import { ProjectionMode } from '../../source/engine/viewer/camera.js';

export default function suite ()
{
    describe ('Viewport references', () => {
        function CreateViewer ()
        {
            const viewer = new Viewer ();
            viewer.scene = new THREE.Scene ();
            viewer.mainModel = new ViewerMainModel (viewer.scene);
            const mesh = new THREE.Mesh (new THREE.BoxGeometry (4, 6, 8), [new THREE.MeshPhongMaterial ()]);
            mesh.position.set (12, 20, -7);
            const model = new THREE.Group ();
            model.add (mesh);
            viewer.mainModel.SetMainObject (model);
            viewer.upVector = { direction : Direction.Y, isFlipped : false };
            viewer.groundGridSettings = { show : true, dark : true };
            return viewer;
        }

        it ('Places the grid below translated models without changing model bounds', () => {
            const viewer = CreateViewer ();
            const bounds = viewer.GetBoundingBox (() => true);
            viewer.UpdateGroundGrid ();
            assert.ok (viewer.groundGrid.position.y < bounds.min.y);
            assert.equal (viewer.groundGrid.position.x, 12);
            assert.equal (viewer.groundGrid.position.z, -7);
            assert.ok (viewer.GetBoundingBox (() => true).equals (bounds));
            assert.equal (viewer.mainModel.mainModel.GetRootObject ().children.length, 1);
        });

        it ('Tracks up-axis changes and disposes replaced or disabled grids', () => {
            const viewer = CreateViewer ();
            viewer.UpdateGroundGrid ();
            const firstGrid = viewer.groundGrid;
            let disposed = false;
            firstGrid.geometry.addEventListener ('dispose', () => { disposed = true; });
            viewer.upVector.direction = Direction.Z;
            viewer.UpdateGroundGrid ();
            const bounds = viewer.GetBoundingBox (() => true);
            assert.ok (disposed);
            assert.ok (!viewer.scene.children.includes (firstGrid));
            assert.ok (viewer.groundGrid.position.z < bounds.min.z);
            viewer.upVector.isFlipped = true;
            viewer.UpdateGroundGrid ();
            assert.ok (viewer.groundGrid.position.z > bounds.max.z);
            viewer.groundGridSettings.show = false;
            viewer.UpdateGroundGrid ();
            assert.equal (viewer.groundGrid, null);
        });

        it ('Restores the horizon background when leaving an environment or changing projection', () => {
            const scene = new THREE.Scene ();
            const shading = new ShadingModel (scene);
            const gradient = new THREE.Texture ();
            const environment = new THREE.CubeTexture ();
            shading.backgroundTexture = gradient;
            shading.environment = environment;
            shading.UpdateShading ();
            assert.equal (scene.background, gradient);
            shading.environmentSettings.backgroundIsEnvMap = true;
            shading.UpdateShading ();
            assert.equal (scene.background, environment);
            shading.SetProjectionMode (ProjectionMode.Orthographic);
            assert.equal (scene.background, gradient);
            shading.SetProjectionMode (ProjectionMode.Perspective);
            shading.environmentSettings.backgroundIsEnvMap = false;
            shading.UpdateShading ();
            assert.equal (scene.background, gradient);
        });
    });
}
