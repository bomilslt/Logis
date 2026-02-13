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
                    <h1 class="page-title">🎯 ${I18n.t('pickups.title')}</h1>
                    <div class="header-actions">
                        <button class="btn btn-outline" id="btn-history">
                            ${Icons.get('clock', {size:16})} ${I18n.t('pickups.history')}
                        </button>
                    </div>
                </div>
                
                <!-- MINI DASHBOARD -->
                <div class="stats-grid mb-md" id="stats-container">
                    <div class="stat-card">
                        <div class="stat-icon bg-warning">${Icons.get('package', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-awaiting">-</span>
                            <span class="stat-label">${I18n.t('pickups.awaiting')}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-danger">${Icons.get('dollar-sign', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-payment">-</span>
                            <span class="stat-label">${I18n.t('pickups.payment_pending')}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-success">${Icons.get('check-circle', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-today">-</span>
                            <span class="stat-label">${I18n.t('pickups.today_pickups')}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-primary">${Icons.get('calendar', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-month">-</span>
                            <span class="stat-label">${I18n.t('pickups.this_month')}</span>
                        </div>
                    </div>
                </div>

                <!-- RECHERCHE -->
                <div class="card mb-md">
                    <div class="card-header">
                        <h3 class="card-title">${I18n.t('pickups.quick_search')}</h3>
                    </div>
                    <div class="card-body">
                        <div class="search-row">
                            <div class="search-group">
                                <label class="form-label">${I18n.t('pickups.scan_code')}</label>
                                <input type="text" id="scanInput" class="form-input" 
                                    placeholder="${I18n.t('pickups.scan_placeholder')}" autofocus />
                            </div>
                            <div class="search-group">
                                <label class="form-label">${I18n.t('pickups.search_by_name')}</label>
                                <div class="input-with-btn">
                                    <input type="text" id="searchInput" class="form-input" 
                                        placeholder="${I18n.t('pickups.search_placeholder')}" />
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
                        <h3 class="card-title">${I18n.t('pickups.available_packages')}</h3>
                    </div>
                    <div class="card-body">
                        <div id="packagesTable"></div>
                    </div>
                </div>

                <!-- FORMULAIRE DE RETRAIT (toujours visible) -->
                <div class="card" id="pickupForm">
                    <div class="card-header">
                        <h3 class="card-title">${I18n.t('pickups.pickup_form')}</h3>
                        <span class="badge badge-secondary" id="formStatus">${I18n.t('pickups.no_package_selected')}</span>
                    </div>
                    <div class="card-body">
                        <div class="pickup-form-grid">
                            <!-- Colonne gauche: Infos colis -->
                            <div class="form-section">
                                <h4 class="section-title">${I18n.t('pickups.package_info')}</h4>
                                <div class="form-group">
                                    <label class="form-label">${I18n.t('pickups.tracking')}</label>
                                    <input type="text" id="pkg-tracking" class="form-input" readonly disabled />
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">${I18n.t('pickups.client')}</label>
                                        <input type="text" id="pkg-client" class="form-input" readonly disabled />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">${I18n.t('pickups.phone')}</label>
                                        <input type="text" id="pkg-phone" class="form-input" readonly disabled />
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">${I18n.t('pickups.description')}</label>
                                    <input type="text" id="pkg-description" class="form-input" readonly disabled />
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">${I18n.t('pickups.status')}</label>
                                        <input type="text" id="pkg-status" class="form-input" readonly disabled />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">${I18n.t('pickups.arrived_date')}</label>
                                        <input type="text" id="pkg-arrived" class="form-input" readonly disabled />
                                    </div>
                                </div>
                                
                                <!-- Paiement -->
                                <h4 class="section-title mt-md">${I18n.t('pickups.payment')}</h4>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label">${I18n.t('pickups.total_amount')}</label>
                                        <input type="text" id="pkg-total" class="form-input" readonly disabled />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">${I18n.t('pickups.already_paid')}</label>
                                        <input type="text" id="pkg-paid" class="form-input" readonly disabled />
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">${I18n.t('pickups.remaining_to_pay')}</label>
                                    <input type="text" id="pkg-remaining" class="form-input font-bold" readonly disabled />
                                </div>
                            </div>

                            <!-- Colonne droite: Retrait -->
                            <div class="form-section">
                                <h4 class="section-title">${I18n.t('pickups.who_picks_up')}</h4>
                                <div class="form-group">
                                    <div class="radio-group-vertical">
                                        <label class="radio-label">
                                            <input type="radio" name="pickupBy" value="client" checked disabled />
                                            <span>${I18n.t('pickups.client_self')}</span>
                                        </label>
                                        <label class="radio-label">
                                            <input type="radio" name="pickupBy" value="proxy" disabled />
                                            <span>${I18n.t('pickups.proxy')}</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <!-- Champs mandataire -->
                                <div id="proxyFields" class="proxy-fields" style="display: none;">
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label class="form-label">${I18n.t('pickups.proxy_name')} *</label>
                                            <input type="text" id="proxyName" class="form-input" disabled />
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label">${I18n.t('pickups.proxy_phone')} *</label>
                                            <input type="tel" id="proxyPhone" class="form-input" disabled />
                                        </div>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label class="form-label">${I18n.t('pickups.id_type')} *</label>
                                            <select id="proxyIdType" class="form-input" disabled>
                                                <option value="">${I18n.t('pickups.select')}</option>
                                                <option value="cni">${I18n.t('pickups.cni')}</option>
                                                <option value="passport">${I18n.t('pickups.passport')}</option>
                                                <option value="permis">${I18n.t('pickups.driving_license')}</option>
                                                <option value="autre">${I18n.t('pickups.other')}</option>
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label">${I18n.t('pickups.id_number')} *</label>
                                            <input type="text" id="proxyIdNumber" class="form-input" disabled />
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Paiement au retrait -->
                                <div id="paymentFields" class="payment-fields mt-md" style="display: none;">
                                    <h4 class="section-title">${I18n.t('pickups.collection')}</h4>
                                    <div class="payment-amount-box">
                                        <span>${I18n.t('pickups.amount_to_collect')}:</span>
                                        <strong id="paymentAmount">0 XAF</strong>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label class="form-label">${I18n.t('pickups.method')}</label>
                                            <select id="paymentMethod" class="form-input" disabled>
                                                <option value="">${I18n.t('pickups.select')}</option>
                                                <option value="cash">${I18n.t('pickups.cash')}</option>
                                                <option value="mobile_money">${I18n.t('pickups.mobile_money')}</option>
                                                <option value="bank_transfer">${I18n.t('pickups.bank_transfer')}</option>
                                                <option value="card">${I18n.t('pickups.card')}</option>
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label">${I18n.t('pickups.reference')}</label>
                                            <input type="text" id="paymentReference" class="form-input" 
                                                placeholder="${I18n.t('pickups.ref_placeholder')}" disabled />
                                        </div>
                                    </div>
                                </div>

                                <!-- Signature -->
                                <h4 class="section-title mt-md">${I18n.t('pickups.signature')}</h4>
                                <div class="signature-container">
                                    <canvas id="signatureCanvas" width="400" height="150"></canvas>
                                </div>
                                <div class="signature-actions">
                                    <button id="clearSignature" class="btn btn-sm btn-outline" disabled>
                                        ${Icons.get('x', {size:14})} ${I18n.t('pickups.clear')}
                                    </button>
                                </div>
                                
                                <!-- Photo -->
                                <h4 class="section-title mt-md">${I18n.t('pickups.proof_photo')}</h4>
                                <div class="photo-upload-row">
                                    <input type="file" id="photoInput" accept="image/*" style="display: none;" />
                                    <button id="takePhoto" class="btn btn-outline" disabled>
                                        ${Icons.get('camera', {size:16})} ${I18n.t('pickups.add_photo')}
                                    </button>
                                    <div id="photoPreview" class="photo-preview-small" style="display: none;">
                                        <img id="photoImg" src="" alt="Preview" />
                                        <button id="removePhoto" class="btn-remove-photo">×</button>
                                    </div>
                                </div>
                                
                                <!-- Notes -->
                                <div class="form-group mt-md">
                                    <label class="form-label">${I18n.t('pickups.notes')}</label>
                                    <textarea id="pickupNotes" class="form-input" rows="2" 
                                        placeholder="${I18n.t('pickups.notes_placeholder')}" disabled></textarea>
                                </div>
                                
                                <!-- Actions -->
                                <div class="form-actions mt-md">
                                    <button id="cancelPickup" class="btn btn-outline" disabled>
                                        ${I18n.t('pickups.cancel')}
                                    </button>
                                    <button id="confirmPickup" class="btn btn-primary btn-lg" disabled>
                                        ${Icons.get('check', {size:18})} ${I18n.t('pickups.confirm_pickup')}
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
                emptyMessage: I18n.t('pickups.no_packages_awaiting'),
                columns: [
                    { key: 'tracking_number', label: I18n.t('pickups.tracking') },
                    { key: 'client_name', label: I18n.t('pickups.client') },
                    { key: 'client_phone', label: I18n.t('pickups.phone') },
                    { key: 'description', label: I18n.t('pickups.description') },
                    { 
                        key: 'status', 
                        label: I18n.t('pickups.status'),
                        render: (val) => this.getStatusBadge(val)
                    },
                    { 
                        key: 'remaining', 
                        label: I18n.t('pickups.remaining_pay'),
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
                `<p class="text-danger">${I18n.t('pickups.load_error')}</p>`;
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
            errorDiv.textContent = error.message || I18n.t('pickups.not_found');
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
        document.getElementById('pkg-arrived').value = pkg.updated_at ? new Date(pkg.updated_at).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US') : '';
        
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
            Toast.error(I18n.t('pickups.select_image'));
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            Toast.error(I18n.t('pickups.image_too_large'));
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
        
        document.getElementById('formStatus').textContent = I18n.t('pickups.no_package_selected');
        document.getElementById('formStatus').className = 'badge badge-secondary';
        
        // Vider les inputs de recherche
        document.getElementById('scanInput').value = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('searchError').style.display = 'none';
    },

    async confirmPickup(btn = null) {
        if (!this.currentPackage) {
            Toast.error(I18n.t('pickups.no_package_error'));
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
                Toast.error(I18n.t('pickups.proxy_fields_required'));
                return;
            }
        }
        
        // Valider paiement
        const paymentFields = document.getElementById('paymentFields');
        if (paymentFields.style.display !== 'none') {
            const paymentMethod = document.getElementById('paymentMethod').value;
            if (!paymentMethod) {
                Toast.error(I18n.t('pickups.select_payment_method'));
                return;
            }
        }
        
        // Valider signature
        if (this.isCanvasBlank()) {
            Toast.error(I18n.t('pickups.sign_required'));
            return;
        }
        
        if (!confirm(I18n.t('pickups.confirm_pickup_msg'))) return;
        
        try {
            if (!btn) btn = document.getElementById('confirmPickup');
            Loader.button(btn, true, { text: I18n.t('pickups.validating') });
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
            
            Toast.success(I18n.t('pickups.pickup_success'));
            
            // Proposer d'imprimer le reçu
            const pickupData = {
                pickup_number: result.pickup?.id ? `RET-${result.pickup.id.substring(0, 8).toUpperCase()}` : `RET-${Date.now()}`,
                date: new Date().toLocaleString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US'),
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
                title: I18n.t('pickups.pickup_confirmed'),
                message: I18n.t('pickups.print_receipt_msg')
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
            Toast.error(error.message || I18n.t('pickups.pickup_error'));
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
                        placeholder="${I18n.t('pickups.history_search_placeholder')}" />
                </div>
                <div id="historyList" class="history-list"></div>
                <div id="historyLoader" class="text-center py-md" style="display: none;">
                    <span class="text-muted">${I18n.t('pickups.history_loading')}</span>
                </div>
                <div id="historyLoadMore" class="text-center py-md" style="display: none;">
                    <button id="btnLoadMore" class="btn btn-outline">
                        ${I18n.t('pickups.load_more')}
                    </button>
                </div>
                <div id="historyEmpty" class="text-center py-md text-muted" style="display: none;">
                    ${I18n.t('pickups.no_pickups_found')}
                </div>
            </div>
        `;
        
        Modal.open({
            title: I18n.t('pickups.history_title'),
            size: 'lg',
            content: content,
            footer: `<button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('pickups.close')}</button>`
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
            Toast.error(I18n.t('pickups.load_error'));
        }
    },
    
    renderHistoryItem(p) {
        return `
            <div class="history-item">
                <div class="history-row">
                    <div class="history-main">
                        <strong>${p.package?.tracking_number || 'N/A'}</strong>
                        <span class="badge ${p.pickup_by === 'proxy' ? 'badge-warning' : 'badge-success'}">
                            ${p.pickup_by === 'proxy' ? I18n.t('pickups.proxy_label') : I18n.t('pickups.client_label')}
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
                            ${new Date(p.picked_up_at).toLocaleString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US')}
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
                            ${I18n.t('pickups.proxy_for')} ${p.proxy_name} (${p.proxy_phone})
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
            Toast.error(I18n.t('pickups.pickup_not_found'));
            return;
        }
        
        const printData = {
            pickup_number: `RET-${pickup.id.substring(0, 8).toUpperCase()}`,
            date: new Date(pickup.picked_up_at).toLocaleString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US'),
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
            'cash': I18n.t('pickups.cash'),
            'mobile_money': I18n.t('pickups.mobile_money'),
            'bank': I18n.t('pickups.bank_transfer'),
            'card': I18n.t('pickups.card'),
            'prepaid': I18n.t('pickups.prepaid')
        };
        return labels[method] || method || 'N/A';
    },
    
    getStatusBadge(status) {
        const map = {
            'arrived_port': { label: I18n.t('pickups.status_arrived'), class: 'badge-info' },
            'customs': { label: I18n.t('pickups.status_customs'), class: 'badge-warning' },
            'out_for_delivery': { label: I18n.t('pickups.status_ready'), class: 'badge-success' }
        };
        const s = map[status] || { label: status, class: 'badge-secondary' };
        return `<span class="badge ${s.class}">${s.label}</span>`;
    },
    
    getStatusLabel(status) {
        const map = {
            'pending': I18n.t('pickups.status_pending'),
            'received': I18n.t('pickups.status_received'),
            'in_transit': I18n.t('pickups.status_in_transit'),
            'arrived_port': I18n.t('pickups.status_arrived_port'),
            'customs': I18n.t('pickups.status_customs_full'),
            'out_for_delivery': I18n.t('pickups.status_out_delivery'),
            'delivered': I18n.t('pickups.status_delivered')
        };
        return map[status] || status;
    },
    
    formatAmount(amount) {
        return new Intl.NumberFormat(I18n.locale === 'fr' ? 'fr-FR' : 'en-US').format(amount || 0);
    }
};
