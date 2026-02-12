# Vue Pickups - Retrait de Colis

## Description

Cette vue permet au personnel (staff/admin) de gérer le processus complet de retrait de colis par les clients ou leurs mandataires.

## Fonctionnalités

### 1. Recherche de colis
- Par numéro de tracking
- Par téléphone du client
- Affiche les informations du colis et le solde à payer

### 2. Identification du retireur
- **Client lui-même** : Retrait direct par le propriétaire
- **Mandataire** : Retrait par une tierce personne avec :
  - Nom complet
  - Téléphone
  - Type de pièce d'identité (CNI, Passeport, Permis, Autre)
  - Numéro de pièce

### 3. Paiement au retrait
- Affichage du solde restant
- Sélection de la méthode de paiement :
  - Espèces
  - Mobile Money
  - Virement bancaire
  - Carte bancaire
- Référence de transaction (optionnel)

### 4. Confirmation
- **Signature** : Canvas pour capturer la signature du retireur
- **Photo** : Upload d'une photo de preuve (optionnel)
- **Notes** : Remarques ou observations

## Workflow Backend

1. **POST /api/pickups/search** - Recherche le colis
2. **POST /api/pickups/upload-photo** - Upload la photo (si présente)
3. **POST /api/pickups/process** - Traite le retrait complet

Le backend effectue automatiquement :
- Création du paiement si nécessaire
- Liaison du paiement au colis
- Mise à jour du statut du colis à "delivered"
- Création de l'enregistrement Pickup
- Ajout à l'historique du colis
- Notification au client (TODO)

## Modèles de données

### Pickup
```python
{
    'id': str,
    'package_id': str,
    'client_id': str,
    'pickup_by': 'client' | 'proxy',
    'proxy_name': str,
    'proxy_phone': str,
    'proxy_id_type': str,
    'proxy_id_number': str,
    'payment_id': str,
    'payment_required': bool,
    'payment_collected': float,
    'payment_method': str,
    'payment_reference': str,
    'signature': str (base64),
    'photo_proof': str (URL),
    'picked_up_at': datetime,
    'notes': str
}
```

## Sécurité

- Route protégée par `@admin_required`
- Validation stricte des données
- Vérification que le colis n'est pas déjà retiré
- Vérification du solde avant retrait
- Signature obligatoire
- Photo optionnelle mais recommandée

## TODO

- [ ] Implémenter la modal d'historique des retraits
- [ ] Ajouter notification automatique au client après retrait
- [ ] Ajouter impression du reçu de retrait
- [ ] Ajouter scan de QR code pour identification rapide
- [ ] Ajouter statistiques de retraits (dashboard)
