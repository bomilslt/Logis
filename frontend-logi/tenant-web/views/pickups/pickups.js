/**
 * Vue Pickups - Retrait de colis (version enrichie)
 * Mini dashboard + Table des colis disponibles + Formulaire complet
 */

Views.pickups = {
    currentPackage: null,
    signatureCanvas: null,
    signatureCtx: null,
    isDrawing: false,
    photoFile: null,
    dataTable: null,
    stats: null,
    
    async render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="pickups-page">
                <div class="page-header">
                    <h1 class="page-title">🎯 Retrait de Colis</h1>
                    <div class="header-actions">
                        <button class="btn btn-outline" id="btn-history">
                            ${Icons.get('clock', {size:16})} Historique
                        </button>
                    </div>
                </div>
                
                <!-- MINI DASHBOARD -->
                <div class="stats-grid mb-md" id="stats-container">
                    <div class="stat-card">
                        <div class="stat-icon bg-warning">${Icons.get('package', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-awaiting">-</span>
                            <span class="stat-label">En attente de retrait</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-danger">${Icons.get('dollar-sign', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-payment">-</span>
                            <span class="stat-label">Paiement en attente</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-success">${Icons.get('check-circle', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-today">-</span>
                            <span class="stat-label">Retraits aujourd'hui</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-primary">${Icons.get('calendar', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-month">-</span>
                            <span class="stat-label">Ce mois</span>
                        </div>
                    </div>
                </div>

                <!-- RECHERCHE -->
                <div class="card mb-md">
                    <div class="card-header">
                        <h3 class="card-title">Recherche rapide</h3>
                    </div>
                    <div class="card-body">
                        <div class="search-row">
                            <div class="search-group">
                                <label class="form-label">Scanner le code</label>
                                <input type="text" id="scanInput" class="form-input" 
                                    placeholder="Scanner ou coller le tracking..." autofocus />
                            </div>
                            <div class="search-group">
                                <label class="form-label">Ou rechercher par nom/téléphone</label>
                                <div class="input-with-btn">
                                    <input type="text" id="searchInput" class="form-input" 
                                        placeholder="Nom du client ou téléphone..." />
                                    <button id="searchBtn" class="btn btn-primary">
                                        ${Icons.get('search', {size:18})}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div id="searchError" class="alert alert-error mt-sm" style="display: none;"></div>
                    </div>
                </div>
                
                <!-- TABLE DES COLIS DISPONIBLES -->
                <div class="card mb-md">
                    <div class="card-header">
                        <h3 class="card-title">Colis disponibles pour retrait</h3>
                    </div>
                    <div class="card-body">
                        <div id="packagesTable"></div>
                    </div>
                </div>

                <!-- FORMULAIRE DE RETRAIT (toujours visible) -->
                <div class="card" id="pickupForm">
                    <div class="card-header">
                        <h3 class="card-title">Formulaire de retrait</h3>
                        <span class="badge badge-secondary" id="formStatus">Aucun colis sélectionné</span>
                    </div>
                    <div class="card-body">
                        <div class="pickup-form-grid">
                            <!-- Colonne gauche: Infos colis -->
                            <div class="form-section">
                                <h4 class="section-title">Informations du colis</h4>
                                <div class="form-group">
                                    <label class="form-label">Tracking</label>
                                    <input type="text" id="pkg-tracking" class="form-input" readonly disabled />
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">Client</label>
                                        <input type="text" id="pkg-client" class="form-input" readonly disabled />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Téléphone</label>
                                        <input type="text" id="pkg-phone" class="form-input" readonly disabled />
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Description</label>
                                    <input type="text" id="pkg-description" class="form-input" readonly disabled />
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">Statut</label>
                                        <input type="text" id="pkg-status" class="form-input" readonly disabled />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Date arrivée</label>
                                        <input type="text" id="pkg-arrived" class="form-input" readonly disabled />
                                    </div>
                                </div>
                                
                                <!-- Paiement -->
                                <h4 class="section-title mt-md">Paiement</h4>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">Montant total</label>
                                        <input type="text" id="pkg-total" class="form-input" readonly disabled />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Déjà payé</label>
                                        <input type="text" id="pkg-paid" class="form-input" readonly disabled />
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Reste à payer</label>
                                    <input type="text" id="pkg-remaining" class="form-input font-bold" readonly disabled />
                                </div>
                            </div>

                            <!-- Colonne droite: Retrait -->
                            <div class="form-section">
                                <h4 class="section-title">Qui retire le colis ?</h4>
                                <div class="form-group">
                                    <div class="radio-group-vertical">
                                        <label class="radio-label">
                                            <input type="radio" name="pickupBy" value="client" checked disabled />
                                            <span>Client lui-même</span>
                                        </label>
                                        <label class="radio-label">
                                            <input type="radio" name="pickupBy" value="proxy" disabled />
                                            <span>Mandataire (tierce personne)</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <!-- Champs mandataire -->
                                <div id="proxyFields" class="proxy-fields" style="display: none;">
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label class="form-label">Nom du mandataire *</label>
                                            <input type="text" id="proxyName" class="form-input" disabled />
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label">Téléphone *</label>
                                            <input type="tel" id="proxyPhone" class="form-input" disabled />
                                        </div>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label class="form-label">Type de pièce *</label>
                                            <select id="proxyIdType" class="form-input" disabled>
                                                <option value="">Sélectionner...</option>
                                                <option value="cni">CNI</option>
                                                <option value="passport">Passeport</option>
                                                <option value="permis">Permis de conduire</option>
                                                <option value="autre">Autre</option>
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label">Numéro de pièce *</label>
                                            <input type="text" id="proxyIdNumber" class="form-input" disabled />
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Paiement au retrait -->
                                <div id="paymentFields" class="payment-fields mt-md" style="display: none;">
                                    <h4 class="section-title">Encaissement</h4>
                                    <div class="payment-amount-box">
                                        <span>Montant à encaisser:</span>
                                        <strong id="paymentAmount">0 XAF</strong>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label class="form-label">Méthode *</label>
                                            <select id="paymentMethod" class="form-input" disabled>
                                                <option value="">Sélectionner...</option>
                                                <option value="cash">Espèces</option>
                                                <option value="mobile_money">Mobile Money</option>
                                                <option value="bank_transfer">Virement</option>
                                                <option value="card">Carte</option>
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label">Référence</label>
                                            <input type="text" id="paymentReference" class="form-input" 
                                                placeholder="N° transaction..." disabled />
                                        </div>
                                    </div>
                                </div>

                                <!-- Signature -->
                                <h4 class="section-title mt-md">Signature</h4>
                                <div class="signature-container">
                                    <canvas id="signatureCanvas" width="400" height="150"></canvas>
                                </div>
                                <div class="signature-actions">
                                    <button id="clearSignature" class="btn btn-sm btn-outline" disabled>
                                        ${Icons.get('x', {size:14})} Effacer
                                    </button>
                                </div>
                                
                                <!-- Photo -->
                                <h4 class="section-title mt-md">Photo de preuve</h4>
                                <div class="photo-upload-row">
                                    <input type="file" id="photoInput" accept="image/*" style="display: none;" />
                                    <button id="takePhoto" class="btn btn-outline" disabled>
                                        ${Icons.get('camera', {size:16})} Ajouter photo
                                    </button>
                                    <div id="photoPreview" class="photo-preview-small" style="display: none;">
                                        <img id="photoImg" src="" alt="Preview" />
                                        <button id="removePhoto" class="btn-remove-photo">×</button>
                                    </div>
                                </div>
                                
                                <!-- Notes -->
                                <div class="form-group mt-md">
                                    <label class="form-label">Notes</label>
                                    <textarea id="pickupNotes" class="form-input" rows="2" 
                                        placeholder="Remarques..." disabled></textarea>
                                </div>
                                
                                <!-- Actions -->
                                <div class="form-actions mt-md">
                                    <button id="cancelPickup" class="btn btn-outline" disabled>
                                        Annuler
                                    </button>
                                    <button id="confirmPickup" class="btn btn-primary btn-lg" disabled>
                                        ${Icons.get('check', {size:18})} Confirmer le retrait
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.loadStats();
        this.loadAvailablePackages();
        this.initSignatureCanvas();
        this.attachEventListeners();
    },

    async loadStats() {
        try {
            const stats = await API.request('/pickups/stats');
            document.getElementById('stat-awaiting').textContent = stats.awaiting_pickup;
            document.getElementById('stat-payment').textContent = stats.awaiting_payment;
            document.getElementById('stat-today').textContent = stats.pickups_today;
            document.getElementById('stat-month').textContent = stats.pickups_month;
        } catch (e) {
            console.error('Erreur chargement stats:', e);
        }
    },
    
    async loadAvailablePackages() {
        try {
            const response = await API.request('/pickups/available?per_page=10');
            
            this.dataTable = new DataTable({
                container: '#packagesTable',
                pageSize: 10,
                data: response.packages,
                emptyMessage: 'Aucun colis en attente de retrait',
                columns: [
                    { key: 'tracking_number', label: 'Tracking' },
                    { key: 'client_name', label: 'Client' },
                    { key: 'client_phone', label: 'Téléphone' },
                    { key: 'description', label: 'Description' },
                    { 
                        key: 'status', 
                        label: 'Statut',
                        render: (val) => this.getStatusBadge(val)
                    },
                    { 
                        key: 'remaining', 
                        label: 'Reste à payer',
                        render: (val, row) => {
                            const cls = val > 0 ? 'text-danger font-bold' : 'text-success';
                            return `<span class="${cls}">${this.formatAmount(val)} ${row.currency}</span>`;
                        }
                    }
                ],
                onRowClick: (pkg) => this.selectPackage(pkg)
            });
        } catch (e) {
            console.error('Erreur chargement colis:', e);
            document.getElementById('packagesTable').innerHTML = 
                '<p class="text-danger">Erreur de chargement</p>';
        }
    },
    
    attachEventListeners() {
        // Scan input - recherche automatique après 500ms
        let scanTimeout;
        document.getElementById('scanInput').addEventListener('input', (e) => {
            clearTimeout(scanTimeout);
            const val = e.target.value.trim();
            if (val.length >= 5) {
                scanTimeout = setTimeout(() => this.searchPackage(val), 500);
            }
        });
        
        // Recherche manuelle
        document.getElementById('searchBtn').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const val = document.getElementById('searchInput').value.trim();
            if (val) this.searchPackage(val, btn);
        });
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const val = e.target.value.trim();
                if (val) this.searchPackage(val);
            }
        });
        
        // Historique
        document.getElementById('btn-history').addEventListener('click', () => this.showHistory());
        
        // Radio pickup by
        document.querySelectorAll('input[name="pickupBy"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.toggleProxyFields(e.target.value));
        });
        
        // Signature
        document.getElementById('clearSignature').addEventListener('click', () => this.clearSignature());
        
        // Photo
        document.getElementById('takePhoto').addEventListener('click', () => {
            document.getElementById('photoInput').click();
        });
        document.getElementById('photoInput').addEventListener('change', (e) => this.handlePhotoUpload(e));
        document.getElementById('removePhoto').addEventListener('click', () => this.removePhoto());
        
        // Actions
        document.getElementById('cancelPickup').addEventListener('click', () => this.cancelSelection());
        document.getElementById('confirmPickup').addEventListener('click', (e) => this.confirmPickup(e.currentTarget));
    },

    initSignatureCanvas() {
        this.signatureCanvas = document.getElementById('signatureCanvas');
        if (!this.signatureCanvas) {
            console.error('Canvas de signature non trouvé!');
            return;
        }
        
        this.signatureCtx = this.signatureCanvas.getContext('2d');
        this.signatureCtx.strokeStyle = '#000';
        this.signatureCtx.lineWidth = 2;
        this.signatureCtx.lineCap = 'round';
        
        // Bind des méthodes pour conserver le contexte this
        const startDrawing = (e) => {
            if (!this.currentPackage) return;
            this.isDrawing = true;
            const rect = this.signatureCanvas.getBoundingClientRect();
            const x = (e.clientX || e.pageX) - rect.left;
            const y = (e.clientY || e.pageY) - rect.top;
            this.signatureCtx.beginPath();
            this.signatureCtx.moveTo(x, y);
        };
        
        const draw = (e) => {
            if (!this.isDrawing || !this.currentPackage) return;
            const rect = this.signatureCanvas.getBoundingClientRect();
            const x = (e.clientX || e.pageX) - rect.left;
            const y = (e.clientY || e.pageY) - rect.top;
            this.signatureCtx.lineTo(x, y);
            this.signatureCtx.stroke();
        };
        
        const stopDrawing = () => {
            this.isDrawing = false;
        };
        
        // Events souris
        this.signatureCanvas.addEventListener('mousedown', startDrawing);
        this.signatureCanvas.addEventListener('mousemove', draw);
        this.signatureCanvas.addEventListener('mouseup', stopDrawing);
        this.signatureCanvas.addEventListener('mouseleave', stopDrawing);
        
        // Events tactiles
        this.signatureCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startDrawing(e.touches[0]);
        });
        this.signatureCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            draw(e.touches[0]);
        });
        this.signatureCanvas.addEventListener('touchend', stopDrawing);
        
        this.clearSignature();
        console.log('Canvas de signature initialisé');
    },
    
    clearSignature() {
        if (!this.signatureCtx) return;
        this.signatureCtx.fillStyle = '#f8f9fa';
        this.signatureCtx.fillRect(0, 0, this.signatureCanvas.width, this.signatureCanvas.height);
    },
    
    async searchPackage(query, btn = null) {
        const errorDiv = document.getElementById('searchError');
        errorDiv.style.display = 'none';
        
        try {
            Loader.button(btn, true, { text: '' });
            const response = await API.post('/pickups/search', { query });
            this.selectPackageFromSearch(response.package, response.payment);
        } catch (error) {
            errorDiv.textContent = error.message || 'Colis non trouvé';
            errorDiv.style.display = 'block';
        } finally {
            Loader.button(btn, false);
        }
    },
    
    selectPackage(pkg) {
        // Sélection depuis la table - on doit récupérer les détails complets
        this.searchPackage(pkg.tracking_number);
    },
    
    selectPackageFromSearch(pkg, payment) {
        this.currentPackage = pkg;
        
        // Remplir les champs
        document.getElementById('pkg-tracking').value = pkg.tracking_number;
        document.getElementById('pkg-client').value = pkg.client?.full_name || 'N/A';
        document.getElementById('pkg-phone').value = pkg.client?.phone || '';
        document.getElementById('pkg-description').value = pkg.description || '';
        document.getElementById('pkg-status').value = this.getStatusLabel(pkg.status);
        document.getElementById('pkg-arrived').value = pkg.updated_at ? new Date(pkg.updated_at).toLocaleDateString('fr-FR') : '';
        
        // Paiement
        const currency = payment.currency || 'XAF';
        document.getElementById('pkg-total').value = `${this.formatAmount(payment.total_amount)} ${currency}`;
        document.getElementById('pkg-paid').value = `${this.formatAmount(payment.paid_amount)} ${currency}`;
        document.getElementById('pkg-remaining').value = `${this.formatAmount(payment.remaining_amount)} ${currency}`;
        
        // Afficher section paiement si nécessaire
        const paymentFields = document.getElementById('paymentFields');
        if (payment.remaining_amount > 0) {
            paymentFields.style.display = 'block';
            document.getElementById('paymentAmount').textContent = `${this.formatAmount(payment.remaining_amount)} ${currency}`;
        } else {
            paymentFields.style.display = 'none';
        }
        
        // Activer les champs
        this.enableForm(true);
        
        // Mettre à jour le badge
        document.getElementById('formStatus').textContent = pkg.tracking_number;
        document.getElementById('formStatus').className = 'badge badge-primary';
        
        // Scroll vers le formulaire
        document.getElementById('pickupForm').scrollIntoView({ behavior: 'smooth' });
    },

    enableForm(enabled) {
        const fields = [
            'input[name="pickupBy"]',
            '#proxyName', '#proxyPhone', '#proxyIdType', '#proxyIdNumber',
            '#paymentMethod', '#paymentReference',
            '#clearSignature', '#takePhoto', '#pickupNotes',
            '#cancelPickup', '#confirmPickup'
        ];
        
        fields.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.disabled = !enabled;
            });
        });
        
        // Canvas
        this.signatureCanvas.style.pointerEvents = enabled ? 'auto' : 'none';
        this.signatureCanvas.style.opacity = enabled ? '1' : '0.5';
    },
    
    toggleProxyFields(pickupBy) {
        const proxyFields = document.getElementById('proxyFields');
        proxyFields.style.display = pickupBy === 'proxy' ? 'block' : 'none';
    },
    
    handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            Toast.error('Veuillez sélectionner une image');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            Toast.error('Image trop volumineuse (max 5MB)');
            return;
        }
        
        this.photoFile = file;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('photoImg').src = e.target.result;
            document.getElementById('photoPreview').style.display = 'flex';
        };
        reader.readAsDataURL(file);
    },
    
    removePhoto() {
        this.photoFile = null;
        document.getElementById('photoInput').value = '';
        document.getElementById('photoPreview').style.display = 'none';
    },
    
    cancelSelection() {
        this.currentPackage = null;
        this.photoFile = null;
        
        // Vider les champs
        ['pkg-tracking', 'pkg-client', 'pkg-phone', 'pkg-description', 
         'pkg-status', 'pkg-arrived', 'pkg-total', 'pkg-paid', 'pkg-remaining',
         'proxyName', 'proxyPhone', 'proxyIdNumber', 'paymentReference', 'pickupNotes'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        document.getElementById('proxyIdType').value = '';
        document.getElementById('paymentMethod').value = '';
        document.getElementById('proxyFields').style.display = 'none';
        document.getElementById('paymentFields').style.display = 'none';
        document.getElementById('photoPreview').style.display = 'none';
        document.querySelector('input[name="pickupBy"][value="client"]').checked = true;
        
        this.clearSignature();
        this.enableForm(false);
        
        document.getElementById('formStatus').textContent = 'Aucun colis sélectionné';
        document.getElementById('formStatus').className = 'badge badge-secondary';
        
        // Vider les inputs de recherche
        document.getElementById('scanInput').value = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('searchError').style.display = 'none';
    },

    async confirmPickup(btn = null) {
        if (!this.currentPackage) {
            Toast.error('Aucun colis sélectionné');
            return;
        }
        
        const pickupBy = document.querySelector('input[name="pickupBy"]:checked').value;
        
        // Valider mandataire
        if (pickupBy === 'proxy') {
            const proxyName = document.getElementById('proxyName').value.trim();
            const proxyPhone = document.getElementById('proxyPhone').value.trim();
            const proxyIdType = document.getElementById('proxyIdType').value;
            const proxyIdNumber = document.getElementById('proxyIdNumber').value.trim();
            
            if (!proxyName || !proxyPhone || !proxyIdType || !proxyIdNumber) {
                Toast.error('Veuillez remplir tous les champs du mandataire');
                return;
            }
        }
        
        // Valider paiement
        const paymentFields = document.getElementById('paymentFields');
        if (paymentFields.style.display !== 'none') {
            const paymentMethod = document.getElementById('paymentMethod').value;
            if (!paymentMethod) {
                Toast.error('Veuillez sélectionner une méthode de paiement');
                return;
            }
        }
        
        // Valider signature
        if (this.isCanvasBlank()) {
            Toast.error('Veuillez faire signer le retireur');
            return;
        }
        
        if (!confirm('Confirmer le retrait de ce colis ?')) return;
        
        try {
            if (!btn) btn = document.getElementById('confirmPickup');
            Loader.button(btn, true, { text: 'Validation...' });
            const data = {
                package_id: this.currentPackage.id,
                pickup_by: pickupBy,
                signature: this.signatureCanvas.toDataURL('image/png'),
                notes: document.getElementById('pickupNotes').value.trim()
            };
            
            if (pickupBy === 'proxy') {
                data.proxy_name = document.getElementById('proxyName').value.trim();
                data.proxy_phone = document.getElementById('proxyPhone').value.trim();
                data.proxy_id_type = document.getElementById('proxyIdType').value;
                data.proxy_id_number = document.getElementById('proxyIdNumber').value.trim();
            }
            
            let paymentAmount = 0;
            let paymentMethodValue = '';
            if (paymentFields.style.display !== 'none') {
                paymentMethodValue = document.getElementById('paymentMethod').value;
                data.payment = {
                    method: paymentMethodValue,
                    reference: document.getElementById('paymentReference').value.trim()
                };
                paymentAmount = this.currentPackage.balance || 0;
            }
            
            if (this.photoFile) {
                const formData = new FormData();
                formData.append('photo', this.photoFile);
                const photoResponse = await API.upload('/pickups/upload-photo', formData);
                data.photo_url = photoResponse.photo_url;
            }
            
            const result = await API.post('/pickups/process', data);
            
            Toast.success('Retrait effectué avec succès!');
            
            // Proposer d'imprimer le reçu
            const pickupData = {
                pickup_number: result.pickup?.id ? `RET-${result.pickup.id.substring(0, 8).toUpperCase()}` : `RET-${Date.now()}`,
                date: new Date().toLocaleString('fr-FR'),
                client: {
                    name: pickupBy === 'proxy' ? 
                        `${data.proxy_name} (pour ${this.currentPackage.client?.full_name || 'Client'})` : 
                        this.currentPackage.client?.full_name || 'Client',
                    phone: pickupBy === 'proxy' ? data.proxy_phone : this.currentPackage.client?.phone || ''
                },
                packages: [{
                    tracking: this.currentPackage.tracking_number || this.currentPackage.supplier_tracking,
                    weight: this.currentPackage.weight || ''
                }],
                total_amount: paymentAmount,
                payment_method: this.getPaymentMethodLabel(paymentMethodValue),
                delivered_by: Store.user?.full_name || '',
                signature: data.signature,
                currency: 'XAF'
            };
            
            // Demander si on veut imprimer avec choix du format
            if (await Modal.confirm({
                title: 'Retrait confirmé',
                message: 'Voulez-vous imprimer le reçu de retrait ?'
            })) {
                InvoiceService.print({
                    type: 'pickup',
                    id: result.pickup?.id,
                    data: pickupData,
                    showMenu: false  // Utilise le format par défaut
                });
            }
            
            // Reset et recharger
            this.cancelSelection();
            this.loadStats();
            this.loadAvailablePackages();
            
            document.getElementById('scanInput').focus();
            
        } catch (error) {
            Toast.error(error.message || 'Erreur lors du retrait');
        } finally {
            Loader.button(btn, false);
        }
    },
    
    isCanvasBlank() {
        const blank = document.createElement('canvas');
        blank.width = this.signatureCanvas.width;
        blank.height = this.signatureCanvas.height;
        const ctx = blank.getContext('2d');
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, blank.width, blank.height);
        return this.signatureCanvas.toDataURL() === blank.toDataURL();
    },

    async showHistory() {
        // Variables pour la pagination
        this.historyPage = 1;
        this.historySearch = '';
        this.historyItems = [];
        this.historyHasMore = true;
        
        const content = `
            <div class="history-container">
                <div class="history-search mb-md">
                    <input type="text" id="historySearchInput" class="form-input" 
                        placeholder="Rechercher par tracking, nom ou téléphone..." />
                </div>
                <div id="historyList" class="history-list"></div>
                <div id="historyLoader" class="text-center py-md" style="display: none;">
                    <span class="text-muted">Chargement...</span>
                </div>
                <div id="historyLoadMore" class="text-center py-md" style="display: none;">
                    <button id="btnLoadMore" class="btn btn-outline">
                        Charger plus de résultats
                    </button>
                </div>
                <div id="historyEmpty" class="text-center py-md text-muted" style="display: none;">
                    Aucun retrait trouvé
                </div>
            </div>
        `;
        
        Modal.open({
            title: 'Historique des retraits',
            size: 'lg',
            content: content,
            footer: `<button class="btn btn-secondary" onclick="Modal.close()">Fermer</button>`
        });
        
        // Charger les premiers résultats
        await this.loadHistoryPage();
        
        // Event recherche avec debounce
        let searchTimeout;
        document.getElementById('historySearchInput')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.historySearch = e.target.value.trim();
                this.historyPage = 1;
                this.historyItems = [];
                this.historyHasMore = true;
                document.getElementById('historyList').innerHTML = '';
                this.loadHistoryPage();
            }, 400);
        });
        
        // Event charger plus
        document.getElementById('btnLoadMore')?.addEventListener('click', () => {
            this.historyPage++;
            this.loadHistoryPage();
        });
    },
    
    async loadHistoryPage() {
        const loader = document.getElementById('historyLoader');
        const loadMoreBtn = document.getElementById('historyLoadMore');
        const emptyMsg = document.getElementById('historyEmpty');
        const listContainer = document.getElementById('historyList');
        
        if (!listContainer) return;
        
        loader.style.display = 'block';
        loadMoreBtn.style.display = 'none';
        
        try {
            let url = `/pickups/history?page=${this.historyPage}&per_page=10`;
            if (this.historySearch) {
                url += `&search=${encodeURIComponent(this.historySearch)}`;
            }
            
            const response = await API.request(url);
            
            loader.style.display = 'none';
            
            if (response.pickups.length === 0 && this.historyPage === 1) {
                emptyMsg.style.display = 'block';
                return;
            }
            
            emptyMsg.style.display = 'none';
            
            // Ajouter les items
            response.pickups.forEach(p => {
                const itemHtml = this.renderHistoryItem(p);
                listContainer.insertAdjacentHTML('beforeend', itemHtml);
            });
            
            // Afficher "Charger plus" si il y a plus de pages
            this.historyHasMore = this.historyPage < response.pagination.pages;
            loadMoreBtn.style.display = this.historyHasMore ? 'block' : 'none';
            
        } catch (e) {
            loader.style.display = 'none';
            Toast.error('Erreur de chargement');
        }
    },
    
    renderHistoryItem(p) {
        return `
            <div class="history-item">
                <div class="history-row">
                    <div class="history-main">
                        <strong>${p.package?.tracking_number || 'N/A'}</strong>
                        <span class="badge ${p.pickup_by === 'proxy' ? 'badge-warning' : 'badge-success'}">
                            ${p.pickup_by === 'proxy' ? 'Mandataire' : 'Client'}
                        </span>
                    </div>
                    <div class="history-actions">
                        <div class="btn-group">
                            <button class="btn btn-sm btn-ghost" onclick="Views.pickups.printPickupReceipt('${p.id}')" title="Imprimer (${InvoiceService.PRINT_FORMATS[InvoiceService.getDefaultPrintFormat()]?.label || 'Ticket'})">
                                ${Icons.get('printer', {size:14})}
                            </button>
                            <button class="btn btn-sm btn-ghost" onclick="Views.pickups.printPickupReceipt('${p.id}', true)" title="Choisir le format">
                                ${Icons.get('chevron-down', {size:12})}
                            </button>
                        </div>
                        <span class="text-sm text-muted">
                            ${new Date(p.picked_up_at).toLocaleString('fr-FR')}
                        </span>
                    </div>
                </div>
                <div class="history-row">
                    <span class="text-muted">${p.client?.full_name || 'N/A'} - ${p.client?.phone || ''}</span>
                    ${p.payment_collected > 0 ? `
                        <span class="text-success font-bold">
                            +${this.formatAmount(p.payment_collected)} XAF
                        </span>
                    ` : ''}
                </div>
                ${p.pickup_by === 'proxy' ? `
                    <div class="history-row text-sm">
                        <span class="text-muted">
                            Mandataire: ${p.proxy_name} (${p.proxy_phone})
                        </span>
                    </div>
                ` : ''}
            </div>
        `;
    },
    
    /**
     * Imprimer le reçu d'un retrait
     */
    printPickupReceipt(pickupId, forceMenu = false) {
        const pickup = this.historyData.find(p => p.id === pickupId);
        if (!pickup) {
            Toast.error('Retrait non trouvé');
            return;
        }
        
        const printData = {
            pickup_number: `RET-${pickup.id.substring(0, 8).toUpperCase()}`,
            date: new Date(pickup.picked_up_at).toLocaleString('fr-FR'),
            client: {
                name: pickup.pickup_by === 'proxy' ? 
                    `${pickup.proxy_name} (pour ${pickup.client?.full_name})` : 
                    pickup.client?.full_name || 'Client',
                phone: pickup.pickup_by === 'proxy' ? pickup.proxy_phone : pickup.client?.phone || ''
            },
            packages: [{
                tracking: pickup.package?.tracking_number || 'N/A',
                weight: pickup.package?.weight || ''
            }],
            total_amount: pickup.payment_collected || 0,
            payment_method: this.getPaymentMethodLabel(pickup.payment_method),
            delivered_by: pickup.delivered_by_name || '',
            signature: pickup.signature_data || null,
            currency: 'XAF'
        };
        
        // Utiliser le format par défaut (ou afficher menu si forceMenu)
        InvoiceService.print({
            type: 'pickup',
            id: pickupId,
            data: printData,
            showMenu: forceMenu
        });
    },
    
    getPaymentMethodLabel(method) {
        const labels = {
            'cash': 'Espèces',
            'mobile_money': 'Mobile Money',
            'bank': 'Virement bancaire',
            'card': 'Carte bancaire',
            'prepaid': 'Prépayé'
        };
        return labels[method] || method || 'N/A';
    },
    
    getStatusBadge(status) {
        const map = {
            'arrived_port': { label: 'Arrivé', class: 'badge-info' },
            'customs': { label: 'Douane', class: 'badge-warning' },
            'out_for_delivery': { label: 'Prêt', class: 'badge-success' }
        };
        const s = map[status] || { label: status, class: 'badge-secondary' };
        return `<span class="badge ${s.class}">${s.label}</span>`;
    },
    
    getStatusLabel(status) {
        const map = {
            'pending': 'En attente',
            'received': 'Reçu',
            'in_transit': 'En transit',
            'arrived_port': 'Arrivé au port',
            'customs': 'En douane',
            'out_for_delivery': 'Prêt pour retrait',
            'delivered': 'Livré'
        };
        return map[status] || status;
    },
    
    formatAmount(amount) {
        return new Intl.NumberFormat('fr-FR').format(amount || 0);
    }
};
