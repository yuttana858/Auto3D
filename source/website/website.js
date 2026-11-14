import { Messenger } from './messenger.js';
import { DimensionTool } from './dimensiontool.js';
import { RenderQueue } from './renderqueue.js';
import { ViewModes } from './viewmodes.js';
import { RenderingPanel } from './renderingpanel.js';
import { CameraPanel } from './camerapanel.js';
import { ModelExtensions, SupportedFormatsText } from './importformats.js';
import { GetFileExtension, TransformFileHostUrls } from '../engine/io/fileutils.js';
import { InputFilesFromFileObjects, InputFilesFromUrls } from '../engine/import/importerfiles.js';
import { ImportErrorCode, ImportSettings } from '../engine/import/importer.js';
import { NavigationMode, ProjectionMode } from '../engine/viewer/camera.js';
import { RGBColor, HexStringToRGBAColor } from '../engine/model/color.js';
import { Viewer } from '../engine/viewer/viewer.js';
import { AddDomElement, ShowDomElement, SetDomElementOuterHeight, CreateDomElement, GetDomElementOuterWidth } from '../engine/viewer/domutils.js';
import { HandleEvent } from './eventhandler.js';
import { HashHandler } from './hashhandler.js';
import { Navigator, Selection, SelectionType } from './navigator.js';
import { CameraSettings, Settings, Theme } from './settings.js';
import { Sidebar } from './sidebar.js';
import { ThemeHandler } from './themehandler.js';
import { ThreeModelLoaderUI } from './threemodelloaderui.js';
import { Toolbar } from './toolbar.js';
import { DownloadModel } from './exportdialog.js';
import { ShowSnapshotDialog } from './snapshotdialog.js';
import { AddSvgIconElement, GetFilesFromDataTransfer, InstallTooltip } from './utils.js';
import { ShowOpenUrlDialog } from './openurldialog.js';
import { GetDefaultMaterials, ReplaceDefaultMaterialsColor } from '../engine/model/modelutils.js';
import { Direction } from '../engine/geometry/geometry.js';
import { CookieGetBoolVal, CookieSetBoolVal } from './cookiehandler.js';
import { MeasureTool } from './measuretool.js';
import { CloseAllDialogs } from './dialog.js';
import { CreateVerticalSplitter } from './splitter.js';
import { EnumeratePlugins, PluginType } from './pluginregistry.js';
import { EnvironmentSettings } from '../engine/viewer/shadingmodel.js';
import { IntersectionMode } from '../engine/viewer/viewermodel.js';
import { Loc } from '../engine/core/localization.js';
import { LightingPanel } from './lightingpanel.js';
import { MaterialPanel } from './materialpanel.js';
import { AxisIndicator } from './axisindicator.js';
import { GetBackgroundPreset, GetBackgroundGradientCSS } from '../engine/viewer/background.js';
import { SessionEditor } from './sessioneditor.js';
import { Preferences } from './preferences.js';
import { ModulePanels } from './modulepanels.js';
import { PrimaryProductsPanel } from './primaryproductspanel.js';
import { MoldedPulpPanel } from './moldedpulppanel.js';
import { PackagingPanel } from './packagingpanel.js';
import { AIWorkspace } from './aiworkspace.js';
import { SceneEffects } from '../engine/viewer/sceneeffects.js';

const MultiModelExtensions = new Set (ModelExtensions);

const WebsiteUIState =
{
    Undefined : 0,
    Intro : 1,
    Model : 2,
    Loading : 3
};

class WebsiteLayouter
{
    constructor (parameters, navigator, sidebar, viewer, measureTool)
    {
        this.parameters = parameters;
        this.navigator = navigator;
        this.sidebar = sidebar;
        this.viewer = viewer;
        this.measureTool = measureTool;
        this.limits = {
            minPanelWidth : 290,
            minCanvasWidth : 100
        };
    }

    Init ()
    {
        this.InstallSplitter (this.parameters.navigatorSplitterDiv, this.parameters.navigatorDiv, (originalWidth, xDiff) => {
            let newWidth = originalWidth + xDiff;
            this.OnSplitterDragged (newWidth - this.navigator.GetWidth (), 0);
        });

        this.InstallSplitter (this.parameters.sidebarSplitterDiv, this.parameters.sidebarDiv, (originalWidth, xDiff) => {
            let newWidth = originalWidth - xDiff;
            this.OnSplitterDragged (0, newWidth - this.sidebar.GetWidth ());
        });

        this.Resize ();
    }

    InstallSplitter (splitterDiv, resizedDiv, onSplit)
    {
        let originalWidth = null;
        CreateVerticalSplitter (splitterDiv, {
            onSplitStart : () => {
                originalWidth = GetDomElementOuterWidth (resizedDiv);
            },
            onSplit : (xDiff) => {
                onSplit (originalWidth, xDiff);
            }
        });
    }

    OnSplitterDragged (leftDiff, rightDiff)
    {
        let windowWidth = window.innerWidth;

        let navigatorWidth = this.navigator.GetWidth ();
        let sidebarWidth = this.sidebar.GetWidth ();

        let leftWidth = GetDomElementOuterWidth (this.parameters.leftContainerDiv);
        let rightWidth = GetDomElementOuterWidth (this.parameters.rightContainerDiv);

        let newLeftWidth = leftWidth + leftDiff;
        let newRightWidth = rightWidth + rightDiff;
        let contentNewWidth = windowWidth - newLeftWidth - newRightWidth;

        let isNavigatorVisible = this.navigator.IsPanelsVisible ();
        let isSidebarVisible = this.sidebar.IsPanelsVisible ();

        if (isNavigatorVisible && newLeftWidth < this.limits.minPanelWidth) {
            newLeftWidth = this.limits.minPanelWidth;
        }

        if (isSidebarVisible && newRightWidth < this.limits.minPanelWidth) {
            newRightWidth = this.limits.minPanelWidth;
        }

        if (contentNewWidth < this.limits.minCanvasWidth) {
            if (leftDiff > 0) {
                newLeftWidth = windowWidth - newRightWidth - this.limits.minCanvasWidth;
            } else if (rightDiff > 0) {
                newRightWidth = windowWidth - newLeftWidth - this.limits.minCanvasWidth;
            }
        }

        if (isNavigatorVisible) {
            let newNavigatorWidth = navigatorWidth + (newLeftWidth - leftWidth);
            this.navigator.SetWidth (newNavigatorWidth);
        }
        if (isSidebarVisible) {
            let newSidebarWidth = sidebarWidth + (newRightWidth - rightWidth);
            this.sidebar.SetWidth (newSidebarWidth);
        }

        this.Resize ();
    }

