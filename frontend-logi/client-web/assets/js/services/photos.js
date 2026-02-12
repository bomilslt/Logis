/**
 * Photos Service - Gestion des photos de colis
 */

const PhotosService = {
    MAX_PHOTOS: 5,
    MAX_SIZE_MB: 2,
    QUALITY: 0.8,
    
    /**
     * Compresser une image
     */
    async compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    // Redimensionner si trop grand
                    const maxDim = 1200;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = (height / width) * maxDim;
                            width = maxDim;
                        } else {
                            width = (width / height) * maxDim;
                            height = maxDim;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const dataUrl = canvas.toDataURL('image/jpeg', this.QUALITY);
                    resolve(dataUrl);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
    
    /**
     * Valider un fichier
     */
    validateFile(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        
        if (!validTypes.includes(file.type)) {
            return { valid: false, error: 'Format non supporte. Utilisez JPG, PNG ou WebP.' };
        }
        
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > this.MAX_SIZE_MB) {
            return { valid: false, error: `Fichier trop volumineux. Max ${this.MAX_SIZE_MB}MB.` };
        }
        
        return { valid: true };
    },
    
    /**
     * Traiter plusieurs fichiers
     */
    async processFiles(files, existingCount = 0) {
        const results = [];
        const errors = [];
        
        const remaining = this.MAX_PHOTOS - existingCount;
        const toProcess = Array.from(files).slice(0, remaining);
        
        for (const file of toProcess) {
            const validation = this.validateFile(file);
            if (!validation.valid) {
                errors.push({ file: file.name, error: validation.error });
                continue;
            }
            
            try {
                const dataUrl = await this.compressImage(file);
                results.push({
                    id: 'photo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    dataUrl: dataUrl,
                    size: file.size
                });
            } catch (e) {
                errors.push({ file: file.name, error: 'Erreur de traitement' });
            }
        }
        
        if (files.length > remaining) {
            errors.push({ 
                file: null, 
                error: `Maximum ${this.MAX_PHOTOS} photos. ${files.length - remaining} fichier(s) ignore(s).` 
            });
        }
        
        return { photos: results, errors };
    },
    
    /**
     * Creer le composant d'upload
     */
    createUploadComponent(container, options = {}) {
        const { onPhotosChange, initialPhotos = [] } = options;
        let photos = [...initialPhotos];
        
        const render = () => {
            container.innerHTML = `
                <div class="photo-upload">
                    <div class="photo-grid">
                        ${photos.map((photo, index) => `
                            <div class="photo-item" data-index="${index}">
                                <img src="${photo.dataUrl}" alt="${photo.name}">
                                <button type="button" class="photo-remove" data-index="${index}">
                                    ${Icons.get('x', { size: 16 })}
                                </button>
                            </div>
                        `).join('')}
                        ${photos.length < this.MAX_PHOTOS ? `
                            <label class="photo-add">
                                <input type="file" accept="image/*" multiple hidden>
                                ${Icons.get('camera', { size: 24 })}
                                <span>Ajouter</span>
                            </label>
                        ` : ''}
                    </div>
                    <p class="photo-hint">${photos.length}/${this.MAX_PHOTOS} photos (optionnel)</p>
                </div>
            `;
            
            // Event: Ajouter photos
            const input = container.querySelector('input[type="file"]');
            if (input) {
                input.addEventListener('change', async (e) => {
                    const { photos: newPhotos, errors } = await this.processFiles(e.target.files, photos.length);
                    
                    if (errors.length > 0) {
                        errors.forEach(err => {
                            if (err.error) Toast.error(err.error);
                        });
                    }
                    
                    if (newPhotos.length > 0) {
                        photos = [...photos, ...newPhotos];
                        render();
                        if (onPhotosChange) onPhotosChange(photos);
                    }
                    
                    input.value = '';
                });
            }
            
            // Event: Supprimer photo
            container.querySelectorAll('.photo-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const index = parseInt(btn.dataset.index);
                    photos.splice(index, 1);
                    render();
                    if (onPhotosChange) onPhotosChange(photos);
                });
            });
        };
        
        render();
        
        return {
            getPhotos: () => photos,
            setPhotos: (newPhotos) => {
                photos = newPhotos;
                render();
            },
            clear: () => {
                photos = [];
                render();
                if (onPhotosChange) onPhotosChange(photos);
            }
        };
    }
};
