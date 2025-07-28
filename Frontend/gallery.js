document.addEventListener('DOMContentLoaded', () => {
    const galleryGrid = document.getElementById('gallery-grid');
    const loadingIndicator = document.getElementById('loading-indicator');
    const emptyMessage = document.getElementById('empty-message');
    const clearGalleryBtn = document.getElementById('clear-gallery-btn');
    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const modalCaption = document.getElementById('modal-caption');
    const closeModalBtn = document.querySelector('.close-button');

    const loadGallery = async () => {
        loadingIndicator.style.display = 'block';
        emptyMessage.style.display = 'none';
        galleryGrid.innerHTML = '';

        try {
            // Prioritize fetching over the network. Fallback to Electron IPC for the host.
            let images;
            if (window.electron) {
                images = await window.electron.getGallery();
            } else {
                const response = await fetch('/api/gallery');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                images = await response.json();
            }
            
            if (images.length === 0) {
                emptyMessage.style.display = 'block';
            } else {
                images.forEach(createGalleryCard);
            }
        } catch (error) {
            console.error('Failed to load gallery:', error);
            galleryGrid.innerHTML = '<p>Error loading gallery. Please try again.</p>';
        } finally {
            loadingIndicator.style.display = 'none';
        }
    };

    const createGalleryCard = (image) => {
        const card = document.createElement('div');
        card.className = 'gallery-card';
        card.dataset.id = image.id;

        const imageUrl = image.imageUrl;

        card.innerHTML = `
            <div class="image-container">
                <img src="${imageUrl}" alt="Generated Image" loading="lazy">
            </div>
            <div class="card-content">
                <p class="prompt-text">${escapeHtml(image.prompt)}</p>
                <div class="card-footer">
                    <span class="timestamp">${new Date(image.createdAt).toLocaleString()}</span>
                    <div class="card-actions">
                        <button class="open-folder-btn" title="Show in Folder">📁</button>
                        <button class="delete-btn" title="Delete">🗑️</button>
                    </div>
                </div>
            </div>
        `;

        // Event Listeners
        card.querySelector('img').addEventListener('click', () => openModal(imageUrl, image.prompt));
        card.querySelector('.delete-btn').addEventListener('click', () => deleteImage(image.id));
        card.querySelector('.open-folder-btn').addEventListener('click', () => openImageInFolder(image));

        galleryGrid.appendChild(card);
    };

    const deleteImage = async (id) => {
        if (window.electron && confirm('Are you sure you want to delete this entry? This cannot be undone.')) {
            await window.electron.deleteFromGallery(id);
            document.querySelector(`.gallery-card[data-id='${id}']`).remove();
            if (galleryGrid.children.length === 0) {
                emptyMessage.style.display = 'block';
            }
        } else if (!window.electron) {
            alert("Deletion is only available when running the app on the host machine.");
        }
    };
    
    const openImageInFolder = (image) => {
        if (window.electron) {
            window.electron.openImageFolder(image);
        } else {
            alert("Opening the folder is only available on the host machine.");
        }
    };

    const clearGallery = async () => {
        if (window.electron && confirm('Are you sure you want to delete ALL entries from the gallery? This is permanent.')) {
            await window.electron.clearGallery();
            loadGallery();
        } else if (!window.electron) {
            alert("Clearing the gallery is only available on the host machine.");
        }
    };

    const openModal = (src, caption) => {
        modalImage.src = src;
        modalCaption.textContent = caption;
        modal.style.display = 'flex';
    };

    const closeModal = () => {
        modal.style.display = 'none';
    };

    // Utility to prevent XSS
    const escapeHtml = (unsafe) => {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

    // Initial Load & Event Listeners
    loadGallery();
    clearGalleryBtn.addEventListener('click', clearGallery);
    closeModalBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
});
