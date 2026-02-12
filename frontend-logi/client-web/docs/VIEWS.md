# Documentation des Vues - Express Cargo Client Web

Ce document decrit le comportement de chaque vue, les endpoints API utilises et les reponses attendues.

---

## Architecture

Chaque vue est composee de :
- `{view}.js` - Logique et rendu
- `{view}.css` - Styles specifiques

Les vues sont enregistrees dans le router et rendues dans `#main-content`.

---

## Authentification

### Login (`/login`)

**Fichiers:** `views/login/login.js`, `views/login/login.css`

**Comportement:**
1. Affiche le formulaire de connexion (email, mot de passe)
2. Toggle pour afficher/masquer le mot de passe
3. Soumet les credentials au backend
4. Stocke les tokens et user dans localStorage
5. Redirige vers `/dashboard`

**Endpoint:**
```
POST /api/auth/login
Headers: X-Tenant-ID: {tenant_id}
Body: { "email": "...", "password": "..." }
```

**Reponse attendue:**
```json
{
    "user": {
        "id": "uuid",
        "email": "user@example.com",
        "first_name": "Jean",
        "last_name": "Dupont",
        "full_name": "Jean Dupont",
        "role": "client",
        "phone": "+237...",
        "notify_email": true,
        "notify_sms": true,
        "notify_push": true
    },
    "access_token": "jwt_token",
    "refresh_token": "refresh_token"
}
```

---

### Register (`/register`)

**Fichiers:** `views/register/register.js`, `views/register/register.css`

**Comportement:**
1. Formulaire d'inscription (prenom, nom, email, telephone, mot de passe)
2. Validation cote client (mots de passe identiques, longueur min)
3. Cree le compte et connecte automatiquement

**Endpoint:**
```
POST /api/auth/register
Headers: X-Tenant-ID: {tenant_id}
Body: {
    "first_name": "...",
    "last_name": "...",
    "email": "...",
    "phone": "...",
    "password": "..."
}
```

**Reponse:** Identique a login

---

## Dashboard (`/dashboard`)

**Fichiers:** `views/dashboard/dashboard.js`, `views/dashboard/dashboard.css`

**Comportement:**
1. Affiche un message de bienvenue personnalise
2. Filtre de periode avec DatePicker (debut/fin) - par defaut: 30 derniers jours
3. Statistiques dynamiques selon la periode selectionnee
4. Affiche les 5 derniers colis de la periode
5. Boutons d'action rapide (nouveau colis, suivre)
6. Lien vers l'historique complet

**Composants utilises:**
- `DatePicker` - Selecteurs de date pour la periode

**Endpoints:**
```
GET /api/packages/stats?date_from=&date_to=
GET /api/packages?per_page=5&date_from=&date_to=
```

**Reponse stats:**
```json
{
    "stats": {
        "total": 15,
        "pending": 3,
        "in_transit": 5,
        "delivered": 7,
        "by_status": {
            "pending": 3,
            "received": 2,
            "in_transit": 5,
            "arrived_port": 1,
            "customs": 1,
            "out_for_delivery": 1,
            "delivered": 7
        }
    }
}
```

---

## Liste des Colis (`/packages`)

**Fichiers:** `views/packages/packages.js`, `views/packages/packages.css`

**Comportement:**
1. Liste paginee des colis du client
2. Recherche par tracking number ou description
3. Filtre par statut
4. Clic sur un colis -> detail

**Endpoint:**
```
GET /api/packages?page=1&per_page=20&status=&search=
```

**Reponse:**
```json
{
    "packages": [...],
    "total": 50,
    "pages": 3,
    "current_page": 1
}
```

---

## Detail Colis (`/packages/:id`)

**Fichiers:** `views/package-detail/package-detail.js`, `views/package-detail/package-detail.css`

**Comportement:**
1. Affiche toutes les infos du colis
2. Timeline de l'historique des statuts
3. Bouton copier le tracking number
4. Si editable: boutons modifier/supprimer
5. Estimation de livraison si disponible

**Endpoint:**
```
GET /api/packages/{id}
```

**Reponse:**
```json
{
    "package": {
        "id": "uuid",
        "tracking_number": "EC-2024-00001",
        "description": "...",
        "category": "electronics",
        "weight": 5.5,
        "dimensions": { "length": 30, "width": 20, "height": 15 },
        "declared_value": 500,
        "currency": "USD",
        "quantity": 2,
        "origin": { "address": "...", "city": "Guangzhou", "country": "China" },
        "destination": { "address": "...", "city": "Douala", "country": "Cameroon" },
        "recipient": { "name": "...", "phone": "..." },
        "status": "in_transit",
        "is_editable": false,
        "created_at": "2024-01-15T10:30:00Z",
        "estimated_delivery": "2024-02-15T00:00:00Z",
        "history": [
            {
                "id": "uuid",
                "status": "in_transit",
                "location": "Port de Shenzhen",
                "notes": "Chargement sur navire",
                "created_at": "2024-01-20T08:00:00Z"
            }
        ]
    }
}
```

**Suppression:**
```
DELETE /api/packages/{id}
```
Reponse: `{ "message": "Package deleted" }`

---

## Nouveau Colis (`/new-package`)

**Fichiers:** `views/new-package/new-package.js`, `views/new-package/new-package.css`

