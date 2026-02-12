# Guide d'Integration API - Tenant Admin

Ce document liste tous les blocs de mock data a remplacer par des appels API reels.

## Structure des Appels API

Tous les appels passent par `API.request()` qui:
- Ajoute automatiquement le header `X-Tenant-ID`
- Ajoute le token JWT si connecte
- Gere le refresh token automatiquement
- Gere les erreurs

## Vues et Mock Data a Remplacer

### 1. LOGIN (`views/login/login.js`)

```javascript
// AVANT (mock)
Store.login({
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    user: { id: 'admin-1', email, first_name: 'Admin', last_name: 'User', role: 'admin' }
});

// APRES (API)
try {
    const result = await API.auth.login(email, password);
    Store.login(result);
    Router.navigate('/dashboard');
} catch (error) {
    Toast.error(error.message);
}
```

---

### 2. DASHBOARD (`views/dashboard/dashboard.js`)

```javascript
// AVANT (mock)
const stats = { packages: {...}, clients: {...}, revenue: {...}, today: {...} };
const recentPackages = [...];
const recentActivity = [...];

// APRES (API)
const [stats, recentPackages, recentActivity] = await Promise.all([
    API.dashboard.getStats(),
    API.dashboard.getRecentPackages(5),
    API.dashboard.getRecentActivity(5)
]);
```

**Endpoint attendu:** `GET /admin/dashboard/stats`
```json
{
    "packages": { "total": 156, "pending": 23, "received": 18, "in_transit": 45, "customs": 12, "delivered": 58 },
    "clients": { "total": 42, "active": 38, "new_this_month": 5 },
    "revenue": { "month": 4250000, "prev_month": 3800000, "year": 48500000, "pending": 850000 },
    "today": { "received": 8, "status_updates": 24, "deliveries": 3 }
}
```

---

### 3. PACKAGES (`views/packages/packages.js`)

#### Liste des colis
```javascript
// AVANT (mock)
const packages = [{ id: 'pkg-001', tracking: '...', ... }];

// APRES (API)
const packages = await API.packages.getAll(this.filters);
```

#### Scanner - Recherche par tracking
```javascript
// AVANT (mock)
const found = mockPendingPackages.find(p => p.supplier_tracking === code);

// APRES (API)
const result = await API.packages.findByTracking(code);
// result = { found: true, package: {...} } ou { found: false }
```

#### Scanner - Reception automatique
```javascript
// AVANT (mock)
this.receivedCount++;

// APRES (API)
await API.packages.receive(pkg.id, { location: 'Entrepot Chine' });
```

#### Scanner - Creation manuelle
```javascript
// AVANT (mock)
this.receivedCount++;

// APRES (API)
await API.packages.create({
    supplier_tracking: tracking,
    client_name: clientName,
    client_phone: clientPhone,
    description: desc,
    transport_mode: transport,
    package_type: type,
    weight: weight,
    quantity: qty,
    status: 'received'
});
```

#### Mise a jour statut en masse
```javascript
// AVANT (mock)
Toast.success(`${this.selectedIds.size} colis mis a jour`);

// APRES (API)
await API.packages.bulkUpdateStatus(
    Array.from(this.selectedIds),
    { status: newStatus, location, notes, notify }
);
```

---

### 4. PACKAGE DETAIL (`views/package-detail/package-detail.js`)

```javascript
// AVANT (mock)
const pkg = { id: packageId, tracking: 'EC-2024-00001', ... };

// APRES (API)
const pkg = await API.packages.getById(packageId);
```

#### Mise a jour statut
```javascript
// APRES (API)
await API.packages.updateStatus(pkg.id, { status: newStatus, location, notes, notify });
```

#### Rapport de livraison
```javascript
// APRES (API)
const formData = new FormData();
formData.append('receiver', receiver);
formData.append('notes', notes);
if (photoInput.files[0]) formData.append('photo', photoInput.files[0]);
await API.packages.confirmDelivery(pkg.id, formData);
```

---

### 5. CLIENTS (`views/clients/clients.js`)

```javascript
// AVANT (mock)
const clients = [{ id: 'c1', name: 'Marie Fotso', ... }];

// APRES (API)
const clients = await API.clients.getAll();
```

---

### 6. CLIENT DETAIL (`views/client-detail/client-detail.js`)

```javascript
// AVANT (mock)
const client = { id: clientId, first_name: 'Marie', packages: [...], payments: [...] };

// APRES (API)
const client = await API.clients.getById(clientId);
// L'API doit retourner: infos client + packages[] + payments[] + stats
```

#### Enregistrer paiement
```javascript
// APRES (API)
await API.payments.create({
    client_id: client.id,
    amount: amount,
    method: method,
    reference: reference,
    package_ids: selectedPackageIds,
    notes: notes
});
```

---

### 7. INVOICES (`views/invoices/invoices.js`)

```javascript
// AVANT (mock)
const invoices = [{ id: 'INV-001', client: 'Marie Fotso', ... }];

// APRES (API)
const invoices = await API.invoices.getAll();
```

#### Creer facture
```javascript
await API.invoices.create({ client_id, package_id, description, amount, currency, notes });
```

#### Marquer payee
```javascript
await API.invoices.markPaid(invoiceId);
```

---

### 8. FINANCE (`views/finance/finance.js`)

```javascript
// AVANT (mock)
const stats = { revenue_month: 4250000, ... };
const recentTransactions = [...];

// APRES (API)
const [stats, transactions] = await Promise.all([
    API.finance.getStats('month'),
    API.finance.getTransactions({ limit: 10 })
]);
```

---

