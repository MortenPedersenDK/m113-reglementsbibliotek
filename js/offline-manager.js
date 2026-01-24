/**
 * Offline Manager for PMV M113 Reglementsbibliotek
 * Handles selective manual caching and offline functionality
 */

class OfflineManager {
    constructor() {
        this.swRegistration = null;
        this.serviceWorkerFailed = false;
        this.isOnline = navigator.onLine;
        this.offlineManuals = new Set();
        this.pendingDownloads = new Set();
        this.lastUpdateCheck = 0; // Track when we last checked for updates
        
        // Mark that offline manager is initializing
        window.offlineManager = null; // Set to null to indicate loading
        
        this.init();
    }

    async init() {
        // Log environment information for debugging
        this.logEnvironmentInfo();
        
        // DEBUG: Check for duplicate elements
        setTimeout(() => {
            console.log('DEBUG: Checking for duplicate connection status elements...');
            
            const elements = document.querySelectorAll('#connection-status');
            console.log('DEBUG: Found', elements.length, 'elements with id="connection-status"');
            elements.forEach((el, index) => {
                console.log(`DEBUG: Element ${index}:`, el.outerHTML);
                console.log(`DEBUG: Element ${index} parent:`, el.parentElement.outerHTML);
            });

            // Also check for class
            const byClass = document.querySelectorAll('.connection-status');
            console.log('DEBUG: Found', byClass.length, 'elements with class="connection-status"');
            byClass.forEach((el, index) => {
                console.log(`DEBUG: Element ${index}:`, el.outerHTML);
            });
            
            // Check if any elements are visually duplicated due to CSS
            const allOnlineText = document.querySelectorAll('*');
            let onlineCount = 0;
            allOnlineText.forEach(el => {
                if (el.textContent && el.textContent.includes('Online') && el.textContent.trim() === 'Online') {
                    onlineCount++;
                    console.log('DEBUG: Found "Online" text in:', el.tagName, el.className, el.id, el.outerHTML);
                }
            });
            console.log('DEBUG: Total elements containing "Online" text:', onlineCount);
        }, 1000);
        
        // Register service worker with iOS-specific handling
        if ('serviceWorker' in navigator) {
            try {
                // Check if we're in a context where service workers work (not private browsing on iOS)
                if (navigator.serviceWorker.controller === null && !window.isSecureContext) {
                    throw new Error('Service workers require HTTPS or localhost');
                }

                this.swRegistration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered successfully');
                
                // Wait for service worker to become ready (especially important on iOS/Safari)
                await this.waitForServiceWorkerReady();
                
                // Listen for service worker updates
                this.swRegistration.addEventListener('updatefound', () => {
                    this.handleServiceWorkerUpdate();
                });
                
            } catch (error) {
                console.error('Service Worker registration failed:', error);
                // Only show error for offline functionality, not for basic reload
                this.serviceWorkerFailed = true;
                this.handleServiceWorkerError(error);
            }
        } else {
            console.warn('Service Workers are not supported in this browser');
            this.handleServiceWorkerUnsupported();
        }

        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.onOnlineStatusChanged(true);
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.onOnlineStatusChanged(false);
        });

        // Load existing offline manuals
        await this.loadOfflineManuals();
        
        // Set initial online status and reload link visibility
        this.onOnlineStatusChanged(this.isOnline);
        
        // Ensure connection status is never overwritten by offline button status
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            // Create a mutation observer to prevent unwanted status changes
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' || mutation.type === 'characterData') {
                        // If someone tries to set it to "Offline N/A", restore correct status
                        if (statusElement.textContent === 'Offline N/A') {
                            console.warn('Detected "Offline N/A" in connection status - correcting...');
                            this.onOnlineStatusChanged(this.isOnline);
                        }
                    }
                });
            });
            observer.observe(statusElement, { childList: true, subtree: true, characterData: true });
        }
        
        // Check for updates if online
        if (this.isOnline) {
            setTimeout(() => this.checkForUpdates(), 5000); // Check after 5 seconds
        }
        
        // Mark that offline manager is now ready
        window.offlineManager = this;
        console.log('OfflineManager initialization completed');
    }

    // Download a manual for offline use
    async downloadManual(manualId) {
        if (this.pendingDownloads.has(manualId)) {
            console.log(`Download already in progress for ${manualId}`);
            return false;
        }

        // Check if service worker is available before attempting download
        if (this.serviceWorkerFailed || !this.swRegistration) {
            this.showOfflineUnavailableError();
            return false;
        }

        this.pendingDownloads.add(manualId);
        
        try {
            // Show loading state
            this.updateManualUI(manualId, 'downloading');
            
            // Get all required files for this manual
            const files = await this.getManualFiles(manualId);
            
            // Send message to service worker to cache the manual
            const result = await this.sendMessageToSW('cache-manual', { 
                manualId, 
                files 
            });

            if (result.success) {
                this.offlineManuals.add(manualId);
                this.saveOfflineManuals();
                this.updateManualUI(manualId, 'offline');
                this.showNotification(`${manualId} er nu tilgængelig offline (${result.fileCount} sider)`, 'success');
                return true;
            } else {
                throw new Error(result.error || 'Failed to cache manual');
            }

        } catch (error) {
            console.error(`Failed to download manual ${manualId}:`, error);
            
            // Provide more specific error messages
            let userMessage = `Kunne ikke downloade ${manualId}`;
            
            if (error.message.includes('Service worker not available') || 
                error.message.includes('Service Worker not registered')) {
                
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                if (isIOS) {
                    userMessage += ': Service worker ikke tilgængelig. Prøv at:\n• Genindlæse siden\n• Sikre du ikke er i Private Browsing mode\n• Opdatere Safari til seneste version';
                } else {
                    userMessage += ': Service worker ikke tilgængelig. Prøv at genindlæse siden.';
                }
            } else if (error.message.includes('timeout')) {
                userMessage += ': Forbindelsen fik timeout. Tjek din internetforbindelse og prøv igen.';
            } else if (error.message.includes('fetch')) {
                userMessage += ': Kunne ikke hente filer. Tjek din internetforbindelse.';
            } else {
                userMessage += `: ${error.message}`;
            }
            
            this.showNotification(userMessage, 'error');
            this.updateManualUI(manualId, 'online');
            return false;
            
        } finally {
            this.pendingDownloads.delete(manualId);
        }
    }

    // Show offline unavailable error when user tries to download
    showOfflineUnavailableError() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        let message = 'Offline funktionalitet er ikke tilgængelig';
        
        if (isIOS) {
            message += '. Sikre dig at du ikke er i Private Browsing mode og prøv at genindlæse siden.';
        } else {
            message += '. Prøv at genindlæse siden.';
        }
        
        this.showNotification(message, 'error');
    }

    // Remove a manual from offline storage
    async removeManual(manualId) {
        if (this.pendingDownloads.has(manualId)) {
            console.log(`Download in progress for ${manualId}, cannot remove`);
            return false;
        }

        try {
            const result = await this.sendMessageToSW('remove-manual', { manualId });

            if (result.success) {
                this.offlineManuals.delete(manualId);
                this.saveOfflineManuals();
                this.updateManualUI(manualId, 'online');
                this.showNotification(`${manualId} er ikke længere tilgængelig offline`, 'info');
                return true;
            } else {
                throw new Error(result.error || 'Failed to remove manual');
            }

        } catch (error) {
            console.error(`Failed to remove manual ${manualId}:`, error);
            this.showNotification(`Kunne ikke fjerne ${manualId}: ${error.message}`, 'error');
            return false;
        }
    }

    // Toggle offline status for a manual
    async toggleOfflineStatus(manualId) {
        if (this.offlineManuals.has(manualId)) {
            return await this.removeManual(manualId);
        } else {
            return await this.downloadManual(manualId);
        }
    }

    // Get all files needed for a manual
    async getManualFiles(manualId) {
        const files = [];
        
        try {
            // Get the search index to find all page files
            const searchIndexResponse = await fetch(`/data/${manualId}-search-index.json`);
            if (searchIndexResponse.ok) {
                const searchIndex = await searchIndexResponse.json();
                
                // Extract unique image paths from the pages array
                const uniquePaths = new Set();
                searchIndex.pages.forEach(page => {
                    if (page.imagePath) {
                        uniquePaths.add(`/${page.imagePath}`);
                    }
                });
                
                files.push(...Array.from(uniquePaths));
                console.log(`Found ${files.length} page images for ${manualId}`);
            } else {
                console.warn(`Could not load search index for ${manualId}`);
            }
            
        } catch (error) {
            console.warn(`Could not get page files for ${manualId}:`, error);
        }

        // If we couldn't get files from search index, try to estimate from known patterns
        if (files.length === 0) {
            console.log(`Attempting to estimate page files for ${manualId}`);
            
            // Try to fetch a few known page patterns to see what exists
            const possiblePages = [];
            
            // For HRN113-001, HRN113-002 format
            if (manualId.startsWith('HRN113-')) {
                for (let i = 1; i <= 400; i++) {
                    const pageNum = i.toString().padStart(2, '0');
                    for (let chapter = 1; chapter <= 9; chapter++) {
                        possiblePages.push(`/pages/${manualId}/HRN113_${chapter}-${pageNum}.png`);
                    }
                    // Add appendix pages
                    for (let appendix of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) {
                        possiblePages.push(`/pages/${manualId}/HRN113_${appendix}-${pageNum}.png`);
                        possiblePages.push(`/pages/${manualId}/HRN113_${appendix}-${i}.png`);
                    }
                }
            }
            
            // For HRN737 format
            if (manualId.startsWith('HRN737-')) {
                for (let i = 1; i <= 200; i++) {
                    const pageNum = i.toString().padStart(2, '0');
                    possiblePages.push(`/pages/${manualId}/${manualId}-${pageNum}.png`);
                }
            }
            
            // Test which pages actually exist (sample first 50)
            const testPages = possiblePages.slice(0, 50);
            for (const page of testPages) {
                try {
                    const response = await fetch(page, { method: 'HEAD' });
                    if (response.ok) {
                        files.push(page);
                    }
                } catch (e) {
                    // Page doesn't exist, continue
                }
            }
        }

        return files;
    }

    // Wait for service worker to become ready (especially important on iOS/Safari)
    async waitForServiceWorkerReady() {
        if (!this.swRegistration) {
            throw new Error('No service worker registration');
        }

        // If already active, return immediately
        if (this.swRegistration.active) {
            return this.swRegistration.active;
        }

        // If installing, wait for it to become active
        if (this.swRegistration.installing) {
            await new Promise((resolve) => {
                this.swRegistration.installing.addEventListener('statechange', () => {
                    if (this.swRegistration.installing.state === 'activated') {
                        resolve();
                    }
                });
            });
        }

        // Wait up to 15 seconds for service worker to become ready on iOS, 10 seconds on others
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const timeout = isIOS ? 15000 : 10000;
        const startTime = Date.now();
        
        while (!this.swRegistration.active && (Date.now() - startTime) < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!this.swRegistration.active) {
            const message = isIOS ? 'Service worker failed to become active within timeout on iOS. This may be due to Private Browsing mode or iOS limitations.' : 'Service worker failed to become active within timeout';
            console.warn(message);
            // Don't throw on iOS, as service workers have limitations
            if (!isIOS) {
                throw new Error(message);
            }
            return false; // Return false on iOS timeout instead of throwing
        }

        console.log('Service Worker is ready');
        return this.swRegistration.active;
    }

    // Send message to service worker and wait for response
    sendMessageToSW(action, data = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                // Ensure service worker is ready before sending message
                if (!this.swRegistration) {
                    throw new Error('Service Worker not registered');
                }

                // Wait for service worker to be active (with timeout)
                await this.waitForServiceWorkerReady();

                const messageChannel = new MessageChannel();
                
                messageChannel.port1.onmessage = (event) => {
                    resolve(event.data);
                };

                // Add timeout for the message response
                const timeout = setTimeout(() => {
                    reject(new Error('Service Worker response timeout'));
                }, 30000); // 30 seconds

                messageChannel.port1.onmessage = (event) => {
                    clearTimeout(timeout);
                    resolve(event.data);
                };

                this.swRegistration.active.postMessage({
                    action,
                    ...data
                }, [messageChannel.port2]);

            } catch (error) {
                reject(new Error(`Service worker not available: ${error.message}`));
            }
        });
    }

    // Load offline manuals from localStorage and service worker
    async loadOfflineManuals() {
        // Load from localStorage first
        const stored = localStorage.getItem('offlineManuals');
        if (stored) {
            try {
                const manuals = JSON.parse(stored);
                this.offlineManuals = new Set(manuals);
            } catch (error) {
                console.warn('Could not parse stored offline manuals:', error);
            }
        }

        // Verify with service worker
        try {
            const result = await this.sendMessageToSW('get-offline-manuals');
            if (result.success) {
                const actualOffline = new Set(result.manuals.map(m => m.id));
                this.offlineManuals = actualOffline;
                this.saveOfflineManuals();
            }
        } catch (error) {
            console.warn('Could not verify offline manuals with service worker:', error);
        }

        // Update UI for all manuals
        this.updateAllManualUIs();
    }

    // Save offline manuals to localStorage
    saveOfflineManuals() {
        localStorage.setItem('offlineManuals', JSON.stringify(Array.from(this.offlineManuals)));
    }

    // Update UI for a specific manual
    updateManualUI(manualId, status) {
        // Update front page checkboxes (if they exist)
        const checkbox = document.querySelector(`[data-manual-id="${manualId}"] .offline-checkbox`);
        const label = document.querySelector(`[data-manual-id="${manualId}"] .offline-label`);
        
        if (checkbox && label) {
            switch (status) {
                case 'downloading':
                    checkbox.checked = false;
                    checkbox.disabled = true;
                    label.textContent = 'Downloader...';
                    label.classList.add('downloading');
                    label.classList.remove('offline');
                    break;
                    
                case 'offline':
                    checkbox.checked = true;
                    checkbox.disabled = false;
                    label.textContent = 'Tilgængelig offline';
                    label.classList.remove('downloading');
                    label.classList.add('offline');
                    break;
                    
                case 'online':
                default:
                    checkbox.checked = false;
                    checkbox.disabled = false;
                    label.textContent = 'Tilgængelig offline';
                    label.classList.remove('downloading', 'offline');
                    break;
            }
        }
        
        // Update manual page offline button (if we're on that page)
        const offlineButton = document.querySelector(`#offlineBtn[data-manual-id="${manualId}"]`);
        if (offlineButton) {
            switch (status) {
                case 'downloading':
                    offlineButton.textContent = '⏳ Downloader...';
                    offlineButton.className = 'offline-btn downloading';
                    offlineButton.disabled = true;
                    break;
                    
                case 'offline':
                    offlineButton.textContent = '✓ Offline';
                    offlineButton.className = 'offline-btn offline';
                    offlineButton.disabled = false;
                    offlineButton.title = 'Klik for at fjerne offline adgang';
                    break;
                    
                case 'online':
                default:
                    offlineButton.textContent = '⬇ Offline';
                    offlineButton.className = 'offline-btn';
                    offlineButton.disabled = false;
                    offlineButton.title = 'Klik for at downloade til offline brug';
                    break;
            }
        }
        
        // Notify manual viewer app if it exists
        if (window.app && typeof window.app.updateOfflineButtonStatus === 'function') {
            window.app.updateOfflineButtonStatus();
        }
    }
    }

    // Update UI for all manuals
    updateAllManualUIs() {
        const manualCards = document.querySelectorAll('[data-manual-id]');
        manualCards.forEach(card => {
            const manualId = card.getAttribute('data-manual-id');
            const status = this.offlineManuals.has(manualId) ? 'offline' : 'online';
            this.updateManualUI(manualId, status);
        });
    }

    // Handle online/offline status changes
    onOnlineStatusChanged(isOnline) {
        const statusElement = document.getElementById('connection-status');
        const reloadLink = document.getElementById('reload-link');
        
        console.log('Network status changed to:', isOnline ? 'Online' : 'Offline');
        console.log('Status element found:', statusElement ? 'Yes' : 'No');
        
        if (statusElement) {
            // Clear any existing classes and set the correct ones
            statusElement.className = '';
            statusElement.textContent = isOnline ? 'Online' : 'Offline';
            statusElement.className = isOnline ? 'status-online' : 'status-offline';
            console.log('Status element updated to:', statusElement.textContent, 'with class:', statusElement.className);
        } else {
            console.warn('connection-status element not found in DOM!');
        }

        if (reloadLink) {
            if (isOnline) {
                reloadLink.classList.add('visible');
            } else {
                reloadLink.classList.remove('visible');
            }
        }

        if (isOnline) {
            // Check for updates when coming back online
            setTimeout(() => this.checkForUpdates(), 2000);
        }
    }

    // Check for application updates
    async checkForUpdates() {
        if (!this.isOnline) return;

        // Rate limit: only check once per hour
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        if (this.lastUpdateCheck && (now - this.lastUpdateCheck) < oneHour) {
            console.log('Update check skipped - checked recently');
            return;
        }

        this.lastUpdateCheck = now;

        try {
            const result = await this.sendMessageToSW('check-version');
            if (result.success && result.hasUpdate) {
                console.log('Update available:', result.latestVersion);
                this.showUpdateAvailable(result.latestVersion, result.updateInfo);
            } else {
                console.log('No update available');
            }
        } catch (error) {
            console.log('Could not check for updates:', error);
        }
    }

    // Show update available notification
    showUpdateAvailable(version, updateInfo) {
        // Use notification instead of blocking confirm dialog
        this.showNotification(
            `En ny version (${version}) er tilgængelig. Klik "Genindlæs" for at opdatere.`,
            'info'
        );
        
        // Make the reload link more prominent when update is available
        const reloadLink = document.getElementById('reload-link');
        if (reloadLink) {
            reloadLink.classList.add('update-available');
            reloadLink.title = `Opdater til version ${version}`;
        }
    }

    // Perform application update
    async performUpdate() {
        try {
            this.showNotification('Genindlæser siden...', 'info');
            
            // Check if service worker is available and working
            if (this.swRegistration && this.swRegistration.active && !this.serviceWorkerFailed) {
                try {
                    // First try to update the service worker
                    await this.swRegistration.update();
                    console.log('Service worker updated successfully');
                    
                    // If there's a waiting service worker, activate it
                    if (this.swRegistration.waiting) {
                        this.swRegistration.waiting.postMessage({ action: 'skipWaiting' });
                        console.log('Activated waiting service worker');
                    }
                } catch (swError) {
                    console.warn('Service worker update failed, proceeding with cache clear:', swError);
                }
            } else {
                console.log('Service worker not available, performing simple reload');
            }
            
            // Clear all caches to force fresh content (works even without service worker)
            if ('caches' in window) {
                try {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                    console.log('All caches cleared successfully');
                } catch (cacheError) {
                    console.warn('Failed to clear some caches:', cacheError);
                    // Don't show error to user for cache clearing - just continue with reload
                }
            }
            
            // Always proceed with reload regardless of service worker status
            this.showNotification('Opdaterer siden...', 'info');
            setTimeout(() => {
                // Use location.reload() without parameter for better compatibility
                window.location.reload();
            }, 500);
            
        } catch (error) {
            console.error('Update failed:', error);
            // Don't show the service worker error here - just do a simple reload
            this.showNotification('Opdaterer siden...', 'info');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    }

    // Handle service worker updates
    handleServiceWorkerUpdate() {
        const newWorker = this.swRegistration.installing;
        
        newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                this.showNotification('En ny version er klar til installation', 'info');
            }
        });
    }

    // Log environment information for debugging
    logEnvironmentInfo() {
        const userAgent = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
        const isStandalone = window.navigator.standalone;
        const isSecure = window.isSecureContext;
        const hasServiceWorker = 'serviceWorker' in navigator;
        
        console.log('=== Environment Info ===');
        console.log('User Agent:', userAgent);
        console.log('iOS Device:', isIOS);
        console.log('Safari Browser:', isSafari);
        console.log('Standalone Mode (PWA):', isStandalone);
        console.log('Secure Context (HTTPS):', isSecure);
        console.log('Service Worker Support:', hasServiceWorker);
        console.log('Private Browsing:', this.isPrivateBrowsing());
        console.log('Online Status:', navigator.onLine);
        console.log('========================');
    }

    // Detect private browsing mode (especially important on iOS)
    isPrivateBrowsing() {
        try {
            // Try to use localStorage - it throws in private browsing on iOS
            localStorage.setItem('test-private', 'test');
            localStorage.removeItem('test-private');
            
            // Check for other indicators
            if (window.safari && window.safari.pushNotification) {
                return false; // Not private browsing
            }
            
            // iOS private browsing has limited localStorage
            if (navigator.storage && navigator.storage.estimate) {
                return navigator.storage.estimate().then(estimate => {
                    return estimate.quota < 120000000; // Less than ~120MB indicates private browsing
                });
            }
            
            return false;
            
        } catch (e) {
            // localStorage throws an exception in iOS private browsing
            return true;
        }
    }

    // Handle service worker registration errors (iOS-specific)
    handleServiceWorkerError(error) {
        console.error('Service Worker error:', error);
        
        // Only show notification if this affects user functionality
        // Don't overwhelm user with technical errors during page load
        let shouldShowNotification = false;
        let userMessage = 'Offline funktionalitet er ikke tilgængelig';
        
        // Provide specific guidance for iOS users
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        if (isIOS || isSafari) {
            if (error.message.includes('private browsing') || error.message.includes('private mode')) {
                userMessage += ': Private browsing mode understøttes ikke. Skift til normal browsing mode for offline adgang.';
                shouldShowNotification = true; // This is important for user to know
            } else if (error.message.includes('HTTPS')) {
                userMessage += ': HTTPS påkrævet for offline funktionalitet.';
                shouldShowNotification = true;
            } else {
                // For other iOS errors, just log them and disable offline features quietly
                userMessage += ': Prøv at genindlæse siden eller opdatere Safari.';
                // Only show this if user actually tries to use offline features
                shouldShowNotification = false;
            }
        } else {
            shouldShowNotification = true; // Show for non-iOS browsers
        }
        
        if (shouldShowNotification) {
            this.showNotification(userMessage, 'warning');
        }
        
        this.disableOfflineControls();
    }

    // Handle unsupported service worker
    handleServiceWorkerUnsupported() {
        console.warn('Service Workers not supported');
        this.showNotification('Offline funktionalitet understøttes ikke i denne browser', 'warning');
        this.disableOfflineControls();
    }

    // Disable offline controls when service worker is unavailable
    disableOfflineControls() {
        const offlineControls = document.querySelectorAll('.manual-offline-control');
        offlineControls.forEach(control => {
            control.style.opacity = '0.5';
            control.style.pointerEvents = 'none';
            
            const label = control.querySelector('.offline-label');
            if (label) {
                label.textContent = 'Offline ikke tilgængelig';
            }
        });
    }

    // Show notification to user
    showNotification(message, type = 'info') {
        // Create or get notification container
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.className = 'notification-close';
        closeBtn.onclick = () => notification.remove();
        notification.appendChild(closeBtn);

        // Add to container and auto-remove after 5 seconds
        container.appendChild(notification);
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    // Get storage usage information
    async getStorageInfo() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const estimate = await navigator.storage.estimate();
                return {
                    used: estimate.usage,
                    total: estimate.quota,
                    usedMB: Math.round(estimate.usage / (1024 * 1024)),
                    totalMB: Math.round(estimate.quota / (1024 * 1024)),
                    percentUsed: Math.round((estimate.usage / estimate.quota) * 100)
                };
            } catch (error) {
                console.warn('Could not get storage info:', error);
            }
        }
        return null;
    }

    // Check if manual is available offline
    isManualOffline(manualId) {
        return this.offlineManuals.has(manualId);
    }

    // Get list of offline manuals
    getOfflineManuals() {
        return Array.from(this.offlineManuals);
    }
}

// Initialize offline manager when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.offlineManager = new OfflineManager();
    });
} else {
    window.offlineManager = new OfflineManager();
}