**Comportement:**
1. Formulaire multi-sections (description, dimensions, destination, destinataire)
2. Mode edition si `?edit={id}` dans l'URL
3. Validation des champs requis
4. Redirige vers le detail apres creation

**Creation:**
```
POST /api/packages
Body: {
    "description": "...",
    "category": "electronics",
    "quantity": 1,
    "weight": 5.5,
    "length": 30,
    "width": 20,
    "height": 15,
    "declared_value": 500,
    "currency": "USD",
    "destination_country": "Cameroon",
    "destination_city": "Douala",
    "destination_address": "...",
    "recipient_name": "...",
    "recipient_phone": "..."
}
```

**Modification:**
```
PUT /api/packages/{id}
Body: { ... memes champs ... }
```

---

## Suivi (`/track`)

**Fichiers:** `views/track/track.js`, `views/track/track.css`

**Comportement:**
1. Champ de saisie du numero de suivi
2. Recherche et affiche le resultat
3. Visualisation origine -> destination
4. Timeline des 5 derniers evenements
5. Lien vers le detail complet

**Endpoint:**
```
GET /api/packages/track/{tracking_number}
```

**Reponse:** Identique au detail colis

---

## Profil (`/profile`)

**Fichiers:** `views/profile/profile.js`, `views/profile/profile.css`

**Comportement:**
1. Affiche et permet de modifier les infos personnelles
2. Toggles pour les preferences de notification
3. Bouton changement de mot de passe (modal)
4. Bouton deconnexion

**Endpoints:**

Mise a jour profil:
```
PUT /api/auth/me
Body: { "first_name": "...", "last_name": "...", "phone": "..." }
```

Notifications:
```
PUT /api/clients/settings/notifications
Body: { "notify_email": true, "notify_sms": false, "notify_push": true }
```

Mot de passe:
```
POST /api/auth/change-password
Body: { "current_password": "...", "new_password": "..." }
```

---

## Notifications (`/notifications`)

**Fichiers:** `views/notifications/notifications.js`, `views/notifications/notifications.css`

**Comportement:**
1. Liste des notifications avec indicateur non-lu
2. Clic marque comme lu et navigue vers le colis lie
3. Bouton "tout marquer comme lu"

**Endpoints:**
```
GET /api/notifications?page=1&per_page=20&unread_only=false
POST /api/notifications/{id}/read
POST /api/notifications/read-all
GET /api/notifications/unread-count
```

**Reponse liste:**
```json
{
    "notifications": [
        {
            "id": "uuid",
            "title": "Colis en transit",
            "message": "Votre colis EC-2024-00001 est en route",
            "type": "status_update",
            "package_id": "uuid",
            "is_read": false,
            "created_at": "2024-01-20T10:00:00Z"
        }
    ],
    "total": 25,
    "unread_count": 3,
    "pages": 2,
    "current_page": 1
}
```

---

## Historique (`/history`)

**Fichiers:** `views/history/history.js`, `views/history/history.css`

**Comportement:**
1. Liste complete de tous les colis avec DataTable
2. Recherche textuelle dans tous les champs
3. Filtre par statut (SearchSelect)
4. Filtre par periode (DatePicker debut/fin)
5. Pagination configurable (15, 30, 50, 100 elements)
6. Tri par colonnes
7. Clic sur une ligne -> detail du colis
8. Bouton export (a implementer)

**Composants utilises:**
- `DataTable` - Tableau avec tri, recherche, pagination
- `SearchSelect` - Select avec recherche pour le filtre statut
- `DatePicker` - Selecteur de date pour la periode
- `Icons` - Icones SVG

**Endpoint:**
```
GET /api/packages?page=1&per_page=100&status=&date_from=&date_to=
```

**Reponse:**
```json
{
    "packages": [
        {
            "id": "uuid",
            "tracking_number": "EC-2024-00001",
            "description": "...",
            "status": "in_transit",
            "quantity": 2,
            "weight": 5.5,
            "destination": { "city": "Douala", "country": "Cameroon" },
            "created_at": "2024-01-15T10:30:00Z"
        }
    ],
    "total": 75,
    "pages": 5,
    "current_page": 1
}
```

**Note:** En mode test, les donnees sont generees localement avec filtrage cote client.

---

## Connexion au Backend Reel

### Configuration

Modifier `assets/js/config.js`:

```javascript
const CONFIG = {
    TENANT_ID: 'votre-tenant-id-reel',
    API_URL: 'https://api.votredomaine.com/api',
    // ...
};
```

### Headers requis

Toutes les requetes doivent inclure:
```
X-Tenant-ID: {tenant_id}
Authorization: Bearer {access_token}  // sauf login/register
Content-Type: application/json
```

### Gestion des erreurs

Le backend doit retourner:
```json
{
    "error": "Message d'erreur lisible"
}
```

Avec les codes HTTP appropries:
- 400: Erreur de validation
- 401: Non authentifie
- 403: Acces refuse
- 404: Ressource non trouvee
- 409: Conflit (email deja utilise)
- 500: Erreur serveur

### Refresh Token

Quand le token expire (401), l'API client tente automatiquement de rafraichir via:
```
POST /api/auth/refresh
Authorization: Bearer {refresh_token}
```

Si le refresh echoue, l'utilisateur est deconnecte.
