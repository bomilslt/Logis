/**
 * French translations (default)
 */
const LANG_FR = {
    // ── Global ──
    app_name: 'Express Cargo',
    loading: 'Chargement...',
    save: 'Enregistrer',
    cancel: 'Annuler',
    close: 'Fermer',
    delete: 'Supprimer',
    edit: 'Modifier',
    add: 'Ajouter',
    search: 'Rechercher',
    filter: 'Filtrer',
    export: 'Exporter',
    retry: 'Réessayer',
    confirm: 'Confirmer',
    yes: 'Oui',
    no: 'Non',
    actions: 'Actions',
    back: 'Retour',
    next: 'Suivant',
    previous: 'Précédent',
    all: 'Tous',
    none: 'Aucun',
    select: 'Sélectionner',
    required: 'Requis',
    optional: 'Optionnel',
    or: 'ou',
    of: 'de',
    no_results: 'Aucun résultat',
    error_generic: 'Une erreur est survenue',
    error_loading: 'Erreur de chargement',
    success_saved: 'Enregistré avec succès',
    success_deleted: 'Supprimé avec succès',
    success_updated: 'Mis à jour avec succès',
    copied: 'Copié',

    // ── Nav / Sidebar ──
    nav: {
        dashboard: 'Dashboard',
        packages: 'Colis',
        departures: 'Départs',
        pickups_payments: 'Retraits et Paiements',
        clients: 'Clients',
        reports: 'Rapports',
        tarifs: 'Trajets et Tarifs',
        announcements: 'Annonces',
        staff: 'Personnel',
        payroll: 'RH / Paie',
        settings: 'Paramètres',
        guide: 'Guide & Support',
        test_webhooks: 'Test Webhooks',
        profile: 'Mon profil',
        subscription: 'Mon Abonnement',
        logout: 'Déconnexion',
    },

    // ── Header ──
    header: {
        user_default: 'Utilisateur',
        calculator: 'Calculatrice',
        estimator: 'Estimateur de tarifs',
        notifications: 'Notifications',
    },

    // ── Roles ──
    roles: {
        admin: 'Administrateur',
        manager: 'Manager',
        staff: 'Agent',
        accountant: 'Comptable',
    },

    // ── Login ──
    login: {
        title: 'Connexion',
        email: 'Email',
        password: 'Mot de passe',
        submit: 'Se connecter',
        forgot_password: 'Mot de passe oublié ?',
        logging_in: 'Connexion...',
        error_credentials: 'Email ou mot de passe incorrect',
        error_inactive: 'Compte désactivé',
    },

    // ── Dashboard ──
    dashboard: {
        title: 'Tableau de bord',
        total_packages: 'Total colis',
        in_transit: 'En transit',
        delivered: 'Livrés',
        revenue: 'Revenus',
        recent_packages: 'Colis récents',
        recent_activity: 'Activité récente',
        today: "Aujourd'hui",
        this_week: 'Cette semaine',
        this_month: 'Ce mois',
    },

    // ── Packages ──
    packages: {
        title: 'Colis',
        new_package: 'Nouveau colis',
        receive: 'Réceptionner',
        tracking: 'Tracking',
        client: 'Client',
        status: 'Statut',
        origin: 'Origine',
        destination: 'Destination',
        weight: 'Poids',
        amount: 'Montant',
        date: 'Date',
        description: 'Description',
        transport_mode: 'Mode de transport',
        no_packages: 'Aucun colis trouvé',
        search_placeholder: 'Rechercher par tracking, client...',
        filter_status: 'Filtrer par statut',
        filter_departure: 'Filtrer par départ',
        all_statuses: 'Tous les statuts',
        all_departures: 'Tous les départs',
        bulk_actions: 'Actions groupées',
        selected: 'sélectionné(s)',
        export_list: 'Exporter la liste',
    },

    // ── Package statuses ──
    status: {
        registered: 'Enregistré',
        in_transit: 'En transit',
        arrived: 'Arrivé',
        customs: 'En douane',
        ready: 'Prêt',
        delivered: 'Livré',
        returned: 'Retourné',
        lost: 'Perdu',
    },

    // ── Package Detail ──
    package_detail: {
        title: 'Détails du colis',
        not_found: 'Colis introuvable',
        not_found_text: "Ce colis n'existe pas",
        back_to_list: 'Retour aux colis',
        client_info: 'Informations client',
        package_info: 'Informations colis',
        payment_info: 'Paiement',
        history: 'Historique',
        total_amount: 'Montant total',
        paid_amount: 'Montant payé',
        remaining: 'Reste à payer',
        paid: 'Payé',
        partial: 'Partiel',
        unpaid: 'Non payé',
        update_status: 'Mettre à jour le statut',
        phone: 'Téléphone',
        supplier_tracking: 'Tracking fournisseur',
    },

    // ── Clients ──
    clients: {
        title: 'Clients',
        new_client: 'Nouveau client',
        name: 'Nom',
        email: 'Email',
        phone: 'Téléphone',
        total_packages: 'Total colis',
        balance: 'Solde',
        created: 'Inscrit le',
        no_clients: 'Aucun client trouvé',
        search_placeholder: 'Rechercher par nom, email, téléphone...',
    },

    // ── Client Detail ──
    client_detail: {
        title: 'Détails du client',
        packages: 'Colis',
        payments: 'Paiements',
        info: 'Informations',
    },

    // ── Departures ──
    departures: {
        title: 'Départs',
        new_departure: 'Nouveau départ',
        departure_name: 'Nom du départ',
        departure_date: 'Date de départ',
        packages_count: 'Nombre de colis',
        total_weight: 'Poids total',
        no_departures: 'Aucun départ trouvé',
        status_open: 'Ouvert',
        status_closed: 'Fermé',
        status_shipped: 'Expédié',
    },

    // ── Pickups & Payments ──
    pickups_payments: {
        title: 'Retraits et Paiements',
        tab_pickups: 'Retraits',
        tab_payments: 'Paiements',
    },

    // ── Pickups ──
    pickups: {
        title: 'Retrait de Colis',
        history: 'Historique',
        awaiting: 'En attente de retrait',
        payment_pending: 'Paiement en attente',
        today_pickups: "Retraits aujourd'hui",
        this_month: 'Ce mois',
        scan_code: 'Scanner le code',
        scan_placeholder: 'Scanner ou coller le tracking...',
        search_by_name: 'Ou rechercher par nom/téléphone',
        search_placeholder: 'Nom du client ou téléphone...',
        available_packages: 'Colis disponibles pour retrait',
        pickup_form: 'Formulaire de retrait',
        no_package_selected: 'Aucun colis sélectionné',
        package_info: 'Informations du colis',
        who_picks_up: 'Qui retire le colis ?',
        client_self: 'Client lui-même',
        proxy: 'Mandataire (tierce personne)',
        proxy_name: 'Nom du mandataire',
        proxy_phone: 'Téléphone',
        id_type: 'Type de pièce',
        id_number: 'Numéro de pièce',
        collection: 'Encaissement',
        amount_to_collect: 'Montant à encaisser',
        signature: 'Signature',
        photo: 'Photo',
        confirm_pickup: 'Confirmer le retrait',
    },

    // ── Payments ──
    payments: {
        title: 'Paiements',
        new_payment: 'Nouveau paiement',
        export: 'Export',
        today_collections: 'Encaissements du jour',
        this_week: 'Cette semaine',
        this_month: 'Ce mois',
        pending: 'En attente',
        method: 'Méthode',
        all_methods: 'Toutes les méthodes',
        date_from: 'Date début',
        date_to: 'Date fin',
        no_payments: 'Aucun paiement trouvé',
        reference: 'Référence',
        amount: 'Montant',
        date: 'Date',
        search_placeholder: 'Client, référence...',
    },

    // ── Reports ──
    reports: {
        title: 'Rapports',
        export_pdf: 'Export PDF',
        export_excel: 'Export Excel',
        tab_statistics: 'Statistiques',
        tab_departures: 'Départs',
        tab_accounting: 'Comptabilité',
        period_week: 'Semaine',
        period_month: 'Mois',
        period_quarter: 'Trimestre',
        period_year: 'Année',
        revenue: "Chiffre d'affaires",
        packages_processed: 'Colis traités',
        new_clients: 'Nouveaux clients',
        delivery_rate: 'Taux livraison',
        unpaid: 'Impayés',
    },

    // ── Announcements ──
    announcements: {
        title: 'Annonces',
        new_announcement: 'Nouvelle annonce',
        no_announcements: 'Aucune annonce',
        active: 'Active',
        inactive: 'Inactive',
    },

    // ── Staff ──
    staff: {
        title: 'Personnel',
        new_staff: 'Nouveau membre',
        name: 'Nom',
        email: 'Email',
        role: 'Rôle',
        status: 'Statut',
        active: 'Actif',
        inactive: 'Inactif',
        last_login: 'Dernière connexion',
        no_staff: 'Aucun membre du personnel',
        permissions: 'Permissions',
    },

    // ── Payroll ──
    payroll: {
        title: 'Ressources Humaines',
        new_employee: 'Nouvel employé',
        new_expense: 'Charge diverse',
        tab_employees: 'Employés',
        tab_payments: 'Paiements',
        tab_expenses: 'Charges diverses',
        salary: 'Salaire',
        position: 'Poste',
        hire_date: "Date d'embauche",
    },

    // ── Tarifs ──
    tarifs: {
        title: 'Configuration des tarifs',
        tab_origins: 'Origines',
        tab_destinations: 'Destinations',
        tab_routes: 'Tarifs par route',
    },

    // ── Settings ──
    settings: {
        title: 'Paramètres',
        tab_general: 'Général',
        tab_system: 'Système',
        tab_notifications: 'SMS / WhatsApp',
        tab_online_payments: 'Paiement en ligne',
        tab_appearance: 'Apparence',
        company: 'Entreprise',
        company_name: "Nom de l'entreprise",
        email: 'Email',
        phone: 'Téléphone',
        website: 'Site web',
        address: 'Adresse',
        currency: 'Devise',
        timezone: 'Fuseau horaire',
        language: 'Langue',
    },

    // ── Profile ──
    profile: {
        title: 'Mon profil',
        personal_info: 'Informations personnelles',
        first_name: 'Prénom',
        last_name: 'Nom',
        phone: 'Téléphone',
        email: 'Email',
        change_email: 'Modifier',
        save_profile: 'Enregistrer',
        security: 'Sécurité',
        security_note: 'Pour des raisons de sécurité, le changement de mot de passe nécessite une vérification par code OTP.',
        change_password: 'Changer le mot de passe',
    },

    // ── Subscription ──
    subscription: {
        title: 'Mon Abonnement',
        subtitle: 'Gérez votre offre et vos renouvellements',
        loading: 'Chargement des informations...',
        error_loading: 'Erreur de chargement',
        error_text: "Impossible de récupérer les informations d'abonnement.",
        retry: 'Réessayer',
    },

    // ── Guide ──
    guide: {
        title: 'Guide & Support',
        contact_support: 'Contacter le support',
        subject: 'Sujet',
        message: 'Message',
        send: 'Envoyer',
        subject_required: 'Sujet et message requis',
        message_sent: 'Message envoyé avec succès',
    },

    // ── Invoices ──
    invoices: {
        title: 'Factures',
        new_invoice: 'Nouvelle facture',
        invoice_number: 'N° Facture',
        client: 'Client',
        description: 'Description',
        amount: 'Montant',
        date: 'Date',
        status: 'Statut',
        status_draft: 'Brouillon',
        status_sent: 'Envoyée',
        status_paid: 'Payée',
        status_cancelled: 'Annulée',
        no_invoices: 'Aucune facture',
        send: 'Envoyer',
    },

    // ── Tarif Estimator ──
    estimator: {
        title: 'Calculateur de tarifs',
        origin: 'Origine',
        destination: 'Destination',
        transport: 'Transport',
        package_type: 'Type de colis',
        weight_kg: 'Poids (kg)',
        volume_cbm: 'Volume (m³)',
        quantity: 'Quantité',
        result: 'Résultat',
        unit_rate: 'Tarif unitaire',
        calculation: 'Calcul',
        estimated_total: 'Total estimé',
        select_all_params: 'Sélectionnez tous les paramètres',
        enter_values: 'Entrez le poids, le volume ou la quantité',
        rate_not_configured: 'Tarif non configuré pour cette route',
        select_origin_dest: 'Sélectionnez origine/destination',
        select_transport: 'Sélectionnez un transport',
        no_transport: 'Aucun transport disponible',
        no_type: 'Aucun type',
        fixed: 'forfait',
        pieces: 'pièce(s)',
    },

    // ── Misc ──
    not_found: {
        title: 'Page introuvable',
        text: "La page que vous recherchez n'existe pas.",
        back_home: "Retour à l'accueil",
    },
    access_denied: {
        title: 'Accès refusé',
        text: "Vous n'avez pas les permissions nécessaires pour accéder à cette page.",
        back_home: "Retour à l'accueil",
    },

    // ── DataTable / Pagination ──
    datatable: {
        no_data: 'Aucune donnée',
        showing: 'Affichage',
        to: 'à',
        of: 'sur',
        entries: 'entrées',
        first: 'Première',
        last: 'Dernière',
    },

    // ── Confirmation dialogs ──
    confirm_delete: 'Êtes-vous sûr de vouloir supprimer cet élément ?',
    confirm_action: 'Êtes-vous sûr de vouloir effectuer cette action ?',
};