### 9. ANNOUNCEMENTS (`views/announcements/announcements.js`)

```javascript
// AVANT (mock)
const announcements = [{ id: 1, title: '...', ... }];

// APRES (API)
const announcements = await API.announcements.getAll();
```

#### CRUD
```javascript
await API.announcements.create({ title, content, active });
await API.announcements.update(id, { title, content, active });
await API.announcements.delete(id);
```

---

### 10. STAFF (`views/staff/staff.js`)

```javascript
// AVANT (mock)
const staff = [{ id: 1, name: 'Admin Principal', ... }];

// APRES (API)
const staff = await API.staff.getAll();
```

#### CRUD
```javascript
await API.staff.create({ first_name, last_name, email, password, role });
await API.staff.update(id, { first_name, last_name, email, role });
await API.staff.updatePermissions(id, ['view_packages', 'update_status', ...]);
```

---

### 11. TARIFS (`views/tarifs/tarifs.js`)

```javascript
// AVANT (mock - valeurs en dur dans le HTML)

// APRES (API)
const rates = await API.settings.getRates();
// rates = { 'Cameroon': { sea: {...}, air_normal: {...}, air_express: {...} }, ... }

// Sauvegarder
await API.settings.updateRates('Cameroon', ratesData);
```

---

### 12. WAREHOUSES (`views/warehouses/warehouses.js`)

```javascript
// AVANT (mock)
const warehouses = { 'Cameroon': [...], 'Nigeria': [...] };

// APRES (API)
const warehouses = await API.settings.getWarehouses();
```

#### CRUD
```javascript
await API.settings.createWarehouse({ country, name, address });
await API.settings.updateWarehouse(id, { name, address });
await API.settings.deleteWarehouse(id);
```

---

### 13. SETTINGS (`views/settings/settings.js`)

```javascript
// AVANT (mock - valeurs en dur)

// APRES (API)
const settings = await API.settings.get();
// settings = { company_name, email, phone, address, ... }

await API.settings.update({ company_name, email, phone, address });
```

---

### 14. PROFILE (`views/profile/profile.js`)

```javascript
// AVANT (mock)
const user = Store.getUser();

// APRES (API)
const user = await API.auth.getProfile();

// Mise a jour
await API.auth.updateProfile({ first_name, last_name });

// Changer mot de passe
await API.auth.changePassword(currentPassword, newPassword);
```

---

## Endpoints Backend Requis

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/auth/admin/login` | Connexion admin |
| GET | `/auth/me` | Profil utilisateur |
| PUT | `/auth/me` | Modifier profil |
| POST | `/auth/change-password` | Changer mot de passe |
| GET | `/admin/dashboard/stats` | Stats dashboard |
| GET | `/admin/dashboard/recent-packages` | Colis recents |
| GET | `/admin/dashboard/activity` | Activite recente |
| GET | `/admin/packages` | Liste colis (filtres) |
| GET | `/admin/packages/:id` | Detail colis |
| GET | `/admin/packages/find?tracking=` | Recherche par tracking |
| POST | `/admin/packages` | Creer colis |
| POST | `/admin/packages/:id/receive` | Recevoir colis |
| PUT | `/admin/packages/:id/status` | Maj statut |
| PUT | `/admin/packages/bulk-status` | Maj statut en masse |
| POST | `/admin/packages/:id/deliver` | Confirmer livraison |
| GET | `/admin/clients` | Liste clients |
| GET | `/admin/clients/:id` | Detail client + packages + payments |
| POST | `/admin/clients` | Creer client |
| PUT | `/admin/clients/:id` | Modifier client |
| POST | `/admin/payments` | Enregistrer paiement |
| GET | `/admin/invoices` | Liste factures |
| POST | `/admin/invoices` | Creer facture |
| POST | `/admin/invoices/:id/paid` | Marquer payee |
| GET | `/admin/finance/stats` | Stats finances |
| GET | `/admin/finance/transactions` | Transactions |
| GET | `/admin/announcements` | Liste annonces |
| POST | `/admin/announcements` | Creer annonce |
| PUT | `/admin/announcements/:id` | Modifier annonce |
| DELETE | `/admin/announcements/:id` | Supprimer annonce |
| GET | `/admin/staff` | Liste employes |
| POST | `/admin/staff` | Creer employe |
| PUT | `/admin/staff/:id` | Modifier employe |
| PUT | `/admin/staff/:id/permissions` | Permissions |
| GET | `/admin/settings` | Parametres |
| PUT | `/admin/settings` | Modifier parametres |
| GET | `/admin/settings/rates` | Tarifs |
| PUT | `/admin/settings/rates/:country` | Modifier tarifs |
| GET | `/admin/settings/warehouses` | Entrepots |
| POST | `/admin/settings/warehouses` | Creer entrepot |
| PUT | `/admin/settings/warehouses/:id` | Modifier entrepot |
| DELETE | `/admin/settings/warehouses/:id` | Supprimer entrepot |

---

## Notes Importantes

1. **Tous les endpoints admin** doivent verifier:
   - Token JWT valide
   - Role admin ou staff avec permissions
   - X-Tenant-ID correspond au tenant de l'utilisateur

2. **Notifications clients**: Quand `notify: true` est passe, le backend doit:
   - Creer une notification dans la table `notifications`
   - Envoyer push notification si le client a un token FCM

3. **Upload photos**: Utiliser `FormData` pour les endpoints avec fichiers

4. **Pagination**: Les endpoints de liste supportent `?page=1&limit=20`

5. **Filtres packages**: `?status=pending&search=xxx&date_from=xxx&date_to=xxx`
