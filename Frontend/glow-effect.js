// This function will attach the glowing border effect to specified elements.
function initializeGlowEffect() {
    // We select all elements that should have the glow effect.
    // This selector will work on both index.html and settings.html.
    const glowElements = document.querySelectorAll('.tool-card, .settings-link');

    if (glowElements.length > 0) {
        console.log(`[Glow Effect] Initializing for ${glowElements.length} elements.`);
        
        glowElements.forEach(card => {
            card.addEventListener('mousemove', e => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);
            });
        });
    }
}

// We wait for the DOM to be fully loaded before trying to find the elements.
// This ensures the script runs reliably on every page load.
document.addEventListener('DOMContentLoaded', initializeGlowEffect);