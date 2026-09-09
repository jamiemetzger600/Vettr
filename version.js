// Central Version Management
// Single source of truth for extension version
// Update this file and run update-version.sh to propagate changes

(function() {
    const VERSION = '5.0.30';
    
    // Export for different module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { VERSION };
    }
    
    // Export for browser/window
    if (typeof window !== 'undefined') {
        window.EXTENSION_VERSION = VERSION;
    }
    
    // Log version on load for debugging
    console.log(`📦 Vettr Version: ${VERSION}`);
})();
