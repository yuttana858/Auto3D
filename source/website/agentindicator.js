// Agent names are provided by OAuth clients and are not brand verification.
export function BindAgentDialog (dialog, connection)
{
    if (!connection) { return; }
    const status = document.createElement ('p'); status.className = 'agent_dialog_status'; status.setAttribute ('role', 'status'); dialog.appendChild (status);
    const update = state => {
        const agents = state.status === 'connected' ? state.agents : []; const active = agents.length > 0;
        dialog.classList.toggle ('agent_connected', active); status.hidden = !active;
        status.textContent = active ? 'Connected: ' + agents.map (agent => agent.name + (agent.domain ? '' : ' (client-reported)')).join (', ') : '';
        status.title = agents.map (agent => agent.name + (agent.domain ? ' · ' + agent.domain : ' · client-reported name')).join ('; ');
    };
    const unsubscribe = connection.Subscribe (update); dialog.addEventListener ('close', unsubscribe, { once : true }); update (connection.Inspect ());
}
