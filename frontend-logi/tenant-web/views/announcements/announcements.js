/**
 * Vue Announcements - Annonces aux clients
 * CRUD complet via l'API
 */

Views.announcements = {
    announcements: [],
    
    async render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="announcements-page">
                <div class="page-header">
                    <h1 class="page-title">Annonces</h1>
                    <button class="btn btn-primary" id="btn-new">
                        ${Icons.get('plus', {size:16})} Nouvelle annonce
                    </button>
                </div>
                
                <div id="announcements-list">${Loader.page('Chargement...')}</div>
            </div>
        `;
        
        document.getElementById('btn-new')?.addEventListener('click', () => this.showForm());
        
        await this.loadData();
    },
    
    async loadData() {
        try {
            const data = await API.announcements.getAll();
            this.announcements = data.announcements || [];
            this.renderList();
        } catch (error) {
            console.error('Load announcements error:', error);
            document.getElementById('announcements-list').innerHTML = `
                <div class="empty-state">
                    ${Icons.get('alert-circle', {size:32})}
                    <p>Erreur de chargement: ${error.message}</p>
                    <button class="btn btn-outline" onclick="Views.announcements.loadData()">Reessayer</button>
                </div>
            `;
        }
    },
    
    renderList() {
        const container = document.getElementById('announcements-list');
        
        if (this.announcements.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    ${Icons.get('megaphone', {size:32})}
                    <p>Aucune annonce</p>
                    <button class="btn btn-primary" onclick="Views.announcements.showForm()">
                        ${Icons.get('plus', {size:16})} Creer une annonce
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="announcements-list">
                ${this.announcements.map(a => this.renderCard(a)).join('')}
            </div>
        `;
    },
    
    renderCard(a) {
        const typeIcons = {
            info: 'info',
            warning: 'alert-triangle',
            promo: 'tag',
            urgent: 'alert-circle'
        };
        const typeLabels = {
            info: 'Information',
            warning: 'Avertissement',
            promo: 'Promotion',
            urgent: 'Urgent'
        };
        
        return `
            <div class="card mb-md announcement-card ${a.is_active ? '' : 'inactive'}">
                <div class="card-body">
                    <div class="announcement-header">
                        <div class="announcement-title-row">
                            <span class="announcement-type-icon type-${a.type || 'info'}">
                                ${Icons.get(typeIcons[a.type] || 'info', {size:16})}
                            </span>
                            <h3 class="announcement-title">${a.title}</h3>
                        </div>
                        <div class="announcement-badges">
                            <span class="status-badge ${a.is_active ? 'status-delivered' : 'status-pending'}">
                                ${a.is_active ? 'Active' : 'Inactive'}
                            </span>
                            ${a.type ? `<span class="type-badge type-${a.type}">${typeLabels[a.type] || a.type}</span>` : ''}
                        </div>
                    </div>
                    <p class="announcement-content">${a.content}</p>
                    <div class="announcement-footer">
                        <div class="announcement-meta">
                            <span class="text-sm text-muted">
                                ${Icons.get('calendar', {size:12})}
                                ${a.created_at ? new Date(a.created_at).toLocaleDateString('fr-FR') : ''}
                            </span>
                            ${a.start_date || a.end_date ? `
                                <span class="text-sm text-muted">
                                    ${Icons.get('clock', {size:12})}
                                    ${a.start_date ? new Date(a.start_date).toLocaleDateString('fr-FR') : ''} 
                                    ${a.start_date && a.end_date ? '→' : ''} 
                                    ${a.end_date ? new Date(a.end_date).toLocaleDateString('fr-FR') : ''}
                                </span>
                            ` : ''}
                        </div>
                        <div class="announcement-actions">
                            <button class="btn btn-sm btn-ghost" onclick="Views.announcements.toggleActive('${a.id}', this)" title="${a.is_active ? 'Desactiver' : 'Activer'}">
                                ${Icons.get(a.is_active ? 'eye-off' : 'eye', {size:14})}
                            </button>
                            <button class="btn btn-sm btn-ghost" onclick="Views.announcements.editAnnouncement('${a.id}')" title="Modifier">
                                ${Icons.get('edit', {size:14})}
                            </button>
                            <button class="btn btn-sm btn-ghost text-error" onclick="Views.announcements.deleteAnnouncement('${a.id}', this)" title="Supprimer">
                                ${Icons.get('trash', {size:14})}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    async showForm(announcementId = null) {
        const isEdit = !!announcementId;
        let announcement = null;
        
        if (isEdit) {
            announcement = this.announcements.find(a => a.id === announcementId);
            if (!announcement) {
                Toast.error('Annonce non trouvee');
                return;
            }
        }
        
        Modal.open({
            title: isEdit ? 'Modifier l\'annonce' : 'Nouvelle annonce',
            content: `
                <div class="form-group">
                    <label class="form-label">Titre *</label>
                    <input type="text" id="ann-title" class="form-input" value="${announcement?.title || ''}" placeholder="Ex: Fermeture pour les fetes">
                </div>
                <div class="form-group">
                    <label class="form-label">Contenu *</label>
                    <textarea id="ann-content" class="form-input" rows="4" placeholder="Contenu de l'annonce...">${announcement?.content || ''}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <div id="ann-type-container"></div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Date de debut</label>
                        <div id="ann-start-date-container"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Date de fin</label>
                        <div id="ann-end-date-container"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Priorite</label>
                    <input type="number" id="ann-priority" class="form-input" value="${announcement?.priority || 0}" min="0" max="100" placeholder="0 = normale, plus = prioritaire">
                    <small class="form-hint">Les annonces avec une priorite plus elevee s'affichent en premier</small>
                </div>
                <div class="form-group">
                    <label class="toggle-label">
                        <input type="checkbox" id="ann-active" ${announcement?.is_active !== false ? 'checked' : ''}>
                        <span>Active (visible par les clients)</span>
                    </label>
                </div>
                
                ${!isEdit ? `
                <div class="form-divider"></div>
                <h4 class="form-section-title">Notifications</h4>
                <div class="form-group">
                    <label class="toggle-label">
                        <input type="checkbox" id="ann-notify" checked>
                        <span>Notifier tous les clients</span>
                    </label>
                    <small class="form-hint">Envoyer une notification push a tous les clients actifs</small>
                </div>
                <div class="form-group" id="notify-channels-group">
                    <label class="form-label">Canaux de notification</label>
                    <div class="checkbox-group">
                        <label class="checkbox-label">
                            <input type="checkbox" name="notify-channel" value="push" checked>
                            <span>${Icons.get('bell', {size:14})} Push (in-app)</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="notify-channel" value="sms">
                            <span>${Icons.get('message-square', {size:14})} SMS</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="notify-channel" value="whatsapp">
                            <span>${Icons.get('message-circle', {size:14})} WhatsApp</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" name="notify-channel" value="email">
                            <span>${Icons.get('mail', {size:14})} Email</span>
                        </label>
                    </div>
                </div>
                ` : ''}
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-ann">Enregistrer</button>
            `
        });
        
        // Init type select
        this.typeSelect = new SearchSelect({
            container: '#ann-type-container',
            placeholder: 'Type d\'annonce',
            items: [
                { id: 'info', name: 'Information' },
                { id: 'warning', name: 'Avertissement' },
                { id: 'promo', name: 'Promotion' },
                { id: 'urgent', name: 'Urgent' }
            ],
            onSelect: () => {}
        });
        this.typeSelect.setValue(announcement?.type || 'info');
        
        // Init date pickers
        this.startDatePicker = new DatePicker({
            container: document.getElementById('ann-start-date-container'),
            placeholder: 'Date de debut',
            value: announcement?.start_date?.split('T')[0] || null,
            onChange: () => {}
        });
        
        this.endDatePicker = new DatePicker({
            container: document.getElementById('ann-end-date-container'),
            placeholder: 'Date de fin',
            value: announcement?.end_date?.split('T')[0] || null,
            onChange: () => {}
        });
        
        // Toggle notify channels visibility
        if (!isEdit) {
            const notifyCheckbox = document.getElementById('ann-notify');
            const channelsGroup = document.getElementById('notify-channels-group');
            
            notifyCheckbox?.addEventListener('change', () => {
                channelsGroup.style.display = notifyCheckbox.checked ? 'block' : 'none';
            });
        }
        
        document.getElementById('btn-save-ann')?.addEventListener('click', (e) => this.saveAnnouncement(announcementId, e.currentTarget));
    },
    
    async saveAnnouncement(announcementId = null, btn = null) {
        const title = document.getElementById('ann-title').value.trim();
        const content = document.getElementById('ann-content').value.trim();
        const type = this.typeSelect?.getValue() || 'info';
        const startDate = this.startDatePicker?.getValue() || null;
        const endDate = this.endDatePicker?.getValue() || null;
        const priority = parseInt(document.getElementById('ann-priority').value) || 0;
        const isActive = document.getElementById('ann-active').checked;
        
        if (!title) {
            Toast.error('Entrez un titre');
            return;
        }
        if (!content) {
            Toast.error('Entrez le contenu');
            return;
        }
        
        const data = {
            title,
            content,
            type,
            is_active: isActive,
            priority
        };
        
        if (startDate) data.start_date = startDate;
        if (endDate) data.end_date = endDate;
        
        // Options de notification (seulement pour la création)
        if (!announcementId) {
            const notifyCheckbox = document.getElementById('ann-notify');
            if (notifyCheckbox?.checked) {
                data.notify_clients = true;
                
                // Récupérer les canaux sélectionnés
                const channelCheckboxes = document.querySelectorAll('input[name="notify-channel"]:checked');
                data.notify_channels = Array.from(channelCheckboxes).map(cb => cb.value);
                
                // Au moins push par défaut
                if (data.notify_channels.length === 0) {
                    data.notify_channels = ['push'];
                }
            }
        }
        
        try {
            if (!btn) btn = document.getElementById('btn-save-ann');
            Loader.button(btn, true, { text: 'Enregistrement...' });
            if (announcementId) {
                await API.announcements.update(announcementId, data);
                Toast.success('Annonce modifiee');
            } else {
                const result = await API.announcements.create(data);
                
                // Afficher le résultat des notifications
                if (data.notify_clients && result.notifications) {
                    const notifs = result.notifications;
                    if (notifs.error) {
                        Toast.warning(`Annonce creee mais erreur notifications: ${notifs.error}`);
                    } else if (notifs.success !== undefined) {
                        Toast.success(`Annonce creee et ${notifs.success} clients notifies`);
                    } else {
                        Toast.success('Annonce creee et notifications envoyees');
                    }
                } else {
                    Toast.success('Annonce creee');
                }
            }
            Modal.close();
            await this.loadData();
        } catch (error) {
            console.error('Save announcement error:', error);
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    editAnnouncement(id) {
        this.showForm(id);
    },
    
    async toggleActive(id, btn = null) {
        try {
            Loader.button(btn, true, { text: '' });
            await API.announcements.toggleActive(id);
            const ann = this.announcements.find(a => a.id === id);
            Toast.success(ann?.is_active ? 'Annonce desactivee' : 'Annonce activee');
            await this.loadData();
        } catch (error) {
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    async deleteAnnouncement(id, btn = null) {
        if (await Modal.confirm({ title: 'Supprimer ?', message: 'Supprimer cette annonce ?', danger: true })) {
            try {
                Loader.button(btn, true, { text: '' });
                await API.announcements.delete(id);
                Toast.success('Annonce supprimee');
                await this.loadData();
            } catch (error) {
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        }
    }
};
