/**
 * Support Messages View - SuperAdmin
 */
const SupportView = (() => {
    let currentPage = 1;
    let messages = [];

    async function render() {
        const el = document.getElementById('page-content');
        el.innerHTML = `
            <div class="toolbar">
                <div class="toolbar-left">
                    <span class="text-muted" id="support-unread"></span>
                </div>
            </div>
            <div class="card">
                <div class="card-body" id="support-list">${Utils.loading()}</div>
            </div>
        `;
        await loadMessages();
    }

    async function loadMessages() {
        const container = document.getElementById('support-list');
        try {
            const data = await API.get(`/api/superadmin/support/messages?page=${currentPage}&per_page=20`);
            messages = data.messages || [];
            const pagination = data.pagination;

            // Unread count
            try {
                const uc = await API.get('/api/superadmin/support/unread-count');
                const el = document.getElementById('support-unread');
                if (el) el.textContent = uc.unread > 0 ? `${uc.unread} message(s) non lu(s)` : 'Tous les messages sont lus';
            } catch(e) {}

            if (!messages.length) {
                container.innerHTML = Utils.emptyState('💬', 'Aucun message', 'Aucun message de support reçu.');
                return;
            }

            container.innerHTML = `
                <div class="table-wrapper">
                    <table>
                        <thead><tr>
                            <th>Tenant</th><th>Sujet</th><th>De</th><th>Date</th><th>Réponses</th><th>Actions</th>
                        </tr></thead>
                        <tbody>${messages.map(m => {
                            const replies = m.replies || [];
                            const hasUnread = !m.is_read && m.direction === 'tenant_to_admin';
                            return `<tr style="${hasUnread ? 'font-weight:600;background:rgba(26,86,219,0.05)' : ''}">
                                <td><strong>${Utils.escapeHtml(m.tenant_name || '')}</strong><div class="text-muted text-sm">${Utils.escapeHtml(m.tenant_slug || '')}</div></td>
                                <td>${hasUnread ? '🔵 ' : ''}${Utils.escapeHtml(m.subject)}</td>
                                <td>${Utils.escapeHtml(m.sender_name || m.sender_email || '—')}</td>
                                <td>${Utils.formatDate(m.created_at)}</td>
                                <td>${replies.length}</td>
                                <td><button class="btn btn-sm btn-primary" onclick="SupportView.viewThread('${m.id}')">Voir</button></td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table>
                </div>
                ${pagination ? Utils.paginationHtml(pagination, 'SupportView.goToPage') : ''}
            `;
        } catch (err) {
            container.innerHTML = `<div class="alert alert-error">${Utils.escapeHtml(err.message)}</div>`;
        }
    }

    function goToPage(page) { currentPage = page; loadMessages(); }

    async function viewThread(id) {
        try {
            const m = await API.get(`/api/superadmin/support/messages/${id}`);
            const replies = m.replies || [];

            let html = `
                <div style="margin-bottom:16px">
                    <div><strong>Tenant:</strong> ${Utils.escapeHtml(m.tenant_name || '')} (${Utils.escapeHtml(m.tenant_slug || '')})</div>
                    <div><strong>De:</strong> ${Utils.escapeHtml(m.sender_name || '')} &lt;${Utils.escapeHtml(m.sender_email || '')}&gt;</div>
                    <div><strong>Date:</strong> ${Utils.formatDate(m.created_at)}</div>
                </div>
                <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;margin-bottom:12px">
                    <strong>${Utils.escapeHtml(m.subject)}</strong>
                    <p style="margin:8px 0 0;white-space:pre-wrap">${Utils.escapeHtml(m.body)}</p>
                </div>
            `;

            if (replies.length) {
                html += '<h4 style="margin:16px 0 8px">Conversation</h4>';
                replies.forEach(r => {
                    const isAdmin = r.direction === 'admin_to_tenant';
                    html += `<div style="padding:10px 14px;border-radius:10px;margin-bottom:8px;max-width:85%;${isAdmin ? 'margin-left:auto;background:var(--primary-color,#1a56db);color:#fff' : 'background:var(--bg-secondary)'}">
                        <div style="white-space:pre-wrap">${Utils.escapeHtml(r.body)}</div>
                        <div style="font-size:11px;opacity:0.7;margin-top:4px">${Utils.escapeHtml(r.sender_name || 'Support')} — ${Utils.formatDate(r.created_at)}</div>
                    </div>`;
                });
            }

            html += `
                <div style="margin-top:16px">
                    <label style="font-weight:600;display:block;margin-bottom:6px">Répondre</label>
                    <textarea id="reply-body" rows="4" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);resize:vertical" placeholder="Votre réponse..."></textarea>
                </div>
            `;

            Utils.showModal(`Message: ${Utils.escapeHtml(m.subject)}`, html, `
                <button class="btn btn-ghost" onclick="Utils.closeModal()">Fermer</button>
                <button class="btn btn-primary" onclick="SupportView.sendReply('${id}')">Envoyer la réponse</button>
            `);
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function sendReply(messageId) {
        const body = document.getElementById('reply-body')?.value.trim();
        if (!body) { Utils.showToast('Message requis', 'error'); return; }

        try {
            await API.post(`/api/superadmin/support/messages/${messageId}/reply`, { body });
            Utils.closeModal();
            Utils.showToast('Réponse envoyée', 'success');
            loadMessages();
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    return { render, goToPage, viewThread, sendReply };
})();