    Resize ()
    {
        let windowWidth = window.innerWidth;
        let windowHeight = window.innerHeight;
        let headerHeight = this.parameters.headerDiv.offsetHeight;

        let leftWidth = 0;
        let rightWidth = 0;
        let safetyMargin = 0;
        if (this.parameters.mainDiv.style.display !== 'none') {
            leftWidth = GetDomElementOuterWidth (this.parameters.leftContainerDiv);
            rightWidth = GetDomElementOuterWidth (this.parameters.rightContainerDiv);
            safetyMargin = 1;
        }

        let contentWidth = windowWidth - leftWidth - rightWidth;
        const drawer = document.getElementById ('material_drawer');
        const animationDrawer = document.getElementById ('advance_animation_panel');
        const drawerHeight = (drawer && drawer.classList.contains ('open') ? drawer.offsetHeight : 0) + (animationDrawer && !animationDrawer.hidden ? animationDrawer.offsetHeight : 0);
        let contentHeight = Math.max (120, windowHeight - headerHeight - drawerHeight);

        const panelHeaderHeight = document.getElementById ('upload_panel_toggle').offsetHeight;
        this.parameters.mainDiv.style.height = contentHeight + 'px';
        const uploadHeight = document.getElementById ('upload_slot').offsetHeight;
        this.navigator.Resize (Math.max (100, contentHeight - panelHeaderHeight - uploadHeight));
        SetDomElementOuterHeight (this.parameters.navigatorSplitterDiv, contentHeight);

        this.sidebar.Resize (Math.max (100, contentHeight - panelHeaderHeight));
        SetDomElementOuterHeight (this.parameters.sidebarSplitterDiv, contentHeight);

        const viewport = this.primaryProfile?.Layout (Math.max (1, contentWidth - safetyMargin), contentHeight) || { width : Math.max (1, contentWidth - safetyMargin), height : contentHeight };
        this.parameters.viewerDiv.style.width = viewport.width + 'px';
        this.parameters.viewerDiv.style.height = viewport.height + 'px';
        this.viewer.Resize (viewport.width, viewport.height);

        this.measureTool.Resize ();
    }
}

export class Website
{
    constructor (parameters)
    {
        this.parameters = parameters;
        this.settings = new Settings (Theme.Light);
        this.cameraSettings = new CameraSettings ();
        this.viewer = new Viewer ();
        this.measureTool = new MeasureTool (this.viewer, this.settings);
        this.measureTool.sourceUnit = () => this.model?.GetUnit (); this.measureTool.unitSystem = () => this.preferences?.units || 'metric';
        this.hashHandler = new HashHandler ();
        this.toolbar = new Toolbar (this.parameters.toolbarDiv);
        this.navigator = new Navigator (this.parameters.navigatorDiv);
        this.sidebar = new Sidebar (this.parameters.sidebarDiv, this.settings);
        this.modelLoaderUI = new ThreeModelLoaderUI ();
        this.themeHandler = new ThemeHandler ();
        this.highlightColor = new RGBColor (142, 201, 240);
        this.uiState = WebsiteUIState.Undefined;
        this.layouter = new WebsiteLayouter (this.parameters, this.navigator, this.sidebar, this.viewer, this.measureTool);
        this.model = null;
    }

    Load ()
    {
        this.settings.LoadFromCookies ();
        this.cameraSettings.LoadFromCookies ();

        this.SwitchTheme (this.settings.themeId, false);
        HandleEvent ('theme_on_load', this.settings.themeId === Theme.Light ? 'light' : 'dark');

        EnumeratePlugins (PluginType.Header, (plugin) => {
            plugin.registerButtons ({
                createHeaderButton : (icon, title, link) => {
                    this.CreateHeaderButton (icon, title, link);
                }
            });
        });

        this.InitViewer ();
        this.InitToolbar ();
        this.InitDragAndDrop ();
        this.InitSidebar ();
        this.InitNavigator ();
        this.InitWorkspace ();
        this.InitFullscreen ();
        this.messenger = new Messenger (this);

        this.viewer.SetMouseClickHandler (this.OnModelClicked.bind (this));
        this.viewer.SetMouseMoveHandler (this.OnModelMouseMoved.bind (this));
        this.viewer.SetContextMenuHandler (this.OnModelContextMenu.bind (this));

        this.layouter.Init ();
        this.SetUIState (WebsiteUIState.Intro);

        this.hashHandler.SetEventListener (this.OnHashChange.bind (this));


        window.addEventListener ('resize', () => {
			this.layouter.Resize ();
		});
    }

    HasLoadedModel ()
    {
        return this.model !== null;
    }

