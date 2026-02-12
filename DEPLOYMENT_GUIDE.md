# Guide de Déploiement Express Cargo

## Table des matières
1. [Comparaison App Mobile vs Web Client](#1-comparaison-app-mobile-vs-web-client)
2. [Configuration Production](#2-configuration-production)
3. [Intégration Tenant ID](#3-intégration-tenant-id-multi-tenant)

---

## 1. Comparaison App Mobile vs Web Client

L'app web client (`frontend-logi/client-web/`) est la référence fonctionnelle. Voici la comparaison point par point avec l'app mobile Flutter (`frontend-logi/mobile-client/`).

### 1.1 Écrans / Vues

| Fonctionnalité | Web Client | Mobile | Statut |
|---|---|---|---|
| Login (email/password) | `views/login/` | `screens/auth/login_screen.dart` | ✅ Identique |
| Inscription | `views/register/` | `screens/auth/register_screen.dart` | ✅ Identique |
| Mot de passe oublié | `views/forgot-password/` | `screens/auth/forgot_password_screen.dart` | ⚠️ Partiel (voir 1.3) |
| Dashboard | `views/dashboard/` | `screens/dashboard/dashboard_screen.dart` | ✅ Identique |
| Liste des colis | `views/packages/` | `screens/packages/packages_screen.dart` | ✅ Identique |
| Détail colis | `views/package-detail/` | `screens/packages/package_detail_screen.dart` | ✅ Identique |
| Nouveau colis | `views/new-package/` | `screens/packages/new_package_screen.dart` | ✅ Identique |
| Suivi (tracking) | `views/track/` | `screens/track/track_screen.dart` | ✅ Identique |
| Calculateur tarifs | `views/calculator/` | `screens/calculator/calculator_screen.dart` | ✅ Identique |
| Historique | `views/history/` | `screens/history/history_screen.dart` | ✅ Identique |
| Notifications | `views/notifications/` | `screens/notifications/notifications_screen.dart` | ✅ Identique |
| Profil | `views/profile/` | `screens/profile/profile_screen.dart` | ✅ Identique |
| Templates | `views/templates/` | `screens/templates/templates_screen.dart` | ✅ Identique |
| Not Found (404) | `views/not-found/` | — (géré par GoRouter) | ✅ OK |

### 1.2 Endpoints API

| Catégorie | Endpoint | Web Client | Mobile | Statut |
|---|---|---|---|---|
| **Auth** | `POST /auth/login` | ✅ | ✅ | ✅ |
| | `POST /auth/register` | ✅ | ✅ | ✅ |
| | `POST /auth/logout` | ✅ | ✅ | ✅ |
| | `GET /auth/me` | ✅ | ✅ | ✅ |
| | `PUT /auth/me` | ✅ | ✅ | ✅ |
| | `POST /auth/change-password` | ✅ | ✅ | ✅ |
| | `POST /auth/change-password-verified` | ✅ | ✅ | ✅ |
| | `POST /auth/reset-password` | ✅ | ✅ | ✅ |
| | `POST /auth/register-verified` | ✅ | ✅ | ✅ |
| | `POST /auth/refresh` | ✅ | ✅ | ✅ |
| | `GET /auth/csrf-token` | ✅ | — | ✅ (mobile n'utilise pas les cookies) |
| **OTP** | `POST /auth/otp/request` | ✅ | ✅ | ✅ |
| | `POST /auth/otp/verify` | ✅ | ✅ | ✅ |
| **Packages** | `GET /packages` | ✅ | ✅ | ✅ |
| | `GET /packages/:id` | ✅ | ✅ | ✅ |
| | `POST /packages` | ✅ | ✅ | ✅ |
| | `PUT /packages/:id` | ✅ | ✅ | ✅ |
| | `DELETE /packages/:id` | ✅ | ✅ | ✅ |
| | `GET /packages/stats` | ✅ | ✅ | ✅ |
| | `GET /packages/track/:tracking` | ✅ | ✅ | ✅ |
| **Templates** | `GET /templates` | ✅ | ✅ | ✅ |
| | `GET /templates/:id` | ✅ | — | ⚠️ Non utilisé côté mobile |
| | `POST /templates` | ✅ | ✅ | ✅ |
| | `PUT /templates/:id` | ✅ | — | ⚠️ Non utilisé côté mobile |
| | `DELETE /templates/:id` | ✅ | ✅ | ✅ |
| **Notifications** | `GET /notifications` | ✅ | ✅ | ✅ |
| | `POST /notifications/:id/read` | ✅ | ✅ | ✅ |
| | `POST /notifications/read-all` | ✅ | ✅ | ✅ |
| | `DELETE /notifications/:id` | ✅ | ✅ | ✅ |
| | `DELETE /notifications` | ✅ | ✅ | ✅ |
| | `GET /notifications/unread-count` | ✅ | ✅ | ✅ |
| | `POST /notifications/push/subscribe` | ✅ | ✅ | ✅ |
| | `POST /notifications/push/unsubscribe` | ✅ | ✅ | ✅ |
| | `GET /notifications/push/vapid-key` | ✅ (WebPush) | — | ✅ (mobile utilise FCM, pas VAPID) |
| **Config** | `GET /config/tenant/:id` | ✅ | ✅ | ✅ |
| | `GET /config/tenant/:id/announcements` | ✅ | ✅ | ✅ |
| | `POST /config/tenant/:id/calculate` | ✅ | ✅ | ✅ |
| **Client** | `GET /clients/profile` | ✅ | ✅ | ✅ |
| | `PUT /clients/profile` | ✅ | ✅ | ✅ |
| | `PUT /clients/settings/notifications` | ✅ | ✅ | ✅ |

### 1.3 Différences fonctionnelles identifiées

#### ✅ Corrigé : Devise hardcodée dans le détail colis mobile
- `package_detail_screen.dart` ligne 203 affichait le montant avec `XAF` en dur
- **Corrigé** : utilise maintenant `pkg.currency ?? 'XAF'`

#### ⚠️ Mot de passe oublié — flux incomplet côté mobile
- **Web** : `forgot-password.js` → demande OTP → saisie du code + nouveau mot de passe → `POST /auth/reset-password`
- **Mobile** : `forgot_password_screen.dart` → demande OTP → affiche "email envoyé" → bouton "retour à la connexion"
- **Manque** : l'écran de saisie du code OTP + nouveau mot de passe après l'envoi
- **Impact** : Le client mobile ne peut pas finaliser la réinitialisation du mot de passe dans l'app

#### ⚠️ Templates — édition manquante côté mobile
- **Web** : `templates.getById()` + `templates.update()` disponibles
- **Mobile** : `getTemplates()` et `deleteTemplate()` seulement, pas de `getById` ni `update`
- **Impact** : Mineur — les templates sont surtout créés lors de l'ajout d'un colis

#### ℹ️ Devises — listes différentes
- **Web client** : `['USD', 'EUR', 'CNY', 'XAF']`
- **Mobile** : `['XAF', 'XOF', 'USD']`
- Les deux sont valides selon le contexte (le mobile cible l'Afrique, le web est plus généraliste)

#### ℹ️ Notifications WhatsApp
- **Mobile** : toggle `notify_whatsapp` dans le profil
- **Web** : pas de toggle WhatsApp (email, SMS, push seulement)
- Le backend supporte `notify_whatsapp`, donc le mobile est plus complet

### 1.4 Headers HTTP

| Header | Web Client | Mobile | Superadmin |
|---|---|---|---|
| `Content-Type` | `application/json` | `application/json` | `application/json` |
| `X-Tenant-ID` | `CONFIG.TENANT_ID` | `AppConfig.tenantId` | — (pas de tenant) |
| `X-App-Type` | `client` | `client` | — |
| `X-App-Channel` | `web_client` | `app_ios_client` / `app_android_client` | `web_superadmin` |
| `Authorization` | `Bearer <token>` | `Bearer <token>` | `Bearer <token>` |
| `X-CSRF-Token` | ✅ (POST/PUT/DELETE) | ✅ (POST/PUT/DELETE) | ✅ (POST/PUT/DELETE) |

### 1.5 Modales et interactions

| Interaction | Web Client | Mobile |
|---|---|---|
| Confirmation suppression | Modal JS | `AlertDialog` Flutter |
| Toast/Snackbar | `Toast.success/error()` | `ScaffoldMessenger.showSnackBar()` |
| Chargement | `Loader.button()` | `CircularProgressIndicator` |
| Pull-to-refresh | — | `RefreshIndicator` |
| Pagination scroll infini | — | `ScrollController` (history) |
| Filtres colis | Tabs statut + recherche | `PopupMenuButton` + `TextField` |

---

## 2. Configuration Production

### 2.1 Backend (`backend-logi/`)

Le backend lit **toutes** ses variables depuis l'environnement via `config.py`. Voici le récapitulatif :

#### Variables obligatoires en production

| Variable | Description | Exemple |
|---|---|---|
| `FLASK_ENV` | Mode d'exécution | `production` |
| `DATABASE_URL` | URL PostgreSQL | `postgresql://user:pass@host:5432/dbname` |
| `SECRET_KEY` | Clé secrète Flask (≥32 chars) | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_SECRET_KEY` | Clé secrète JWT (≥32 chars) | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ENCRYPTION_KEY` | Clé Fernet pour chiffrement | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `CORS_ORIGINS` | Origines autorisées (virgule) | `https://client.monsite.com,https://admin.monsite.com` |

#### Variables optionnelles

| Variable | Description | Défaut |
|---|---|---|
| `JWT_ACCESS_HOURS` | Durée token accès | `24` |
| `JWT_REFRESH_DAYS` | Durée refresh token | `30` |
| `REDIS_URL` | Cache/sessions/rate limiting | `null` (désactivé) |
| `UPLOAD_FOLDER` | Dossier uploads | `uploads` |
| `MAX_UPLOAD_MB` | Taille max upload | `16` |
| `LOG_LEVEL` | Niveau de log | `INFO` |
| `SENTRY_DSN` | Monitoring Sentry | `null` |
| `CLOUDINARY_*` | Upload images cloud | `null` (par tenant) |
| `EMAILJS_*` | Envoi OTP par email | `null` (OTP dans les logs) |

#### Vérifications automatiques au démarrage

`ProductionConfig.init_app()` vérifie automatiquement :
- `DATABASE_URL` est défini
- `SECRET_KEY` et `JWT_SECRET_KEY` sont définis et ≥32 caractères
- `ENCRYPTION_KEY` est défini
- `CORS_ALLOW_ALL` n'est pas `true`
- Les cookies JWT passent en `Secure=True` et `SameSite=Strict`

**Le serveur refuse de démarrer si une vérification échoue.**

### 2.2 Frontend — Centralisation de l'URL API

Chaque frontend a **un seul fichier de configuration** qui centralise l'URL de l'API et le tenant ID. Aucun autre fichier ne contient d'URL en dur.

#### client-web (`frontend-logi/client-web/assets/js/config.js`)

```
Fichier : assets/js/config.js
Mécanisme : CONFIG.API_URL et CONFIG.TENANT_ID (getters dynamiques)
Priorité : window.EXPRESS_CARGO_CONFIG > ENV_CONFIG[ENV] > défaut
```

- **Dev** : `http://localhost:5000/api` (auto-détecté)
- **Prod** : Injecter via `window.EXPRESS_CARGO_CONFIG` dans `index.html`
- Tous les appels API passent par `api.js` qui lit `CONFIG.API_URL`

#### tenant-web (`frontend-logi/tenant-web/assets/js/config.js`)

```
Fichier : assets/js/config.js
Mécanisme : CONFIG.API_URL et CONFIG.TENANT_ID (getters dynamiques)
Priorité : window.EXPRESS_CARGO_CONFIG > ENV_CONFIG[ENV] > défaut
```

- Même pattern que client-web
- Tous les appels API passent par `api.js` qui lit `CONFIG.API_URL`

#### superadmin-web (`frontend-logi/superadmin-web/assets/js/api.js`)

```
Fichier : assets/js/api.js (SA_CONFIG en haut du fichier)
Mécanisme : SA_CONFIG.API_BASE_URL
Priorité : window.SUPERADMIN_CONFIG > auto-détection > défaut localhost
```

- **Dev** : `http://localhost:5000` (auto-détecté)
- **Prod** : Injecter via `window.SUPERADMIN_CONFIG` dans `index.html`

#### mobile-client (`frontend-logi/mobile-client/lib/config/app_config.dart`)

```
Fichier : lib/config/app_config.dart
Mécanisme : AppConfig.apiUrl (getter avec switch sur ENV)
Priorité : --dart-define=ENV=production au build
```

- **Dev** : `http://10.0.2.2:5000/api` (Android emulator) ou `http://localhost:5000/api` (web)
- **Prod** : `https://api.expresscargo.com/api` (modifier `prodApiUrl` dans `app_config.dart`)
- Build prod : `flutter build apk --dart-define=ENV=production`

---

## 3. Intégration Tenant ID (Multi-Tenant)

### 3.1 Architecture

```
                    ┌─────────────────────────┐
                    │   Backend commun (API)   │
                    │   1 instance partagée    │
                    │   Filtre par X-Tenant-ID │
                    └────────┬────────────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
     ┌──────┴──────┐  ┌─────┴──────┐  ┌──────┴──────┐
     │  Tenant A   │  │  Tenant B  │  │  Tenant C   │
     │ client-web  │  │ client-web │  │ client-web  │
     │ tenant-web  │  │ tenant-web │  │ tenant-web  │
     │ mobile-app  │  │ mobile-app │  │ mobile-app  │
     └─────────────┘  └────────────┘  └─────────────┘
```

Chaque tenant a **ses propres frontends** (déployés séparément) mais partage le **même backend**. Le backend identifie le tenant via le header `X-Tenant-ID` envoyé par chaque frontend.

### 3.2 Étapes pour fournir les frontends à un nouveau tenant

#### Étape 1 : Créer le tenant dans le backend

Via le super-admin ou directement en base :
```sql
INSERT INTO tenants (id, name, slug, is_active)
VALUES ('tenant-abc-123', 'Mon Entreprise', 'mon-entreprise', true);
```

Ou via l'API super-admin :
```
POST /api/superadmin/tenants
{
  "name": "Mon Entreprise",
  "slug": "mon-entreprise"
}
```

Le `tenant_id` retourné (ex: `tenant-abc-123`) est celui à injecter dans les frontends.

#### Étape 2 : Configurer le client-web pour ce tenant

Copier le dossier `frontend-logi/client-web/` et modifier **uniquement** `index.html` :

```html
<!-- Ajouter AVANT le chargement de config.js -->
<script>
  window.EXPRESS_CARGO_CONFIG = {
    API_URL: 'https://api.votredomaine.com/api',
    TENANT_ID: 'tenant-abc-123'
  };
</script>
```

**Aucun autre fichier à modifier.** Tous les fichiers JS lisent `CONFIG.API_URL` et `CONFIG.TENANT_ID` depuis `config.js`, qui priorise `window.EXPRESS_CARGO_CONFIG`.

#### Étape 3 : Configurer le tenant-web (admin) pour ce tenant

Même principe — modifier `index.html` du tenant-web :

```html
<script>
  window.EXPRESS_CARGO_CONFIG = {
    API_URL: 'https://api.votredomaine.com/api',
    TENANT_ID: 'tenant-abc-123',
    TENANT_SLUG: 'mon-entreprise'
  };
</script>
```

#### Étape 4 : Configurer l'app mobile pour ce tenant

Modifier `lib/config/app_config.dart` :

```dart
class AppConfig {
  static const String tenantId = 'tenant-abc-123';  // ← Changer ici
  static const String prodApiUrl = 'https://api.votredomaine.com/api';  // ← Changer ici
  // ...
}
```

Puis builder :
```bash
flutter build apk --dart-define=ENV=production
```

> **Note** : Chaque tenant a son propre APK avec son `tenantId` compilé en dur. C'est voulu car chaque tenant a sa propre app sur le store.

#### Étape 5 : Configurer CORS sur le backend

Ajouter les domaines du nouveau tenant dans la variable d'environnement :

```env
CORS_ORIGINS=https://client-tenantA.com,https://admin-tenantA.com,https://client-tenantB.com,https://admin-tenantB.com,capacitor://localhost
```

### 3.3 Récapitulatif par frontend

| Frontend | Fichier de config | Variable tenant | Comment modifier |
|---|---|---|---|
| **client-web** | `assets/js/config.js` | `CONFIG.TENANT_ID` | Injecter `window.EXPRESS_CARGO_CONFIG` dans `index.html` |
| **tenant-web** | `assets/js/config.js` | `CONFIG.TENANT_ID` | Injecter `window.EXPRESS_CARGO_CONFIG` dans `index.html` |
| **superadmin-web** | `assets/js/api.js` | — (pas de tenant) | Injecter `window.SUPERADMIN_CONFIG` dans `index.html` |
| **mobile-client** | `lib/config/app_config.dart` | `AppConfig.tenantId` | Modifier la constante + rebuild |

### 3.4 Flux d'une requête multi-tenant

```
Client → GET /api/packages
         Headers:
           X-Tenant-ID: tenant-abc-123
           Authorization: Bearer <jwt>
           X-App-Channel: web_client

Backend → Vérifie le JWT
        → Extrait tenant_id du JWT claims
        → Vérifie que X-Tenant-ID == JWT tenant_id
        → Filtre les données : WHERE tenant_id = 'tenant-abc-123'
        → Retourne uniquement les colis de ce tenant
```

### 3.5 Checklist déploiement nouveau tenant

- [ ] Créer le tenant dans le backend (super-admin ou SQL)
- [ ] Créer un admin pour ce tenant (`POST /api/superadmin/tenants/:id/admin`)
- [ ] Copier `client-web/` → injecter `TENANT_ID` + `API_URL` dans `index.html`
- [ ] Copier `tenant-web/` → injecter `TENANT_ID` + `API_URL` dans `index.html`
- [ ] Déployer les deux sites web (Netlify, Vercel, VPS, etc.)
- [ ] Modifier `app_config.dart` → builder l'APK avec le bon `tenantId`
- [ ] Ajouter les domaines dans `CORS_ORIGINS` du backend
- [ ] Tester : login admin → créer un colis → vérifier côté client
