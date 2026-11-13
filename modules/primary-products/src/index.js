export const PrimaryProductsAPIVersion = 1;
export * from './state.js';
export { PrimaryProductsPanel } from './panel.js';
export { CreatePrimaryProduct, GetArtworkZones } from './geometry.js';
export { ProductDefinition, ValidateProductDefinition } from './definition.js';
export { ProductMaterials, ListProductMaterials } from './materials.js';
export { ValidateProductArtwork, CreateLabelMesh } from './artwork.js';
export { DefaultProductDetails, ValidateProductDetails, ScaleProductChanges } from './details.js';
export { ProductSurfaceMaps, LabelFinishes } from './surfaces.js';

export { ProductCategories, ProductCategoryFilters, ListProductDesigns, ProductDesign } from './catalog.js';

export { ProductProfileEditor } from './profileeditor.js';
export { ProfileChanges } from './profilechanges.js';

export { ContentPresets, ValidateContents, ValidateOptics } from './contents.js';
export { ValidateLabelSource, TextLabelSVG } from './labelsource.js';