    InitWorkspace ()
    {
        this.modulePanels = new ModulePanels (this);
        this.sceneEffects = new SceneEffects (this.viewer);
        this.lightingPanel = new LightingPanel (this);
        this.materialPanel = new MaterialPanel (this);
        this.axisIndicator = new AxisIndicator (this.viewer, document.getElementById ('world_axis'));
        this.sessionEditor = new SessionEditor (this); this.dimensions = new DimensionTool (this);
        this.cameraPanel = new CameraPanel (this);
        this.viewModes = new ViewModes (this); this.rendering = new RenderQueue (this); this.renderingPanel = new RenderingPanel (this);
        this.preferences = new Preferences (this);
        this.aiWorkspace = new AIWorkspace (this); this.packagingPanel = new PackagingPanel (this); this.primaryProductsPanel = new PrimaryProductsPanel (this); this.moldedPulpPanel = new MoldedPulpPanel (this);
        for (const [id, setting] of [['horizon_gradient', 'horizonGradient'], ['ground_grid', 'showGroundGrid']]) {
            const checkbox = document.getElementById (id);
            checkbox.addEventListener ('change', () => {
                this.settings[setting] = checkbox.checked;
                if (setting === 'horizonGradient' && checkbox.checked) {
                    this.settings.backgroundIsEnvMap = false;
                    if (this.settings.backgroundPreset === 'custom') { this.settings.backgroundPreset = 'standard'; }
                    this.UpdateEnvironmentMap ();
                }
                this.UpdateViewport ();
                this.sidebar.UpdateControlsStatus ();
                this.settings.SaveToCookies ();
            });
        }
        this.UpdateViewport ();
        const formats = document.getElementById ('supported_formats');
        if (formats) { formats.textContent = SupportedFormatsText; }
        document.getElementById ('workspace_upload').addEventListener ('click', () => this.OpenFileBrowserDialog ());
        this.modulePanels.Render ();
        this.sidebar.detailsPanel.SetCollapsed (false); // Model spec is the default right panel, so its preview and specs start expanded.
        this.sidebar.detailsPanel.contentDiv.textContent = 'Load a model to view geometry, dimensions, materials and properties.';
    }

    SetUIState (uiState)
    {
        function ShowOnlyOnModelElements (show)
        {
            let root = document.querySelector (':root');
            root.style.setProperty ('--ov_only_on_model_display', show ? 'inherit' : 'none');
        }

        if (this.uiState === uiState) {
            return;
        }

        this.uiState = uiState;
        if (this.uiState === WebsiteUIState.Intro) {
            ShowDomElement (this.parameters.introDiv, true);
            ShowDomElement (this.parameters.headerDiv, true);
            ShowDomElement (this.parameters.mainDiv, true);
            ShowOnlyOnModelElements (false);
        } else if (this.uiState === WebsiteUIState.Model) {
            ShowDomElement (this.parameters.introDiv, true);
            ShowDomElement (this.parameters.headerDiv, true);
            ShowDomElement (this.parameters.mainDiv, true);
            ShowOnlyOnModelElements (true);
        } else if (this.uiState === WebsiteUIState.Loading) {
            ShowDomElement (this.parameters.introDiv, true);
            ShowDomElement (this.parameters.headerDiv, true);
            ShowDomElement (this.parameters.mainDiv, true);
            ShowOnlyOnModelElements (false);
        }

        document.getElementById ('viewer_empty').hidden = uiState === WebsiteUIState.Model;
        ShowDomElement (this.parameters.navigatorDiv, uiState === WebsiteUIState.Model);
        this.layouter.Resize ();
    }

    ClearModel ()
    {
        this.viewModes?.Restore ();
        if (this.materialPanel) { this.materialPanel.Clear (); }
        CloseAllDialogs ();

        this.model = null;
        this.viewer.Clear ();

        this.parameters.fileNameDiv.innerHTML = '';

        this.navigator.Clear ();
        this.sidebar.Clear ();
        this.sidebar.detailsPanel.modelFormat = null;
        this.sidebar.detailsPanel.contentDiv.textContent = 'Load a model to view geometry, dimensions, materials and properties.';

        this.measureTool.SetActive (false);
    }

    OnModelLoaded (importResult, threeObject, fit = true)
    {
        this.model = importResult.model;
        this.sidebar.detailsPanel.modelFormat = GetFileExtension (importResult.mainFile).toUpperCase ();
        this.parameters.fileNameDiv.textContent = importResult.mainFile;
        this.viewer.SetMainObject (threeObject);
        this.viewer.SetUpVector (Direction.Y, false);
        this.sceneEffects?.Refresh ();
        this.navigator.FillTree (importResult);
        if (this.materialPanel) { this.materialPanel.Update (); }
        this.sidebar.UpdateControlsVisibility ();
        if (fit) { this.FitModelToWindow (true); }
    }

    OnModelClicked (button, mouseCoordinates, modifiers = {})
    {
        if (this.dimensions?.active) { return; }
        if (this.sessionEditor.busy || this.sessionEditor.controls.axis !== null || this.sessionEditor.controls.dragging) { return; }
        if (button !== 1) {
            return;
        }

        if (this.measureTool.IsActive ()) {
            this.measureTool.Click (mouseCoordinates);
            return;
        }

        const meshUserData = this.viewer.GetMeshUserDataUnderMouse (IntersectionMode.MeshAndLine, mouseCoordinates);
        const additive = Boolean (modifiers.ctrlKey || modifiers.metaKey);
        if (!meshUserData) { if (!additive) { this.sessionEditor.Select (null); } return; }
        const owner = this.sessionEditor.document.Owner (meshUserData.originalMeshInstance);
        if (owner) { this.sessionEditor.Select (owner, false, additive); }
        else { this.navigator.SetSelection (new Selection (SelectionType.Mesh, meshUserData.originalMeshInstance.id)); }
    }

    OnModelMouseMoved (mouseCoordinates)
    {
        if (this.measureTool.IsActive ()) {
            this.measureTool.MouseMove (mouseCoordinates);
        }
    }

