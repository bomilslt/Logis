/**
 * Vue Guide - Documentation + Contact support + Messagerie
 */
Views.guide = {
    supportContact: null,

    async render() {
        const main = document.getElementById('main-content');
        main.innerHTML = Loader.page(I18n.t('loading'));
        try { this.supportContact = await API.request('/support/contact-info'); } catch(e) { this.supportContact = {}; }
        main.innerHTML = `<div class="guide-page">
            <div class="page-header"><h1 class="page-title">${Icons.get('book-open',{size:22})} ${I18n.t('guide.title')}</h1></div>
            ${this.renderSupportCard()}
            <div id="guide-sections">${this.renderAllSections()}</div>
            <div class="support-messages" id="support-section">
                <h2 style="margin-bottom:16px">${Icons.get('message-circle',{size:20})} ${I18n.t('guide.support_messages')}</h2>
                <div class="card" style="padding:16px;margin-bottom:16px">
                    <div class="form-group"><label class="form-label">${I18n.t('guide.subject')}</label>
                        <input type="text" id="support-subject" class="form-input" placeholder="${I18n.t('guide.subject_placeholder')}"></div>
                    <div class="form-group"><label class="form-label">${I18n.t('guide.message')}</label>
                        <textarea id="support-body" class="form-input" style="min-height:80px" placeholder="${I18n.t('guide.message_placeholder')}"></textarea></div>
                    <button class="btn btn-primary" id="btn-send-support">${Icons.get('send',{size:16})} ${I18n.t('guide.send')}</button>
                </div>
                <div id="support-threads"></div>
            </div></div>`;
        document.getElementById('btn-send-support')?.addEventListener('click', () => this.sendMsg());
        this.loadMsgs();
    },

    renderSupportCard() {
        const c = this.supportContact || {};
        if (!c.support_email && !c.support_phone && !c.whatsapp_number) return '';
        return `<div class="support-contact-card">
            <div class="support-icon">${Icons.get('headphones',{size:28})}</div>
            <div class="support-contact-info">
                <h3>Support ${c.platform_name||''}</h3>
                <p>${I18n.t('guide.need_help')}</p>
                ${c.support_phone?'<p>'+Icons.get('phone',{size:14})+' '+c.support_phone+'</p>':''}
                ${c.support_email?'<p>'+Icons.get('mail',{size:14})+' '+c.support_email+'</p>':''}
            </div>
            <div class="support-contact-actions">
                ${c.whatsapp_number?'<a href="https://wa.me/'+c.whatsapp_number+'" target="_blank" class="btn btn-sm btn-primary">WhatsApp</a>':''}
                ${c.support_email?'<a href="mailto:'+c.support_email+'" class="btn btn-sm btn-outline">Email</a>':''}
            </div></div>`;
    },

    async sendMsg() {
        const s = document.getElementById('support-subject')?.value.trim();
        const b = document.getElementById('support-body')?.value.trim();
        if (!s||!b) { Toast.error(I18n.t('guide.subject_required')); return; }
        try {
            await API.request('/support/messages',{method:'POST',body:JSON.stringify({subject:s,body:b}),headers:{'Content-Type':'application/json'}});
            document.getElementById('support-subject').value='';
            document.getElementById('support-body').value='';
            Toast.success(I18n.t('guide.message_sent')); this.loadMsgs();
        } catch(e) { Toast.error(e.message); }
    },

    async loadMsgs() {
        const el = document.getElementById('support-threads');
        if(!el) return;
        try {
            const data = await API.request('/support/messages');
            const msgs = data.messages||[];
            if(!msgs.length){el.innerHTML=`<p class="text-muted">${I18n.t('guide.no_messages')}</p>`;return;}
            el.innerHTML = msgs.map(m => {
                const replies = m.replies||[];
                const hasUnread = replies.some(r=>r.direction==='admin_to_tenant'&&!r.is_read);
                return `<div class="support-thread" data-id="${m.id}">
                    <div class="support-thread-header" onclick="this.parentElement.classList.toggle('open')">
                        <h4>${hasUnread?'<span class="unread-dot"></span> ':''}${m.subject}</h4>
                        <span class="support-thread-meta">${new Date(m.created_at).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US')} - ${replies.length} ${I18n.t('guide.reply')}</span>
                    </div>
                    <div class="support-thread-body">
                        <div class="support-bubble sent"><div>${m.body}</div><div class="support-bubble-meta">${m.sender_name||I18n.t('guide.you')} - ${new Date(m.created_at).toLocaleString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US')}</div></div>
                        ${replies.map(r=>`<div class="support-bubble ${r.direction==='admin_to_tenant'?'received':'sent'}"><div>${r.body}</div><div class="support-bubble-meta">${r.sender_name||'Support'} - ${new Date(r.created_at).toLocaleString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US')}</div></div>`).join('')}
                    </div></div>`;
            }).join('');
        } catch(e) { el.innerHTML=`<p class="text-muted">${I18n.t('guide.messages_error')}</p>`; }
    },

    renderAllSections() {
        return this.getSections().map((s,i) => `<div class="guide-section" data-idx="${i}">
            <div class="guide-section-header" onclick="Views.guide.toggleSection(${i})">
                <div class="guide-section-icon" style="background:${s.color}">${Icons.get(s.icon,{size:20})}</div>
                <div class="guide-section-title"><h3>${s.title}</h3><p>${s.sub}</p></div>
                <span class="guide-section-arrow">${Icons.get('chevron-right',{size:18})}</span>
            </div><div class="guide-section-body">${s.body}</div></div>`).join('');
    },

    toggleSection(i){document.querySelector('.guide-section[data-idx="'+i+'"]')?.classList.toggle('open');},

    getSections() { return [
        {title:'Dashboard',sub:'Vue d\'ensemble de votre activite',icon:'home',color:'#1a56db',body:`<p>Le <strong>Dashboard</strong> affiche en temps reel :</p><ul>
<li><strong>Total colis</strong> : nombre de colis, en attente et en transit</li>
<li><strong>Revenus du mois</strong> : chiffre d'affaires avec comparaison au mois precedent</li>
<li><strong>Paiements en attente</strong> : montant des factures non reglees</li>
<li><strong>Clients actifs</strong> : clients ayant des colis en cours</li>
<li><strong>Aujourd'hui</strong> : colis recus, mises a jour et livraisons du jour</li>
<li><strong>Colis recents</strong> et <strong>Activite recente</strong> : les dernieres operations</li>
<li><strong>Repartition par statut</strong> : barres de progression par statut de colis</li></ul>
<p>Le dashboard se rafraichit automatiquement toutes les 30 secondes.</p>`},

        {title:'Gestion des Colis',sub:'Enregistrement, reception, suivi et export',icon:'package',color:'#059669',body:`<p>La vue <strong>Colis</strong> est le coeur de l'application.</p>
<p><strong>Filtres disponibles :</strong> recherche par tracking/client/telephone, statut, depart assigne, periode.</p>
<p><strong>Recevoir un colis (Mode Scanner) :</strong></p><ul>
<li>Cliquez sur <strong>"Recevoir colis"</strong> pour ouvrir le mode scanner</li>
<li>Scannez le code-barres ou saisissez le tracking manuellement</li>
<li>Si le colis est pre-enregistre par le client, ses infos s'affichent avec les valeurs estimees</li>
<li>Saisissez les <strong>valeurs reelles</strong> (poids, volume, quantite) mesurees</li>
<li>Le <strong>tarif est applique automatiquement</strong> selon la route et le type de colis configure dans Tarifs</li>
<li>Si le colis n'existe pas, un formulaire de saisie manuelle apparait</li></ul>
<p><strong>Actions en masse :</strong> selectionnez plusieurs colis pour assigner un depart, changer le statut ou imprimer des etiquettes.</p>
<p><strong>Export :</strong> exportez la liste en Excel ou PDF.</p>`},

        {title:'Detail d\'un Colis',sub:'Historique, paiements et actions',icon:'eye',color:'#7c3aed',body:`<p>Cliquez sur un colis pour voir son <strong>detail complet</strong> :</p><ul>
<li>Informations client, tracking, description, poids/volume</li>
<li>Historique des changements de statut avec dates</li>
<li>Paiements enregistres et solde restant</li>
<li>Actions : changer le statut, enregistrer un paiement, imprimer l'etiquette</li></ul>`},

        {title:'Departs',sub:'Programmer et gerer les expeditions',icon:'truck',color:'#d97706',body:`<p>La vue <strong>Departs</strong> permet de planifier les expeditions groupees.</p><ul>
<li><strong>Programmer un depart</strong> : definir la date, la route (origine/destination), le mode de transport et la duree estimee</li>
<li><strong>Onglets</strong> : A venir, En transit, Arrives, Tous</li>
<li><strong>Cycle de vie</strong> : Planifie → Parti → Arrive</li>
<li>Chaque depart affiche le nombre de colis assignes</li>
<li>Depuis la vue Colis, vous pouvez assigner des colis a un depart</li></ul>`},

        {title:'Retraits et Paiements',sub:'Gerer les retraits clients et encaisser',icon:'credit-card',color:'#dc2626',body:`<p>Cette vue combine <strong>retrait de colis</strong> et <strong>encaissement</strong> :</p><ul>
<li><strong>Mini dashboard</strong> : colis en attente de retrait, paiements en attente, retraits du jour</li>
<li>Recherchez un colis par tracking ou nom client</li>
<li>Enregistrez le paiement (especes, mobile money, virement...)</li>
<li>Capturez la <strong>signature du client</strong> et une <strong>photo de la piece d'identite</strong></li>
<li>Le colis passe automatiquement au statut "Livre"</li></ul>`},

        {title:'Clients',sub:'Base de donnees clients',icon:'users',color:'#0891b2',body:`<p>Gerez votre <strong>base clients</strong> :</p><ul>
<li><strong>Stats</strong> : total clients, clients actifs, nouveaux ce mois</li>
<li><strong>Creer un client</strong> : nom, email, telephone</li>
<li><strong>Fiche client</strong> : historique des colis, paiements, solde</li>
<li><strong>Export</strong> : exportez la liste des clients</li></ul>`},

        {title:'Rapports',sub:'Statistiques, departs et comptabilite',icon:'trending-up',color:'#4f46e5',body:`<p>Trois onglets de rapports :</p><ul>
<li><strong>Statistiques</strong> : graphiques de revenus, colis par periode (semaine/mois/annee), KPIs</li>
<li><strong>Departs</strong> : rapport detaille par depart avec colis, revenus et depenses</li>
<li><strong>Comptabilite</strong> : bilan recettes/depenses, charges salariales, depenses diverses</li></ul>
<p>Exportez chaque rapport en PDF ou Excel.</p>`},

        {title:'Factures',sub:'Creation et gestion des factures',icon:'file-text',color:'#be185d',body:`<p>Creez des <strong>factures manuelles</strong> pour vos clients :</p><ul>
<li>Selectionnez un client, ajoutez une description et un montant</li>
<li><strong>Cycle</strong> : Brouillon → Envoyee → Payee</li>
<li>Envoyez la facture par email ou WhatsApp</li>
<li>Imprimez avec le branding de votre entreprise</li></ul>`},

        {title:'Annonces',sub:'Communiquer avec vos clients',icon:'megaphone',color:'#ea580c',body:`<p>Publiez des <strong>annonces</strong> visibles par tous vos clients :</p><ul>
<li>Titre, contenu, type (info, promo, urgent)</li>
<li>Les annonces apparaissent sur l'interface client web et mobile</li>
<li>Ideal pour communiquer les horaires, promotions ou changements</li></ul>`},

        {title:'Trajets et Tarifs',sub:'Configurer origines, destinations et prix',icon:'map-pin',color:'#0d9488',body:`<p>Configuration essentielle pour le calcul automatique des prix :</p><ul>
<li><strong>Origines</strong> : pays/villes d'expedition (ex: Chine - Guangzhou)</li>
<li><strong>Destinations</strong> : pays/villes de livraison (ex: Cameroun - Douala)</li>
<li><strong>Tarifs par route</strong> : pour chaque combinaison origine/destination, definissez les prix par mode de transport (aerien/maritime) et type de colis (ordinaire, special, batterie...)</li>
<li>Chaque tarif a une <strong>unite</strong> (kg, m3, piece, forfait) et un <strong>prix unitaire</strong></li></ul>
<p>Ces tarifs sont utilises automatiquement lors de la reception des colis.</p>`},

        {title:'Personnel',sub:'Gerer les comptes staff',icon:'user-cog',color:'#6d28d9',body:`<p>Gerez les <strong>comptes utilisateurs</strong> de votre equipe :</p><ul>
<li>Ajouter un employe avec email, role et permissions</li>
<li><strong>Roles</strong> : Admin, Manager, Agent, Comptable</li>
<li>Chaque role a des permissions differentes (certaines vues sont masquees)</li>
<li>Activer/desactiver un compte</li></ul>`},

        {title:'RH / Paie',sub:'Salaires, paiements et charges',icon:'briefcase',color:'#9333ea',body:`<p>Module de gestion des <strong>ressources humaines</strong> :</p><ul>
<li><strong>Employes</strong> : liste avec salaire, poste, date d'embauche</li>
<li><strong>Paiements de salaire</strong> : enregistrer les versements mensuels</li>
<li><strong>Charges diverses</strong> : loyer, electricite, fournitures, etc.</li></ul>`},

        {title:'Parametres',sub:'Configuration generale de l\'application',icon:'settings',color:'#475569',body:`<p>Cinq onglets de configuration :</p><ul>
<li><strong>General</strong> : nom de l'entreprise, logo, devise, langue</li>
<li><strong>Systeme</strong> : format de tracking, prefixe, numerotation</li>
<li><strong>SMS / WhatsApp</strong> : configurer les notifications automatiques aux clients</li>
<li><strong>Paiement en ligne</strong> : activer les providers de paiement (Mobile Money, etc.)</li>
<li><strong>Apparence</strong> : theme clair/sombre, couleurs</li></ul>`},

        {title:'Mon Abonnement',sub:'Voir et renouveler votre plan',icon:'credit-card',color:'#0369a1',body:`<p>Consultez votre <strong>abonnement actuel</strong> :</p><ul>
<li>Plan actif, date de debut et d'expiration</li>
<li>Jours restants et rappels automatiques</li>
<li>Fonctionnalites incluses dans votre plan</li>
<li><strong>Renouveler</strong> : cliquez pour contacter le support via WhatsApp, email ou lien personnalise</li></ul>`},

        {title:'Calculateur de Tarifs',sub:'Estimer le cout d\'un envoi',icon:'calculator',color:'#64748b',body:`<p>Accessible depuis le <strong>bouton $ dans le header</strong> :</p><ul>
<li>Selectionnez origine, destination, mode de transport et type de colis</li>
<li>Entrez le poids, volume ou quantite</li>
<li>Le tarif est calcule automatiquement selon vos tarifs configures</li>
<li>Utile pour donner une estimation rapide a un client</li></ul>`},

        {title:'Mon Profil',sub:'Informations personnelles et securite',icon:'user',color:'#334155',body:`<p>Gerez votre <strong>compte personnel</strong> :</p><ul>
<li>Modifier nom, email, telephone</li>
<li>Changer votre mot de passe</li>
<li>Voir vos sessions actives</li></ul>`}
    ];}
};
