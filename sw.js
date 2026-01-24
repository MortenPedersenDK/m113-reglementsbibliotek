/**
 * Service Worker for PMV M113 Reglementsbibliotek
 * Handles selective offline caching of manuals and update checking
 */

const CACHE_VERSION = '1.0.2';
const CORE_CACHE_NAME = `m113-core-${CACHE_VERSION}`;
const VERSION_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

// Core files that are always cached for offline functionality
const CORE_FILES = [
    './',
    './index.html',
    './css/manual-styles.css',
    './js/app.js',
    './js/offline-manager.js',
    './favicon.svg',
    './favicon-16x16.svg',
    './manifest.json'
];

// Map of manual IDs to their required files
const MANUAL_FILES = {
    'HRN113-001': [
        './HRN113-001.html',
        './data/HRN113-001-search-index.json',
        './data/HRN113-001-toc.json'
    ],
    'HRN113-002': [
        './HRN113-002.html',
        './data/HRN113-002-search-index.json',
        './data/HRN113-002-toc.json'
    ],
    'HRN737-012': [
        './HRN737-012.html',
        './data/HRN737-012-search-index.json',
        './data/HRN737-012-toc.json'
    ],
    'HRN737-018': [
        './HRN737-018.html',
        './data/HRN737-018-search-index.json',
        './data/HRN737-018-toc.json'
    ]
};

// Install event - cache core files immediately
self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CORE_CACHE_NAME).then(cache => {
            console.log('[SW] Caching core files');
            return cache.addAll(CORE_FILES);
        }).then(() => {
            console.log('[SW] Core files cached successfully');
            return self.skipWaiting();
        }).catch(error => {
            console.error('[SW] Failed to cache core files:', error);
        })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Keep current core cache and manual caches, delete others
                    if (cacheName !== CORE_CACHE_NAME && !cacheName.startsWith('manual-')) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Old caches cleaned up');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache when available, network otherwise
self.addEventListener('fetch', event => {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Handle different types of requests
    const url = new URL(event.request.url);
    
    // For manual pages, check if they should be served from cache
    if (url.pathname.endsWith('.html') && !url.pathname.endsWith('/index.html') && url.pathname !== '/') {
        event.respondWith(handleManualRequest(event.request));
        return;
    }

    // For PNG images (manual pages), serve from cache if available
    if (url.pathname.includes('/pages/') && url.pathname.endsWith('.png')) {
        event.respondWith(handleImageRequest(event.request));
        return;
    }

    // For all other requests, use cache-first strategy
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).catch(() => {
                // If offline and no cache, return offline page for HTML requests
                if (event.request.headers.get('accept').includes('text/html')) {
                    return caches.match('./index.html');
                }
            });
        })
    );
});

// Handle manual page requests
async function handleManualRequest(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        return networkResponse;
    } catch (error) {
        // If offline and no cache, redirect to index
        return caches.match('./index.html');
    }
}

// Handle image requests for manual pages
async function handleImageRequest(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        // Don't automatically cache images - only cache when manual is explicitly downloaded
        return networkResponse;
    } catch (error) {
        // Return placeholder or error response when offline
        return new Response('Image not available offline', {
            status: 404,
            statusText: 'Not Found'
        });
    }
}

// Message handler for manual caching requests
self.addEventListener('message', event => {
    const { action, manualId, files } = event.data;

    switch (action) {
        case 'cache-manual':
            event.waitUntil(cacheManual(manualId, files, event.ports[0]));
            break;
            
        case 'remove-manual':
            event.waitUntil(removeManual(manualId, event.ports[0]));
            break;
            
        case 'check-version':
            event.waitUntil(checkForUpdates(event.ports[0]));
            break;
            
        case 'get-offline-manuals':
            event.waitUntil(getOfflineManuals(event.ports[0]));
            break;
            
        case 'skipWaiting':
            // Force activation for iOS/Safari compatibility
            console.log('[SW] Force activating service worker');
            self.skipWaiting();
            break;
            
        default:
            if (event.ports[0]) {
                event.ports[0].postMessage({ error: `Unknown action: ${action}` });
            }
    }
});

// Cache a manual and its associated files
async function cacheManual(manualId, files, port) {
    try {
        const cacheName = `manual-${manualId}`;
        const cache = await caches.open(cacheName);
        
        console.log(`[SW] Caching manual ${manualId}:`, files);
        
        // Add manual HTML file and data files
        const coreFiles = MANUAL_FILES[manualId] || [];
        await cache.addAll(coreFiles);
        
        // Add all page images for this manual
        if (files && files.length > 0) {
            await cache.addAll(files);
        }
        
        // Store metadata about cached manual
        const metadata = {
            id: manualId,
            cachedAt: Date.now(),
            version: CACHE_VERSION,
            fileCount: coreFiles.length + (files ? files.length : 0)
        };
        
        await cache.put(
            `${cacheName}-metadata`, 
            new Response(JSON.stringify(metadata))
        );
        
        console.log(`[SW] Manual ${manualId} cached successfully`);
        port.postMessage({ success: true, manualId, fileCount: metadata.fileCount });
        
    } catch (error) {
        console.error(`[SW] Failed to cache manual ${manualId}:`, error);
        port.postMessage({ success: false, manualId, error: error.message });
    }
}

// Remove a manual from cache
async function removeManual(manualId, port) {
    try {
        const cacheName = `manual-${manualId}`;
        const deleted = await caches.delete(cacheName);
        
        console.log(`[SW] Manual ${manualId} ${deleted ? 'removed' : 'not found'}`);
        port.postMessage({ success: deleted, manualId });
        
    } catch (error) {
        console.error(`[SW] Failed to remove manual ${manualId}:`, error);
        port.postMessage({ success: false, manualId, error: error.message });
    }
}

// Get list of offline manuals
async function getOfflineManuals(port) {
    try {
        const cacheNames = await caches.keys();
        const manualCaches = cacheNames.filter(name => name.startsWith('manual-'));
        const offlineManuals = [];
        
        for (const cacheName of manualCaches) {
            const manualId = cacheName.replace('manual-', '');
            const cache = await caches.open(cacheName);
            const metadataResponse = await cache.match(`${cacheName}-metadata`);
            
            let metadata = { id: manualId, cachedAt: 0, fileCount: 0 };
            if (metadataResponse) {
                metadata = await metadataResponse.json();
            }
            
            offlineManuals.push(metadata);
        }
        
        port.postMessage({ success: true, manuals: offlineManuals });
        
    } catch (error) {
        console.error('[SW] Failed to get offline manuals:', error);
        port.postMessage({ success: false, error: error.message });
    }
}

// Check for updates
async function checkForUpdates(port) {
    try {
        // Check if there's a version.json file to compare against
        const response = await fetch('/version.json?t=' + Date.now());
        if (response.ok) {
            const serverVersion = await response.json();
            port.postMessage({ 
                success: true, 
                hasUpdate: serverVersion.version !== CACHE_VERSION,
                currentVersion: CACHE_VERSION,
                latestVersion: serverVersion.version,
                updateInfo: serverVersion
            });
        } else {
            // No version file available
            port.postMessage({ success: true, hasUpdate: false });
        }
    } catch (error) {
        // Likely offline or no version endpoint
        console.log('[SW] Could not check for updates (likely offline)');
        port.postMessage({ success: false, error: 'Could not check for updates' });
    }
}