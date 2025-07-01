// src/config.js

/**
 * Load configuration from server-config.json
 * @returns {Promise<Object>} Configuration object
 */
export async function loadConfiguration() {
    try {
        const response = await fetch('server-config.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const config = await response.json();
        console.log('Configuration loaded:', config);
        return config;
    } catch (error) {
        console.error('Failed to load configuration:', error);
        // Provide a default configuration as a fallback
        return {
            gridSize: { default: 25, min: 10, max: 50 },
            generation: {
                mode: 'maxOverlap',
                enforceAllWords: true,
                maxAttempts: 1000,
                timeoutSeconds: 10,
            },
            presets: {},
        };
    }
}
