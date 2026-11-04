import { ErrorLogs } from './errorlogs.js';
import { InstallAuthGate } from './authgate.js';
import { AccountAdmin } from './accountadmin.js';
import { Loc } from '../engine/core/localization.js';
import { AddDiv, AddDomElement } from '../engine/viewer/domutils.js';
import { Embed } from './embed.js';
import { Website } from './website.js';
import { SetEventHandler, HandleEvent } from './eventhandler.js';
import { PluginType, RegisterPlugin } from './pluginregistry.js';
import { ButtonDialog, ProgressDialog } from './dialog.js';
import { ShowMessageDialog } from './dialogs.js';
import { CreateAgentCommands } from './agentcommands.js';
import { AuthService } from './authservice.js';
import { AuthPanel, CaptureRecovery } from './authpanel.js';

import * as Engine from '../engine/main.js';
export { Engine };

import './css/icons.css';
import { InstallPopupTypography } from './popuptypography.js';
import './css/themes.css';
import './css/core.css';
import './css/controls.css';
import './css/dialogs.css';
import './css/treeview.css';
import './css/panelset.css';
import './css/navigator.css';
import './css/sidebar.css';
import './css/website.css';
import './css/embed.css';
import './css/workspace.css';
import './css/session.css';
import './css/aiworkspace.css';
import './css/packaging.css';
import './css/welcome.css';
import './css/commands.css';
import './css/auth.css';
import './css/modulepanels.css';

export const UI = {
    ButtonDialog,
    ProgressDialog,
    ShowMessageDialog,
    HandleEvent,
    Loc
};

export function SetWebsiteEventHandler (eventHandler)
{
    SetEventHandler (eventHandler);
}

export function RegisterHeaderPlugin (plugin)
{
    RegisterPlugin (PluginType.Header, plugin);
}

export function RegisterToolbarPlugin (plugin)
{
    RegisterPlugin (PluginType.Toolbar, plugin);
}

export function StartWebsite ()
{
    let storage = null; try { storage = window.sessionStorage; } catch { /* Logging works in memory. */ }
    const errorLogs = new ErrorLogs (window, storage).Install ();
    window.addEventListener ('load', () => {
        if (window.self !== window.top) {
            let noEmbeddingDiv = AddDiv (document.body, 'noembed');
            AddDiv (noEmbeddingDiv, null, Loc ('Embedding Auto3D in an iframe is not supported.'));
            let link = AddDomElement (noEmbeddingDiv, 'a', null, Loc ('Open Auto3D'));
            link.target = '_blank';
            link.href = window.self.location;
            return;
        }

        document.getElementById ('intro_dragdrop_text').innerHTML = Loc ('Drop model files here');
        document.getElementById ('upload_slot').appendChild (document.getElementById ('intro'));

        InstallPopupTypography ();
        const recovery = CaptureRecovery ();
        const address = new URL (window.location.href); if (address.searchParams.has ('admin')) { address.searchParams.delete ('admin'); window.history.replaceState (null, '', address); }
        let website = new Website ({
            headerDiv : document.getElementById ('header'),
            headerButtonsDiv : document.getElementById ('header_buttons'),
            toolbarDiv : document.getElementById ('toolbar'),
            mainDiv : document.getElementById ('main'),
            introDiv : document.getElementById ('intro'),
            fileNameDiv : document.getElementById ('main_file_name'),
            leftContainerDiv : document.getElementById ('main_left_container'),
            navigatorDiv : document.getElementById ('main_navigator'),
            navigatorSplitterDiv : document.getElementById ('main_navigator_splitter'),
            rightContainerDiv : document.getElementById ('main_right_container'),
            sidebarDiv : document.getElementById ('main_sidebar'),
            sidebarSplitterDiv : document.getElementById ('main_sidebar_splitter'),
            viewerDiv : document.getElementById ('main_viewer'),
            fileInput : document.getElementById ('open_file')
        });
        website.errorLogs = errorLogs;
        website.auth = new AuthService ();
        website.auth.Subscribe (user => { if (!user) { website.rendering.Lock (); } });
        website.auth.Subscribe ((user) => errorLogs.BindAccount (user?.id || null));
        website.Load ();
        website.sceneEffects.onDiagnostics = (diagnosis) => errorLogs.RecordShadow (diagnosis, 'Shadow controls updated');
        website.accountAdmin = new AccountAdmin (website.auth);
        website.authPanel = new AuthPanel (website.auth, website.accountAdmin); website.authPanel.recovery = recovery;
        const refreshAccount = () => { if (document.visibilityState === 'visible') { website.auth.Restore ().catch (() => {}); } };
        document.addEventListener ('visibilitychange', refreshAccount);
        window.setInterval (refreshAccount, 240000);
        website.commands = CreateAgentCommands (website);
        window.Auto3D = Object.freeze ({ apiVersion : 1, catalog : (query) => website.commands.Catalog (query), execute : (id, args) => website.commands.Execute (id, args), runMacro : (macro) => website.commands.RunMacro (macro), cancelMacro : () => website.commands.Cancel () });
        InstallAuthGate (website);
    });
}

export function StartEmbed ()
{
    window.addEventListener ('load', () => {
        let embed = new Embed ({
            viewerDiv : document.getElementById ('embed_viewer'),
            websiteLinkDiv : document.getElementById ('website_link')
        });
        const auth = new AuthService ();
        const lockEmbed = () => { document.getElementById ('embed_viewer').inert = true; document.getElementById ('embed_viewer').hidden = true; window.location.replace ('/'); };
        auth.Subscribe ((user) => { if (!user) { lockEmbed (); } });
        auth.Restore ().then ((user) => { if (user) { embed.Load (); } }).catch (lockEmbed);
        document.addEventListener ('visibilitychange', () => { if (document.visibilityState === 'visible') { auth.Restore ().catch (lockEmbed); } });
        window.setInterval (() => auth.Restore ().catch (lockEmbed), 240000);
    });
}

import './css/primaryproducts.css';