    OnModelContextMenu (globalMouseCoordinates, mouseCoordinates)
    {
        const meshUserData = this.viewer.GetMeshUserDataUnderMouse (IntersectionMode.MeshAndLine, mouseCoordinates);
        if (meshUserData) {
            const owner = this.sessionEditor.document.Owner (meshUserData.originalMeshInstance);
            if (owner && !this.sessionEditor.SelectedObjects ().includes (owner)) { this.sessionEditor.Select (owner); }
        }
        if (!this.sessionEditor.readOnly) {
            this.sessionEditor.OpenContextMenu (globalMouseCoordinates, this.sessionEditor.ModelToolMenu ());
            return;
        }
        const items = [];
        if (meshUserData === null) {
            items.push ({
                name : 'Fit to screen',
                icon : 'fit',
                onClick : () => this.sessionEditor.FitScene ()
            });
            if (this.navigator.HasHiddenMesh ()) {
                items.push ({
                    name : Loc ('Show all meshes'),
                    icon : 'visible',
                    onClick : () => this.navigator.ShowAllMeshes (true)
                });
            }
        } else {
            const instance = meshUserData.originalMeshInstance;
            const object = this.sessionEditor.document.Owner (instance);
            if (object) { this.sessionEditor.Select (object); }
            items.push ({
                name : 'Focus selected model',
                icon : 'fit',
                onClick : () => this.sessionEditor.Focus ()
            });
            if (this.navigator.MeshItemCount () > 1) {
                const isMeshIsolated = this.navigator.IsMeshIsolated (instance.id);
                items.push ({
                    name : isMeshIsolated ? Loc ('Remove isolation') : Loc ('Isolate mesh'),
                    icon : isMeshIsolated ? 'deisolate' : 'isolate',
                    onClick : () => {
                        if (isMeshIsolated) { this.navigator.ShowAllMeshes (true); }
                        else { this.navigator.IsolateMesh (instance.id); }
                    }
                });
            }
        }
        this.sessionEditor.OpenContextMenu (globalMouseCoordinates, items);
    }

    OnHashChange ()
    {
        if (this.auth && !this.auth.user) { return; }
        if (this.sessionEditor.readOnly) { return; }
        if (this.hashHandler.HasHash ()) {
            let urls = this.hashHandler.GetModelFilesFromHash ();
            if (urls === null) {
                return;
            }
            TransformFileHostUrls (urls);
            let importSettings = new ImportSettings ();
            importSettings.defaultLineColor = this.settings.defaultLineColor;
            importSettings.defaultColor = this.settings.defaultColor;
            let defaultColor = this.hashHandler.GetDefaultColorFromHash ();
            if (defaultColor !== null) {
                importSettings.defaultColor = defaultColor;
            }
            HandleEvent ('model_load_started', 'hash');
            this.LoadModelFromUrlList (urls, importSettings);
        } else {
            if (this.sessionEditor) { this.sessionEditor.document.objects.forEach ((object) => object.player?.Dispose ()); this.sessionEditor.document = new (this.sessionEditor.document.constructor) (); this.sessionEditor.history = new (this.sessionEditor.history.constructor) (() => this.sessionEditor.MarkDirty ()); this.sessionEditor.selected = null; this.sessionEditor.controls.detach (); this.sessionEditor.RefreshUI (); }
            this.ClearModel ();
            this.SetUIState (WebsiteUIState.Intro);
        }
    }

    OpenFileBrowserDialog ()
    {
        this.parameters.fileInput.click ();
    }

    FitModelToWindow (onLoad)
    {
        return this.viewer.FitAllToWindow (!onLoad);
    }

