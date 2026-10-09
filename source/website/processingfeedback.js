export class ProcessingFeedback
{
    constructor () { this.dialog = null; }
    Sync (busy)
    {
        if (!busy) { this.dialog?.close (); this.dialog?.remove (); this.dialog = null; return; }
        if (this.dialog?.open) { return; }
        const dialog = document.createElement ('dialog'); dialog.className = 'processing_dialog'; dialog.setAttribute ('aria-labelledby', 'processing_title');
        const spinner = document.createElement ('div'); spinner.className = 'processing_spinner'; spinner.setAttribute ('aria-hidden', 'true'); dialog.appendChild (spinner);
        const title = document.createElement ('strong'); title.id = 'processing_title'; title.textContent = 'Processing..'; dialog.appendChild (title);
        this.message = document.createElement ('p'); this.message.setAttribute ('role', 'status'); this.message.textContent = 'Preparing your model…'; dialog.appendChild (this.message);
        dialog.addEventListener ('cancel', event => event.preventDefault ()); document.body.appendChild (dialog); dialog.showModal (); this.dialog = dialog;
    }
    Update (message) { if (this.dialog?.open) { this.message.textContent = message; } }
}
