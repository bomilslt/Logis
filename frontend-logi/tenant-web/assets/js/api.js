/**
 * API Service - Admin
 * Toutes les methodes necessaires pour remplacer les mock data
 */

const API = {
    baseURL: CONFIG.API_URL,
    tenantId: CONFIG.TENANT_ID,

    _csrfToken: null,
    get csrfToken() {
        if (!this._csrfToken) {
            this._csrfToken = sessionStorage.getItem('csrf_token');
        }
        return this._csrfToken;
    },
    set csrfToken(token) {
        this._csrfToken = token;
        if (token) {
            sessionStorage.setItem('csrf_token', token);
        } else {
            sessionStorage.removeItem('csrf_token');
        }
    },

    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_URL}${endpoint}`;
        const token = Store.getToken();
        
        const headers = {
            'Content-Type': 'application/json',
            'X-Tenant-ID': CONFIG.TENANT_ID,
            'X-App-Type': 'admin',
            'X-App-Channel': 'web_admin',
            ...options.headers
        };

        if (token && CONFIG.AUTH_MODE !== 'cookie') {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const method = (options.method || 'GET').toUpperCase();
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && this.csrfToken) {
            headers['X-CSRF-Token'] = this.csrfToken;
        }

        // Pour FormData (upload fichiers), ne pas mettre Content-Type
        if (options.body instanceof FormData) {
            delete headers['Content-Type'];
        }
        
        try {
            const response = await fetch(url, { ...options, headers, credentials: 'include' });

            // CSRF retry
            if (response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData && typeof errorData.error === 'string' && errorData.error.includes('CSRF')) {
                    const ok = await this.refreshCsrfToken();
                    if (ok) {
                        const retryHeaders = {
                            ...headers,
                            'X-CSRF-Token': this.csrfToken
                        };
                        const retryResponse = await fetch(url, { ...options, headers: retryHeaders, credentials: 'include' });
                        return await retryResponse.json();
                    }
                }
                throw new Error(errorData.error || 'Accès refusé');
            }

            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401 && (token || CONFIG.AUTH_MODE === 'cookie')) {
                    if (endpoint === '/auth/admin/login') {
                        throw new Error(data.error || 'Une erreur est survenue');
                    }
                    const refreshed = await this.refreshToken();
                    if (refreshed) {
                        if (CONFIG.AUTH_MODE !== 'cookie') {
                            headers['Authorization'] = `Bearer ${Store.getToken()}`;
                        }
                        if (this.csrfToken) {
                            headers['X-CSRF-Token'] = this.csrfToken;
                        }
                        const retryResponse = await fetch(url, { ...options, headers, credentials: 'include' });
                        return await retryResponse.json();
                    } else {
                        Store.logout();
                        Router.navigate('/login');
                    }
                }
                throw new Error(data.error || 'Une erreur est survenue');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    
    // Méthode pour upload de fichiers (FormData)
    async upload(endpoint, formData) {
        return this.request(endpoint, {
            method: 'POST',
            body: formData
        });
    },
    
    // Méthode POST simplifiée
    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    
    async refreshToken() {
        if (CONFIG.AUTH_MODE === 'cookie') {
            try {
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': CONFIG.TENANT_ID,
                    'X-App-Type': 'admin',
                    'X-App-Channel': 'web_admin'
                };
                if (this.csrfToken) {
                    headers['X-CSRF-Token'] = this.csrfToken;
                }

                const response = await fetch(`${CONFIG.API_URL}/auth/refresh`, {
                    method: 'POST',
                    headers,
                    credentials: 'include'
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.csrf_token) {
                        this.csrfToken = data.csrf_token;
                    }
                    return true;
                }

                if (response.status === 403) {
                    const errorData = await response.json().catch(() => ({}));
                    if (errorData && typeof errorData.error === 'string' && errorData.error.includes('CSRF')) {
                        const ok = await this.refreshCsrfToken();
                        if (!ok) return false;

                        const retryHeaders = {
                            ...headers,
                            'X-CSRF-Token': this.csrfToken
                        };

                        const retryResponse = await fetch(`${CONFIG.API_URL}/auth/refresh`, {
                            method: 'POST',
                            headers: retryHeaders,
                            credentials: 'include'
                        });

                        if (retryResponse.ok) {
                            const data = await retryResponse.json();
                            if (data.csrf_token) {
                                this.csrfToken = data.csrf_token;
                            }
                            return true;
                        }
                    }
                }
                return false;
            } catch {
                return false;
            }
        }

        const refreshToken = Store.getRefreshToken();
        if (!refreshToken) return false;
        
        try {
            const response = await fetch(`${CONFIG.API_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': CONFIG.TENANT_ID,
                    'X-App-Channel': 'web_admin',
                    'Authorization': `Bearer ${refreshToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                Store.setToken(data.access_token);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    },

    async refreshCsrfToken() {
        try {
            const response = await fetch(`${this.baseURL}/auth/csrf-token`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': this.tenantId,
                    'X-App-Type': 'admin',
                    'X-App-Channel': 'web_admin'
                },
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                this.csrfToken = data.csrf_token;
                return true;
            }
        } catch {
            return false;
        }
        return false;
    },
    
    // ============================================
    // AUTH
    // ============================================
    auth: {
        login: async (email, password) => {
            const result = await API.request('/auth/admin/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            if (result.csrf_token) {
                API.csrfToken = result.csrf_token;
            }
            return result;
        },
        logout: async () => {
            try {
                await API.request('/auth/logout', { method: 'POST' });
            } catch {
                // ignore
            }
            API.csrfToken = null;
            Store.logout();
        },
        getProfile: () => API.request('/auth/me'),
        updateProfile: (data) => API.request('/auth/me', {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        changePassword: (currentPassword, newPassword) => API.request('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
        })
    },
    
    // ============================================
    // DASHBOARD
    // ============================================
    dashboard: {
        getStats: () => API.request('/admin/dashboard/stats'),
        getRecentPackages: (limit = 5) => API.request(`/admin/dashboard/recent-packages?limit=${limit}`),
        getRecentActivity: (limit = 10) => API.request(`/admin/dashboard/activity?limit=${limit}`)
    },
    
    // ============================================
    // PACKAGES
    // ============================================
    packages: {
        getAll: (params = {}) => {
            // Filtrer les valeurs undefined/null/vides
            const cleanParams = {};
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null && value !== '') {
                    cleanParams[key] = value;
                }
            }
            const query = new URLSearchParams(cleanParams).toString();
            return API.request(`/admin/packages${query ? '?' + query : ''}`);
        },
        getById: (id) => API.request(`/admin/packages/${id}`),
        
        // Recherche par tracking (pour scanner)
        findByTracking: (code) => API.request(`/admin/packages/find?tracking=${encodeURIComponent(code)}`),
        
        // Creer un colis (reception manuelle)
        create: (data) => API.request('/admin/packages', {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        
        // Recevoir un colis (changer status a 'received')
        receive: (id, data = {}) => API.request(`/admin/packages/${id}/receive`, {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        
        // Mise a jour statut simple
        updateStatus: (id, data) => API.request(`/admin/packages/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify(data) // { status, location, notes, notify }
        }),
        
        // Mise a jour statut en masse
        bulkUpdateStatus: (ids, data) => API.request('/admin/packages/bulk-status', {
            method: 'PUT',
            body: JSON.stringify({ ids, ...data }) // { ids[], status, location, notes, notify }
        }),
        
        // Confirmer livraison avec rapport
        confirmDelivery: (id, formData) => API.request(`/admin/packages/${id}/deliver`, {
            method: 'POST',
            body: formData // FormData avec photo
        }),
        
        delete: (id) => API.request(`/admin/packages/${id}`, { method: 'DELETE' }),
        getStats: () => API.request('/admin/packages/stats')
    },
    
    // ============================================
    // CLIENTS
    // ============================================
    // CLIENTS
    // ============================================
    clients: {
        getAll: (params = {}) => {
            // Filtrer les valeurs undefined/null/vides
            const cleanParams = {};
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null && value !== '') {
                    cleanParams[key] = value;
                }
            }
            const query = new URLSearchParams(cleanParams).toString();
            return API.request(`/admin/clients${query ? '?' + query : ''}`);
        },
        getById: (id) => API.request(`/admin/clients/${id}`),
        // Inclut: packages[], payments[], stats
        
        create: (data) => API.request('/admin/clients', {
            method: 'POST',
            body: JSON.stringify(data)
        }),
        update: (id, data) => API.request(`/admin/clients/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        toggleActive: (id) => API.request(`/admin/clients/${id}/toggle-active`, { method: 'POST' })
    },
    
    // ============================================
    // PAYMENTS
    // ============================================
    payments: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.request(`/admin/payments${query ? '?' + query : ''}`);
        },
        getById: (id) => API.request(`/admin/payments/${id}`),
        create: (data) => API.request('/admin/payments', {
            method: 'POST',
            body: JSON.stringify(data) // { client_id, amount, method, reference, package_ids[], notes }
        }),
        confirm: (id) => API.request(`/admin/payments/${id}/confirm`, { method: 'POST' }),
        cancel: (id) => API.request(`/admin/payments/${id}/cancel`, { method: 'POST' }),
        getStats: () => API.request('/admin/payments/stats'),
        getByClient: (clientId) => API.request(`/admin/clients/${clientId}/payments`)
    },
    
    // ============================================
    // INVOICES
    // ============================================
    invoices: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.request(`/admin/invoices${query ? '?' + query : ''}`);
        },
        getById: (id) => API.request(`/admin/invoices/${id}`),
        create: (data) => API.request('/admin/invoices', {
            method: 'POST',
            body: JSON.stringify(data) // { client_id, package_id?, description, amount, currency, due_date, notes }
        }),
        update: (id, data) => API.request(`/admin/invoices/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data) // { description, amount, currency, due_date, notes }
        }),
        send: (id) => API.request(`/admin/invoices/${id}/send`, { method: 'POST' }),
        markPaid: (id) => API.request(`/admin/invoices/${id}/paid`, { method: 'POST' }),
        cancel: (id) => API.request(`/admin/invoices/${id}/cancel`, { method: 'POST' })
    },
    
    // ============================================
    // FINANCE
    // ============================================
    finance: {
        getStats: (params = {}) => {
            // Accepte soit une string (période) soit un objet de paramètres
            if (typeof params === 'string') {
                params = { period: params };
            }
            const query = new URLSearchParams(params).toString();
            return API.request(`/admin/finance/stats${query ? '?' + query : ''}`);
        },
        getTransactions: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.request(`/admin/finance/transactions${query ? '?' + query : ''}`);
        },
        export: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.request(`/admin/finance/export${query ? '?' + query : ''}`);
        }
    },
    
    // ============================================
    // ACCOUNTING (Comptabilité complète)
    // ============================================
    accounting: {
        // Récupérer toutes les données comptables d'une période
        getData: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.request(`/admin/accounting${query ? '?' + query : ''}`);
        },
        
        // Dépenses de départ
        getDepartureExpenses: (departureId) => API.request(`/admin/departures/${departureId}/expenses`),
        addDepartureExpense: (departureId, data) => API.request(`/admin/departures/${departureId}/expenses`, {
            method: 'POST',
            body: JSON.stringify(data) // { category, description, amount, date, reference, notes }
        }),
        deleteDepartureExpense: (expenseId) => API.request(`/admin/expenses/departure/${expenseId}`, { method: 'DELETE' }),
        
        // Salaires
        getSalaries: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.request(`/admin/salaries${query ? '?' + query : ''}`);
        },
        addSalary: (data) => API.request('/admin/salaries', {
            method: 'POST',
            body: JSON.stringify(data) // { employee_id, period_month, period_year, base_salary, bonus, deductions, paid_date, payment_method, reference, notes }
        }),
        deleteSalary: (salaryId) => API.request(`/admin/salaries/${salaryId}`, { method: 'DELETE' }),
        
        // Charges diverses
        getExpenses: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.request(`/admin/expenses${query ? '?' + query : ''}`);
        },
        addExpense: (data) => API.request('/admin/expenses', {
            method: 'POST',
            body: JSON.stringify(data) // { category, description, amount, date, is_recurring, recurrence_type, reference, notes }
        }),
        deleteExpense: (expenseId) => API.request(`/admin/expenses/${expenseId}`, { method: 'DELETE' }),
        
        // Autres revenus
        getOtherIncomes: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.request(`/admin/other-incomes${query ? '?' + query : ''}`);
        },
        addOtherIncome: (data) => API.request('/admin/other-incomes', {
            method: 'POST',
            body: JSON.stringify(data) // { income_type, description, amount, date, reference, notes }
        }),
        deleteOtherIncome: (incomeId) => API.request(`/admin/other-incomes/${incomeId}`, { method: 'DELETE' })
    },
    
    // ============================================
    // ANNOUNCEMENTS
    // ============================================
    announcements: {
        getAll: () => API.request('/admin/announcements'),
        create: (data) => API.request('/admin/announcements', {
            method: 'POST',
            body: JSON.stringify(data) // { title, content, active }
        }),
        update: (id, data) => API.request(`/admin/announcements/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        delete: (id) => API.request(`/admin/announcements/${id}`, { method: 'DELETE' }),
        toggleActive: (id) => API.request(`/admin/announcements/${id}/toggle`, { method: 'POST' })
    },
    
    // ============================================
    // STAFF
    // ============================================
    staff: {
        getAll: () => API.request('/admin/staff'),
        getById: (id) => API.request(`/admin/staff/${id}`),
        getPermissions: (id) => API.request(`/admin/staff/${id}/permissions`),
        create: (data) => API.request('/admin/staff', {
            method: 'POST',
            body: JSON.stringify(data) // { first_name, last_name, email, password, role }
        }),
        update: (id, data) => API.request(`/admin/staff/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        updatePermissions: (id, permissions) => API.request(`/admin/staff/${id}/permissions`, {
            method: 'PUT',
            body: JSON.stringify({ permissions }) // { permissions: [] }
        }),
        toggleActive: (id) => API.request(`/admin/staff/${id}/toggle-active`, { method: 'POST' }),
        resetPassword: (id) => API.request(`/admin/staff/${id}/reset-password`, { method: 'POST' })
    },
    
    // ============================================
    // SETTINGS (Tarifs, Entrepots, Config)
    // ============================================
    settings: {
        get: () => API.request('/admin/settings'),
        update: (data) => API.request('/admin/settings', {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        
        // Moyens de paiement (public endpoint)
        getPaymentMethods: () => fetch(`${CONFIG.API_URL}/config/tenant/${CONFIG.TENANT_ID}/payment-methods`)
            .then(r => r.json())
            .then(data => data.payment_methods || []),
        
        // Tarifs - tous les tarifs d'un coup
        getRates: () => API.request('/admin/settings/rates'),
        updateRates: (data) => API.request('/admin/settings/rates', {
            method: 'PUT',
            body: JSON.stringify(data) // { origins, destinations, shipping_rates }
        }),
        // Tarifs par pays specifique
        updateCountryRates: (country, rates) => API.request(`/admin/settings/rates/${country}`, {
            method: 'PUT',
            body: JSON.stringify(rates)
        }),
        
        // Entrepots
        getWarehouses: () => API.request('/admin/settings/warehouses'),
        createWarehouse: (data) => API.request('/admin/settings/warehouses', {
            method: 'POST',
            body: JSON.stringify(data) // { country, name, address }
        }),
        updateWarehouse: (id, data) => API.request(`/admin/settings/warehouses/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        deleteWarehouse: (id) => API.request(`/admin/settings/warehouses/${id}`, { method: 'DELETE' }),
        
        // SMS Config
        updateSMSConfig: (provider, config) => API.request('/admin/settings/sms', {
            method: 'PUT',
            body: JSON.stringify({ provider, config })
        }),
        
        // WhatsApp Config
        updateWhatsAppConfig: (provider, config) => API.request('/admin/settings/whatsapp', {
            method: 'PUT',
            body: JSON.stringify({ provider, config })
        }),
        
        // Email Config
        updateEmailConfig: (provider, config) => API.request('/admin/settings/email', {
            method: 'PUT',
            body: JSON.stringify({ provider, config }) // { provider: 'sendgrid'|'mailgun'|'smtp', config: { api_key, from_email, from_name } }
        }),
        
        // Message Templates
        getTemplates: () => API.request('/admin/settings/templates'),
        updateTemplate: (key, data) => API.request(`/admin/settings/templates/${key}`, {
            method: 'PUT',
            body: JSON.stringify(data) // { sms, whatsapp, email }
        })
    },
    
    // ============================================
    // NOTIFICATIONS (envoi aux clients)
    // ============================================
    notifications: {
        send: (data) => API.request('/admin/notifications/send', {
            method: 'POST',
            body: JSON.stringify(data) // { client_id, title, message, type, channels: ['push', 'sms', 'whatsapp', 'email'] }
        }),
        sendBulk: (data) => API.request('/admin/notifications/send-bulk', {
            method: 'POST',
            body: JSON.stringify(data) // { client_ids[], title, message, type, channels }
        }),
        // Envoyer SMS direct
        sendSMS: (data) => API.request('/admin/notifications/sms', {
            method: 'POST',
            body: JSON.stringify(data) // { phone, message }
        }),
        // Envoyer WhatsApp direct
        sendWhatsApp: (data) => API.request('/admin/notifications/whatsapp', {
            method: 'POST',
            body: JSON.stringify(data) // { phone, message, template? }
        }),
        // Envoyer Email direct
        sendEmail: (data) => API.request('/admin/notifications/email', {
            method: 'POST',
            body: JSON.stringify(data) // { email, subject, message }
        }),
        // Test notification
        sendTest: (data) => API.request('/admin/notifications/test', {
            method: 'POST',
            body: JSON.stringify(data) // { channel: 'sms'|'whatsapp'|'email', recipient, message? }
        })
    },
    
    // ============================================
    // DEPARTURES (Departs programmes)
    // ============================================
    departures: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.request(`/admin/departures${query ? '?' + query : ''}`);
        },
        getById: (id) => API.request(`/admin/departures/${id}`),
        create: (data) => API.request('/admin/departures', {
            method: 'POST',
            body: JSON.stringify(data) // { origin_country, origin_city, dest_country, transport_mode, departure_date, estimated_duration, notes, auto_assign }
        }),
        update: (id, data) => API.request(`/admin/departures/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        delete: (id) => API.request(`/admin/departures/${id}`, { method: 'DELETE' }),
        // Marquer comme parti (met aussi les colis en transit)
        markDeparted: (id) => API.request(`/admin/departures/${id}/depart`, { method: 'POST' }),
        // Marquer comme arrive (met les colis en arrived_port)
        markArrived: (id) => API.request(`/admin/departures/${id}/arrive`, { method: 'POST' }),
        // Annuler un depart
        cancel: (id) => API.request(`/admin/departures/${id}/cancel`, { method: 'POST' }),
        // Notifier les clients
        notify: (id, data) => API.request(`/admin/departures/${id}/notify`, {
            method: 'POST',
            body: JSON.stringify(data) // { message?, target: 'with_packages'|'active_30'|'all' }
        }),
        // Obtenir les colis associes a ce depart
        getPackages: (id) => API.request(`/admin/departures/${id}/packages`),
        // Associer des colis a un depart
        assignPackages: (id, packageIds) => API.request(`/admin/departures/${id}/packages`, {
            method: 'POST',
            body: JSON.stringify({ package_ids: packageIds })
        }),
        // Retirer un colis d'un depart
        removePackage: (departureId, packageId) => API.request(`/admin/departures/${departureId}/packages/${packageId}`, {
            method: 'DELETE'
        }),
        
        // Transporteur / Carrier
        assignCarrier: (id, data) => API.request(`/admin/departures/${id}/carrier`, {
            method: 'PUT',
            body: JSON.stringify(data) // { carrier, carrier_tracking, notify_clients }
        }),
        removeCarrier: (id) => API.request(`/admin/departures/${id}/carrier`, { method: 'DELETE' }),
        getCarrierHistory: (id) => API.request(`/admin/departures/${id}/carrier-history`),
        refreshTracking: (id) => API.request(`/admin/departures/${id}/refresh-tracking`, { method: 'POST' })
    },
    
    // ============================================
    // NOTIFICATION SETTINGS (SMS/WhatsApp config)
    // ============================================
    notificationSettings: {
        get: () => API.request('/admin/settings/notifications'),
        update: (data) => API.request('/admin/settings/notifications', {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        // Récupérer tous les canaux avec leurs stats
        getChannels: () => API.request('/admin/settings/notifications/channels'),
        // Mettre à jour les canaux et types de notifications
        updateChannels: (data) => API.request('/admin/settings/notifications/channels', {
            method: 'PUT',
            body: JSON.stringify(data) // { channels: {...}, notification_types: {...} }
        }),
        // Configuration d'un canal (SMS, WhatsApp, etc.)
        updateChannel: (channelId, config) => API.request(`/admin/settings/notifications/channels/${channelId}`, {
            method: 'PUT',
            body: JSON.stringify(config)
        }),
        // Templates de messages
        getTemplates: () => API.request('/admin/settings/notifications/templates'),
        updateTemplate: (templateId, data) => API.request(`/admin/settings/notifications/templates/${templateId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        // Test d'envoi
        sendTest: (data) => API.request('/admin/settings/notifications/test', {
            method: 'POST',
            body: JSON.stringify(data) // { channel: 'sms'|'whatsapp'|'email', recipient, message? }
        })
    },
    
    // ============================================
    // PICKUPS (Retraits de colis)
    // ============================================
    pickups: {
        search: (query) => API.post('/pickups/search', { query }),
        process: (data) => API.post('/pickups/process', data),
        uploadSignature: (signature) => API.post('/pickups/upload-signature', { signature }),
        uploadPhoto: (formData) => API.upload('/pickups/upload-photo', formData),
        getHistory: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.request(`/pickups/history${query ? '?' + query : ''}`);
        },
        getById: (id) => API.request(`/pickups/${id}`)
    },
    
    // ============================================
    // PAYMENT PROVIDERS (Config paiement en ligne)
    // ============================================
    paymentProviders: {
        getAll: () => API.request('/admin/payment-providers'),
        getTemplates: () => API.request('/admin/payment-providers/templates'),
        getEnabled: () => API.request('/admin/payment-providers/enabled'),
        configure: (providerCode, data) => API.request(`/admin/payment-providers/${providerCode}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        }),
        toggle: (providerCode) => API.request(`/admin/payment-providers/${providerCode}/toggle`, {
            method: 'POST'
        }),
        delete: (providerCode) => API.request(`/admin/payment-providers/${providerCode}`, {
            method: 'DELETE'
        })
    },
    
    // ============================================
    // EXPORTS (PDF et Excel)
    // ============================================
    exports: {
        // PDF Facture (A4)
        invoicePDF: (invoiceId) => API.downloadFile(`/admin/exports/invoice/${invoiceId}/pdf`),
        
        // PDF Étiquette colis
        packageLabel: (packageId) => API.downloadFile(`/admin/exports/package/${packageId}/label`),
        
        // PDF Reçu paiement (A4)
        paymentReceipt: (paymentId) => API.downloadFile(`/admin/exports/payment/${paymentId}/receipt`),
        
        // Ticket paiement (80mm)
        paymentTicket: (paymentId) => API.downloadFile(`/admin/exports/payment/${paymentId}/ticket`),
        
        // PDF Reçu retrait (A4)
        pickupReceipt: (pickupId) => API.downloadFile(`/admin/exports/pickup/${pickupId}/receipt`),
        
        // Ticket retrait (80mm)
        pickupTicket: (pickupId) => API.downloadFile(`/admin/exports/pickup/${pickupId}/ticket`),
        
        // PDF Rapport statistiques
        statisticsReport: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.downloadFile(`/admin/exports/reports/statistics${query ? '?' + query : ''}`);
        },
        
        // Excel Colis
        packagesExcel: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.downloadFile(`/admin/exports/packages/excel${query ? '?' + query : ''}`);
        },
        
        // Excel Factures
        invoicesExcel: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.downloadFile(`/admin/exports/invoices/excel${query ? '?' + query : ''}`);
        },
        
        // Excel Départs
        departuresExcel: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return API.downloadFile(`/admin/exports/departures/excel${query ? '?' + query : ''}`);
        }
    }
};

// Méthode pour télécharger un fichier (PDF, Excel)
API.downloadFile = async function(endpoint) {
    const url = `${CONFIG.API_URL}${endpoint}`;
    const token = Store.getToken();
    
    const headers = {
        'X-Tenant-ID': CONFIG.TENANT_ID,
        'X-App-Type': 'admin',
        'X-App-Channel': 'web_admin'
    };
    
    if (token && CONFIG.AUTH_MODE !== 'cookie') {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(url, { headers, credentials: 'include' });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Erreur de téléchargement');
        }
        
        // Récupérer le nom du fichier depuis les headers
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'export';
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^"]+)"?/);
            if (match) filename = match[1];
        }
        
        // Télécharger le fichier
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        return { success: true, filename };
    } catch (error) {
        console.error('Download error:', error);
        throw error;
    }
};