    FitMeshToWindow (meshInstanceId)
    {
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return meshUserData.originalMeshInstance.id.IsEqual (meshInstanceId);
        });
        this.viewer.FitSphereToWindow (boundingSphere, true);
    }

    FitMeshesToWindow (meshInstanceIdSet)
    {
        let meshInstanceIdKeys = new Set ();
        for (let meshInstanceId of meshInstanceIdSet) {
            meshInstanceIdKeys.add (meshInstanceId.GetKey ());
        }
        let boundingSphere = this.viewer.GetBoundingSphere ((meshUserData) => {
            return meshInstanceIdKeys.has (meshUserData.originalMeshInstance.id.GetKey ());
        });
        this.viewer.FitSphereToWindow (boundingSphere, true);
    }

    UpdateMeshesVisibility ()
    {
        this.viewer.SetMeshesVisibility ((meshUserData) => {
            return this.navigator.IsMeshVisible (meshUserData.originalMeshInstance.id) && this.sessionEditor.IsVisible (meshUserData.originalMeshInstance);
        });
    }

    UpdateMeshesSelection ()
    {
        if (this.sessionEditor) { this.sessionEditor.SelectionChanged (); }
        this.viewer.SetMeshesHighlight (this.highlightColor, () => false);
        if (this.materialPanel) { this.materialPanel.Update (); }
    }

    LoadModelFromUrlList (urls, settings)
    {
        let inputFiles = InputFilesFromUrls (urls);
        const loading = this.LoadModelFromInputFiles (inputFiles, settings);
        this.ClearHashIfNotOnlyUrlList ();
        return loading;
    }

    async LoadModelFromFileList (files)
    {
        if (this.sessionEditor.readOnly || this.sessionEditor.busy || this.modelLoaderUI.GetModelLoader ().InProgress ()) { return; }
        const selected = Array.from (files);
        const session = selected.find ((file) => file.name.toLowerCase ().endsWith ('.auto3d'));
        if (session) { await this.sessionEditor.Run (() => this.sessionEditor.OpenArchiveFile (session)); return; }

        const candidates = selected.filter ((file) => MultiModelExtensions.has (GetFileExtension (file.name).toLowerCase ()));
        if (!this.sessionEditor.replaceTarget && candidates.length > 1) {
            this.sessionEditor.Status ('Uploading models… ' + candidates.length + ' selected');
            let imported = 0;
            for (const candidate of candidates) {
                const importSettings = new ImportSettings ();
                importSettings.defaultLineColor = this.settings.defaultLineColor;
                importSettings.defaultColor = this.settings.defaultColor;
                importSettings.mainFileName = candidate.name;
                if (await this.LoadModelFromInputFiles (InputFilesFromFileObjects (selected), importSettings)) { imported++; }
            }
            this.ClearHashIfNotOnlyUrlList ();
            this.sessionEditor.Status ('Imported ' + imported + ' of ' + candidates.length + ' selected models · ' + this.sessionEditor.document.objects.length + ' session object(s)');
            return;
        }

        let importSettings = new ImportSettings ();
        importSettings.defaultLineColor = this.settings.defaultLineColor;
        importSettings.defaultColor = this.settings.defaultColor;
        let inputFiles = InputFilesFromFileObjects (selected);
        await this.LoadModelFromInputFiles (inputFiles, importSettings);
        this.ClearHashIfNotOnlyUrlList ();
    }

    LoadModelFromInputFiles (files, settings)
    {
        return new Promise ((resolve) => {
        this.modelLoaderUI.LoadModel (files, settings, {
            onStart : () =>
            {
                if (!this.sessionEditor.document.objects.length) { this.SetUIState (WebsiteUIState.Loading); }
                this.sessionEditor.Status ('Uploading models…');
            },
            onFinish : (importResult, threeObject) =>
            {
                this.SetUIState (WebsiteUIState.Model);
                this.sessionEditor.Run (() => this.sessionEditor.Import (importResult, threeObject)).then (() => resolve (true));
                let importedExtension = GetFileExtension (importResult.mainFile);
                HandleEvent ('model_loaded', importedExtension);
            },
            onRender : () =>
            {
                this.viewer.Render ();
            },
            onError : (importError) =>
            {
                this.SetUIState (this.sessionEditor.document.objects.length ? WebsiteUIState.Model : WebsiteUIState.Intro);
                this.sessionEditor.replaceTarget = null;
                this.errorLogs?.Record ('error', 'model import', 'Cannot open file.', String (importError.code ?? 'unknown import error'));
                this.sessionEditor.Status ('Cannot open file. ' + SupportedFormatsText);
                let extensionStr = null;
                if (importError.mainFile !== null) {
                    extensionStr = GetFileExtension (importError.mainFile);
                } else {
                    let extensions = [];
                    let importer = this.modelLoaderUI.GetImporter ();
                    let fileList = importer.GetFileList ().GetFiles ();
                    for (let i = 0; i < fileList.length; i++) {
                        let extension = fileList[i].extension;
                        extensions.push (extension);
                    }
                    extensionStr = extensions.join (',');
                }
                resolve (false);
                if (importError.code === ImportErrorCode.NoImportableFile) {
                    HandleEvent ('no_importable_file', extensionStr);
                } else if (importError.code === ImportErrorCode.FailedToLoadFile) {
                    HandleEvent ('failed_to_load_file', extensionStr);
                } else if (importError.code === ImportErrorCode.ImportFailed) {
                    HandleEvent ('import_failed', extensionStr, {
                        error_message : importError.message
                    });
                }
            }
        });
        });
    }

    ClearHashIfNotOnlyUrlList ()
    {
        let importer = this.modelLoaderUI.GetImporter ();
        let isOnlyUrl = importer.GetFileList ().IsOnlyUrlSource ();
        if (!isOnlyUrl && this.hashHandler.HasHash ()) {
            this.hashHandler.SkipNextEventHandler ();
            this.hashHandler.ClearHash ();
        }
    }

    UpdateEdgeDisplay ()
    {
        this.settings.SaveToCookies ();
        this.viewer.SetEdgeSettings (this.settings.edgeSettings);
    }

    UpdateEnvironmentMap ()
    {
        let envMapPath = 'assets/envmaps/' + this.settings.environmentMapName + '/';
        let envMapTextures = [
            envMapPath + 'posx.jpg',
            envMapPath + 'negx.jpg',
            envMapPath + 'posy.jpg',
            envMapPath + 'negy.jpg',
            envMapPath + 'posz.jpg',
            envMapPath + 'negz.jpg'
        ];
        let environmentSettings = new EnvironmentSettings (envMapTextures, this.settings.backgroundIsEnvMap);
        this.viewer.SetEnvironmentMapSettings (environmentSettings);
    }

    SwitchTheme (newThemeId, resetColors)
    {
        this.settings.themeId = newThemeId;
        this.settings.AlignBackgroundWithTheme ();
        this.themeHandler.SwitchTheme (this.settings.themeId);
        if (resetColors) {
            let defaultSettings = new Settings (this.settings.themeId);
            if (this.settings.backgroundPreset !== 'custom') { this.settings.backgroundColor = defaultSettings.backgroundColor; }
            this.settings.defaultLineColor = defaultSettings.defaultLineColor;
            this.settings.defaultColor = defaultSettings.defaultColor;
            this.UpdateViewport ();
            this.sidebar.UpdateControlsStatus ();
            let modelLoader = this.modelLoaderUI.GetModelLoader ();
            if (modelLoader.GetDefaultMaterials () !== null) {
                ReplaceDefaultMaterialsColor (this.model, this.settings.defaultColor, this.settings.defaultLineColor);
                modelLoader.ReplaceDefaultMaterialsColor (this.settings.defaultColor, this.settings.defaultLineColor);
            }
        }

        this.settings.SaveToCookies ();
    }

    InitViewer ()
    {
        let canvas = AddDomElement (this.parameters.viewerDiv, 'canvas');
        this.viewer.Init (canvas);
        this.viewer.SetEdgeSettings (this.settings.edgeSettings);
        this.viewer.SetBackgroundColor (this.settings.backgroundColor);
        this.viewer.SetNavigationMode (this.cameraSettings.navigationMode);
        this.viewer.SetProjectionMode (this.cameraSettings.projectionMode);
        this.UpdateEnvironmentMap ();
        this.UpdateViewport ();
    }

    UpdateViewport ()
    {
        if (this.viewer.renderer === null) {
            return;
        }
        this.viewer.BeginRenderBatch ();
        try {
            const dark = this.settings.themeId === Theme.Dark;
            const background = GetBackgroundPreset (this.settings.backgroundPreset, dark);
            if (this.settings.backgroundPreset !== 'custom') {
                this.settings.backgroundColor = HexStringToRGBAColor (background.colors[0].slice (1) + 'ff');
            }
            const color = this.settings.backgroundColor;
            const solidBackground = 'rgba(' + [color.r, color.g, color.b, color.a / 255].join (',') + ')';
            this.parameters.viewerDiv.style.setProperty ('--sw_viewer_background', this.settings.horizonGradient ? GetBackgroundGradientCSS (background.colors) : solidBackground);
            this.parameters.viewerDiv.classList.toggle ('dark_viewport', dark);
            this.parameters.viewerDiv.classList.toggle ('horizon_viewport', this.settings.horizonGradient);
            this.viewer.SetBackgroundColor (this.settings.backgroundColor);
            const useDefaultDome = this.settings.horizonGradient && (!this.lightingPanel || this.lightingPanel.mode === 'default');
            this.viewer.SetBackgroundGradient (this.settings.horizonGradient && !useDefaultDome, dark, background.colors);
            this.viewer.SetDefaultDome (useDefaultDome, background.colors);
            const darkGrid = this.settings.backgroundPreset === 'custom' ? (color.r + color.g + color.b) / 3 < 128 : background.dark;
            this.parameters.viewerDiv.style.setProperty ('--sw_axis_text', darkGrid ? '#d5dce3' : '#394650');
            this.viewer.SetGroundGrid (this.settings.showGroundGrid, darkGrid);
            if (this.lightingPanel) { this.lightingPanel.SyncControls (); }
        } finally { this.viewer.EndRenderBatch (); }
    }

    ApplyBackgroundPreset (preset)
    {
        this.settings.backgroundPreset = preset;
        this.settings.horizonGradient = true;
        if (this.settings.backgroundIsEnvMap) {
            this.settings.backgroundIsEnvMap = false;
            this.UpdateEnvironmentMap ();
        }
        this.UpdateViewport ();
        this.sidebar.UpdateControlsStatus ();
        this.settings.SaveToCookies ();
    }

    InitFullscreen ()
    {
        const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        if (!request) { return; }
        const button = document.createElement ('button');
        button.className = 'header_library_button header_fullscreen_button';
        button.setAttribute ('aria-label', 'Enter full screen');
        button.title = 'Full screen';
        button.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg><span>Full screen</span>';
        const update = () => {
            const active = Boolean (document.fullscreenElement || document.webkitFullscreenElement);
            button.setAttribute ('aria-label', active ? 'Exit full screen' : 'Enter full screen');
            button.title = active ? 'Exit full screen' : 'Full screen';
            button.querySelector ('span').textContent = active ? 'Exit full screen' : 'Full screen';
            this.layouter.Resize ();
        };
        button.addEventListener ('click', () => this.ToggleFullscreen ());
        document.addEventListener ('fullscreenchange', update);
        document.addEventListener ('webkitfullscreenchange', update);
        this.parameters.headerButtonsDiv.appendChild (button);
        update ();
    }

    IsFullscreen ()
    {
        return Boolean (document.fullscreenElement || document.webkitFullscreenElement);
    }

    async SetFullscreen (enabled)
    {
        if (enabled === this.IsFullscreen ()) { return this.IsFullscreen (); }
        try {
            if (enabled) {
                const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
                if (!request) { throw new Error ('Full screen is not supported by this browser.'); }
                await request.call (document.documentElement);
            } else {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) { await exit.call (document); }
            }
        } catch (error) {
            if (error?.message) { throw error; }
            throw new Error ('Full screen request was declined by the browser.');
        }
        return this.IsFullscreen ();
    }

    async ToggleFullscreen ()
    {
        return this.SetFullscreen (!this.IsFullscreen ());
    }

    InitToolbar ()
    {
        function AddButton (toolbar, imageName, imageTitle, classNames, onClick)
        {
            let button = toolbar.AddImageButton (imageName, imageTitle, () => {
                onClick ();
            });
            for (let className of classNames) {
                button.AddClass (className);
            }
            return button;
        }

        function AddPushButton (toolbar, imageName, imageTitle, classNames, onClick)
        {
            let button = toolbar.AddImagePushButton (imageName, imageTitle, false, (isSelected) => {
                onClick (isSelected);
            });
            for (let className of classNames) {
                button.AddClass (className);
            }
            return button;
        }

        function AddRadioButton (toolbar, imageNames, imageTitles, selectedIndex, classNames, onClick)
        {
            let imageData = [];
            for (let i = 0; i < imageNames.length; i++) {
                let imageName = imageNames[i];
                let imageTitle = imageTitles[i];
                imageData.push ({
                    image : imageName,
                    title : imageTitle
                });
            }
            let buttons = toolbar.AddImageRadioButton (imageData, selectedIndex, (buttonIndex) => {
                onClick (buttonIndex);
            });
            for (let className of classNames) {
                for (let button of buttons) {
                    button.AddClass (className);
                }
            }
        }

        function AddSeparator (toolbar, classNames)
        {
            let separator = toolbar.AddSeparator ();
            if (classNames !== null) {
                for (let className of classNames) {
                    separator.classList.add (className);
                }
            }
        }

        let importer = this.modelLoaderUI.GetImporter ();
        let navigationModeIndex = (this.cameraSettings.navigationMode === NavigationMode.FixedUpVector ? 0 : 1);
        let projectionModeIndex = (this.cameraSettings.projectionMode === ProjectionMode.Perspective ? 0 : 1);

        AddButton (this.toolbar, 'open', Loc ('Open from your device'), [], () => {
            this.OpenFileBrowserDialog ();
        });
        AddButton (this.toolbar, 'file_download', 'Save session file', ['only_on_model'], () => {
            this.sessionEditor.library.SaveDialog (true);
        });
        AddButton (this.toolbar, 'open_url', Loc ('Open from url'), [], () => {
            ShowOpenUrlDialog ((urls) => {
                if (urls.length > 0) {
                    this.hashHandler.SetModelFilesToHash (urls);
                }
            });
        });
        AddSeparator (this.toolbar, ['only_on_model']);
        AddButton (this.toolbar, 'fit', Loc ('Fit model to window'), ['only_on_model'], () => {
            this.FitModelToWindow (false);
        });
        AddButton (this.toolbar, 'up_y', Loc ('Set Y axis as up vector'), ['only_on_model'], () => {
            this.viewer.SetUpVector (Direction.Y, true);
        });
        AddButton (this.toolbar, 'up_z', Loc ('Set Z axis as up vector'), ['only_on_model'], () => {
            this.viewer.SetUpVector (Direction.Z, true);
        });
        AddButton (this.toolbar, 'flip', Loc ('Flip up vector'), ['only_on_model'], () => {
            this.viewer.FlipUpVector ();
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        AddRadioButton (this.toolbar, ['fix_up_on', 'fix_up_off'], [Loc ('Fixed up vector'), Loc ('Free orbit')], navigationModeIndex, ['only_full_width', 'only_on_model'], (buttonIndex) => {
            if (buttonIndex === 0) {
                this.cameraSettings.navigationMode = NavigationMode.FixedUpVector;
            } else if (buttonIndex === 1) {
                this.cameraSettings.navigationMode = NavigationMode.FreeOrbit;
            }
            this.cameraSettings.SaveToCookies ();
            this.viewer.SetNavigationMode (this.cameraSettings.navigationMode);
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        AddRadioButton (this.toolbar, ['camera_perspective', 'camera_orthographic'], [Loc ('Perspective camera'), Loc ('Orthographic camera')], projectionModeIndex, ['only_full_width', 'only_on_model'], (buttonIndex) => {
            if (buttonIndex === 0) {
                this.cameraSettings.projectionMode = ProjectionMode.Perspective;
            } else if (buttonIndex === 1) {
                this.cameraSettings.projectionMode = ProjectionMode.Orthographic;
            }
            this.cameraSettings.SaveToCookies ();
            this.viewer.SetProjectionMode (this.cameraSettings.projectionMode);
            this.sidebar.UpdateControlsVisibility ();
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        let measureToolButton = AddPushButton (this.toolbar, 'measure', Loc ('Measure'), ['only_full_width', 'only_on_model'], (isSelected) => {
            HandleEvent ('measure_tool_activated', isSelected ? 'on' : 'off');
            this.navigator.SetSelection (null);
            if (isSelected) { this.dimensions?.SetActive (false); }
            this.measureTool.SetActive (isSelected);
        });
        this.measureTool.SetButton (measureToolButton);
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        AddButton (this.toolbar, 'download', Loc ('Download'), ['only_full_width', 'only_on_model'], () => {
            HandleEvent ('model_downloaded', '');
            let importer = this.modelLoaderUI.GetImporter ();
            DownloadModel (importer);
        });
        AddButton (this.toolbar, 'export', Loc ('Export'), ['only_full_width', 'only_on_model'], () => {
            this.sessionEditor.Export ();
        });
        AddButton (this.toolbar, 'share', Loc ('Share'), ['only_full_width', 'only_on_model'], () => {
            this.sessionEditor.library.Open ();
        });
        AddSeparator (this.toolbar, ['only_full_width', 'only_on_model']);
        AddButton (this.toolbar, 'snapshot', Loc ('Create snapshot'), ['only_full_width', 'only_on_model'], () => {
            ShowSnapshotDialog (this.viewer);
        });

        EnumeratePlugins (PluginType.Toolbar, (plugin) => {
            plugin.registerButtons ({
                createSeparator : (classNames) => {
                    AddSeparator (this.toolbar, classNames);
                },
                createButton : (icon, title, classNames, onClick) => {
                    AddButton (this.toolbar, icon, title, classNames, onClick);
                },
                getModel : () => {
                    return this.model;
                }
            });
        });

        this.parameters.fileInput.addEventListener ('change', (ev) => {
            if (ev.target.files.length > 0) {
                HandleEvent ('model_load_started', 'open_file');
                this.LoadModelFromFileList (ev.target.files);
                ev.target.value = '';
            }
        });
    }

    InitDragAndDrop ()
    {
        let viewerDragDepth = 0;
        const viewer = this.parameters.viewerDiv;
        window.addEventListener ('dragstart', (ev) => {
            ev.preventDefault ();
        }, false);

        viewer.addEventListener ('dragenter', (ev) => {
            if (this.sessionEditor?.readOnly) { return; }
            ev.preventDefault (); viewerDragDepth++; viewer.classList.add ('session_drop_target');
        });
        viewer.addEventListener ('dragleave', () => {
            viewerDragDepth = Math.max (0, viewerDragDepth - 1);
            if (viewerDragDepth === 0) { viewer.classList.remove ('session_drop_target'); }
        });

        window.addEventListener ('dragover', (ev) => {
            ev.stopPropagation ();
            ev.preventDefault ();
            ev.dataTransfer.dropEffect = this.sessionEditor?.readOnly ? 'none' : 'copy';
        }, false);

        window.addEventListener ('drop', (ev) => {
            ev.stopPropagation ();
            ev.preventDefault ();
            viewerDragDepth = 0; viewer.classList.remove ('session_drop_target');
            if (this.sessionEditor?.readOnly) { return; }
            GetFilesFromDataTransfer (ev.dataTransfer, (files) => {
                if (files.length > 0) {
                    HandleEvent ('model_load_started', 'drop');
                    const intoViewer = viewer.contains (ev.target);
                    if (intoViewer && this.sessionEditor?.document.objects.length) {
                        this.sessionEditor.Status ('Adding dropped model(s) to current session…');
                    }
                    this.LoadModelFromFileList (files);
                }
            });
        }, false);
    }

    InitSidebar ()
    {
        this.sidebar.Init ({
            getShadingType : () => {
                return this.viewer.GetShadingType ();
            },
            getProjectionMode : () => {
                return this.viewer.GetProjectionMode ();
            },
            getDefaultMaterials : () => {
                return GetDefaultMaterials (this.model);
            },
            onEnvironmentMapChanged : () => {
                if (this.settings.backgroundIsEnvMap) {
                    this.settings.horizonGradient = false;
                }
                this.settings.SaveToCookies ();
                this.UpdateEnvironmentMap ();
                this.UpdateViewport ();
                if (this.measureTool.IsActive ()) {
                    this.measureTool.UpdatePanel ();
                }
            },
            onBackgroundColorChanged : () => {
                this.settings.backgroundPreset = 'custom';
                this.settings.horizonGradient = false;
                this.UpdateViewport ();
                this.settings.SaveToCookies ();
                if (this.measureTool.IsActive ()) {
                    this.measureTool.UpdatePanel ();
                }
            },
            onDefaultColorChanged : () => {
                this.settings.SaveToCookies ();
                let modelLoader = this.modelLoaderUI.GetModelLoader ();
                if (modelLoader.GetDefaultMaterials () !== null) {
                    ReplaceDefaultMaterialsColor (this.model, this.settings.defaultColor, this.settings.defaultLineColor);
                    modelLoader.ReplaceDefaultMaterialsColor (this.settings.defaultColor, this.settings.defaultLineColor);
                }
                this.viewer.Render ();
            },
            onEdgeDisplayChanged : () => {
                HandleEvent ('edge_display_changed', this.settings.showEdges ? 'on' : 'off');
                this.UpdateEdgeDisplay ();
            },
            onResizeRequested : () => {
                this.layouter.Resize ();
            },
            onShowHidePanels : (show) => {
                ShowDomElement (this.parameters.sidebarSplitterDiv, show);
                CookieSetBoolVal ('ov_show_sidebar', show);
            }
        });
    }

    InitNavigator ()
    {
        function GetMeshUserDataArray (viewer, meshInstanceId)
        {
            let userDataArr = [];
            viewer.EnumerateMeshesAndLinesUserData ((meshUserData) => {
                if (meshUserData.originalMeshInstance.id.IsEqual (meshInstanceId)) {
                    userDataArr.push (meshUserData);
                }
            });
            return userDataArr;
        }

        function GetMeshesForMaterial (viewer, materialIndex)
        {
            let usedByMeshes = [];
            viewer.EnumerateMeshesAndLinesUserData ((meshUserData) => {
                if (materialIndex === null || meshUserData.originalMaterials.indexOf (materialIndex) !== -1) {
                    usedByMeshes.push (meshUserData.originalMeshInstance);
                }
            });
            return usedByMeshes;
        }

        function GetMaterialReferenceInfo (model, materialIndex)
        {
            const material = model.GetMaterial (materialIndex);
            return {
                index : materialIndex,
                name : material.name,
                color : material.color.Clone ()
            };
        }

        function GetMaterialsForMesh (viewer, model, meshInstanceId)
        {
            let usedMaterials = [];
            if (meshInstanceId === null) {
                for (let materialIndex = 0; materialIndex < model.MaterialCount (); materialIndex++) {
                    usedMaterials.push (GetMaterialReferenceInfo (model, materialIndex));
                }
            } else {
                let userDataArr = GetMeshUserDataArray (viewer, meshInstanceId);
                let addedMaterialIndices = new Set ();
                for (let userData of userDataArr) {
                    for (let materialIndex of userData.originalMaterials) {
                        if (addedMaterialIndices.has (materialIndex)) {
                            continue;
                        }
                        usedMaterials.push (GetMaterialReferenceInfo (model, materialIndex));
                        addedMaterialIndices.add (materialIndex);
                    }
                }
            }
            usedMaterials.sort ((a, b) => {
                return a.index - b.index;
            });
            return usedMaterials;
        }

        this.navigator.Init ({
            openFileBrowserDialog : () => {
                this.OpenFileBrowserDialog ();
            },
            fitMeshToWindow : (meshInstanceId) => {
                this.FitMeshToWindow (meshInstanceId);
            },
            fitMeshesToWindow : (meshInstanceIdSet) => {
                this.FitMeshesToWindow (meshInstanceIdSet);
            },
            getMeshesForMaterial : (materialIndex) => {
                return GetMeshesForMaterial (this.viewer, materialIndex);
            },
            getMaterialsForMesh : (meshInstanceId) => {
                return GetMaterialsForMesh (this.viewer, this.model, meshInstanceId);
            },
            onMeshVisibilityChanged : () => {
                this.sessionEditor.CaptureVisibility ();
                this.UpdateMeshesVisibility ();
            },
            onMeshSelectionChanged : () => {
                this.UpdateMeshesSelection ();
            },
            onSelectionCleared : () => {
                this.sidebar.AddObject3DProperties (this.model, this.model);
            },
            onMeshSelected : (meshInstanceId) => {
                const meshInstance = this.model?.GetMeshInstance (meshInstanceId);
                if (!meshInstance) { return; }
                this.sidebar.AddObject3DProperties (this.model, meshInstance);
            },
            onMaterialSelected : (materialIndex) => {
                this.sidebar.AddMaterialProperties (this.model.GetMaterial (materialIndex));
                this.materialPanel?.FlashMaterialIndex (materialIndex);
            },
            onResizeRequested : () => {
                this.layouter.Resize ();
            },
            onShowHidePanels : (show) => {
                ShowDomElement (this.parameters.navigatorSplitterDiv, show);
                CookieSetBoolVal ('ov_show_navigator', show);
            }
        });
    }

    UpdatePanelsVisibility ()
    {
        let showNavigator = CookieGetBoolVal ('ov_show_navigator', true);
        let showSidebar = CookieGetBoolVal ('ov_show_sidebar', false);
        this.navigator.ShowPanels (showNavigator);
        this.sidebar.ShowPanels (showSidebar);
    }

    CreateHeaderButton (icon, title, link)
    {
        let buttonLink = CreateDomElement ('a');
        buttonLink.setAttribute ('href', link);
        buttonLink.setAttribute ('target', '_blank');
        buttonLink.setAttribute ('rel', 'noopener noreferrer');
        InstallTooltip (buttonLink, title);
        AddSvgIconElement (buttonLink, icon, 'header_button');
        this.parameters.headerButtonsDiv.appendChild (buttonLink);
        return buttonLink;
    }
}
