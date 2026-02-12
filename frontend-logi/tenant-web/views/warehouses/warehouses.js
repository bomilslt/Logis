/**
 * Vue Warehouses - Gestion des entrepots
 */

Views.warehouses = {
    render() {
        const main = document.getElementById('main-content');
        
        // Mock data
        const warehouses = {
            'Cameroon': [
                { id: 'dla-akwa', name: 'Douala - Akwa' },
                { id: 'yde-bastos', name: 'Yaounde - Bastos' }
            ],
            'Nigeria': [
                { id: 'lag-ikeja', name: 'Lagos - Ikeja' }
            ]
        };
        
        main.innerHTML = `
            <div class="warehouses-page">
                <div class="page-header">
                    <h1 class="page-title">Entrepots</h1>
                    <button class="btn btn-primary" id="btn-add">Ajouter</button>
                </div>
                
                ${Object.entries(warehouses).map(([country, whs]) => `
                    <div class="card mb-md">
                        <div class="card-header">
                            <h3 class="card-title">${country}</h3>
                        </div>
                        <div class="card-body">
                            <table class="table">
                                <thead><tr><th>ID</th><th>Nom</th><th>Actions</th></tr></thead>
                                <tbody>
                                    ${whs.map(w => `
                                        <tr>
                                            <td><code>${w.id}</code></td>
                                            <td>${w.name}</td>
                                            <td>
                                                <div class="table-actions">
                                                    <button class="btn btn-sm btn-ghost">${Icons.get('edit', {size:14})}</button>
                                                    <button class="btn btn-sm btn-ghost text-error">${Icons.get('trash', {size:14})}</button>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
};
