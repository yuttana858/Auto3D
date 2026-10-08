export const ModelExtensions = ['3dm', '3ds', '3mf', 'amf', 'bim', 'brep', 'dae', 'fbx', 'fcstd', 'gltf', 'glb', 'ifc', 'iges', 'igs', 'step', 'stp', 'stl', 'obj', 'off', 'ply', 'wrl', 'zae'];
export const SupportedFormatsText = 'Supported formats: ' + [...ModelExtensions, 'zip', 'auto3d'].map ((extension) => extension.toUpperCase ()).join (', ') + '.';
