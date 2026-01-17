class SimpleManualViewer {
    constructor() {
        this.pages = [];
        this.tocData = [];
        this.currentPage = null;
        this.navigationOpen = false;
        
        // Ensure DOM is ready before initializing
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    init() {
        this.initializeElements();
        this.bindEvents();
        this.loadManualData();
    }

    initializeElements() {
        this.menuBtn = document.getElementById('menuBtn');
        this.navDropdown = document.getElementById('navDropdown');
        this.tocContainer = document.getElementById('tocContainer');
        this.contentArea = document.getElementById('contentArea');
        this.pageInfo = document.getElementById('pageInfo');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
    }

    bindEvents() {
        // Menu toggle
        this.menuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleNavigation();
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.navDropdown.contains(e.target) && !this.menuBtn.contains(e.target)) {
                this.closeNavigation();
            }
        });

        // Navigation buttons
        this.prevBtn.addEventListener('click', () => this.navigatePrevious());
        this.nextBtn.addEventListener('click', () => this.navigateNext());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.currentPage !== null) {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.navigatePrevious();
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.navigateNext();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeNavigation();
                }
            }
        });

        // Mouse wheel navigation
        this.contentArea.addEventListener('wheel', (e) => {
            // Only handle wheel events when a page is displayed and navigation is closed
            if (this.currentPage !== null && !this.navigationOpen) {
                e.preventDefault(); // Prevent default scrolling
                
                // Throttle wheel events to prevent too rapid navigation
                const now = Date.now();
                if (!this.lastWheelTime || now - this.lastWheelTime > 300) {
                    this.lastWheelTime = now;
                    
                    // Small delay to allow for smoother experience
                    setTimeout(() => {
                        // Determine scroll direction
                        if (e.deltaY > 0) {
                            // Scrolling down - go to next page
                            this.navigateNext();
                        } else {
                            // Scrolling up - go to previous page
                            this.navigatePrevious();
                        }
                    }, 50);
                }
            }
        });

        // Touch/swipe support
        this.setupTouchEvents();
    }

    async loadManualData() {
        try {
            await this.loadTableOfContents();
            this.generatePageList();
            this.buildTableOfContents();
        } catch (error) {
            console.error('Error loading manual data:', error);
            this.showError('Fejl ved indlæsning af manual data');
        }
    }

    async loadTableOfContents() {
        try {
            const tocUrl = window.MANUAL_CONFIG?.tocCsvUrl || 'data/toc.csv';
            const response = await fetch(tocUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const csvText = await response.text();
            this.tocData = this.parseCSV(csvText);
        } catch (error) {
            console.error('Error loading table of contents:', error);
            this.tocData = [];
        }
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        return lines.map(line => {
            const [pageNum, title] = line.split(';');
            return {
                page: pageNum?.trim(),
                title: title?.trim()
            };
        }).filter(item => item.page && item.title);
    }

    generatePageList() {
        // Generate pages based on available PNG files
        if (this.tocData.length > 0) {
            const maxPage = Math.max(...this.tocData.map(item => parseInt(item.page)));
            this.pages = [];
            
            for (let i = 1; i <= maxPage; i++) {
                const pageNum = i.toString().padStart(2, '0');
                this.pages.push({
                    id: i - 1,
                    page: pageNum,
                    filename: `${window.MANUAL_CONFIG.manualId}-${pageNum}`,
                    imagePath: `pages/${window.MANUAL_CONFIG.manualId}/${window.MANUAL_CONFIG.manualId}-${pageNum}.png`
                });
            }
        }
    }

    buildTableOfContents() {
        if (!this.tocContainer) return;

        let tocHTML = '<div class="toc-section">';
        tocHTML += '<h3>Indholdsfortegnelse</h3>';
        
        // Add back link
        tocHTML += '<div class="toc-back-link">';
        tocHTML += '<a href="index.html" class="toc-back-btn">← Tilbage til hovedside</a>';
        tocHTML += '</div>';
        
        tocHTML += '<div class="toc-list">';
        
        this.tocData.forEach(item => {
            const pageIndex = this.pages.findIndex(p => parseInt(p.page) === parseInt(item.page));
            if (pageIndex !== -1) {
                tocHTML += `<div class="toc-item" data-page="${pageIndex}">`;
                tocHTML += `<span class="toc-title">${item.title}</span>`;
                tocHTML += '</div>';
            }
        });
        
        tocHTML += '</div></div>';
        this.tocContainer.innerHTML = tocHTML;

        // Bind click events to TOC items
        this.tocContainer.addEventListener('click', (e) => {
            const tocItem = e.target.closest('.toc-item');
            if (tocItem) {
                const pageIndex = parseInt(tocItem.dataset.page);
                this.goToPage(pageIndex);
                this.closeNavigation();
            }
        });
    }

    toggleNavigation() {
        this.navigationOpen = !this.navigationOpen;
        this.navDropdown.style.display = this.navigationOpen ? 'block' : 'none';
        this.menuBtn.classList.toggle('active', this.navigationOpen);
    }

    closeNavigation() {
        this.navigationOpen = false;
        this.navDropdown.style.display = 'none';
        this.menuBtn.classList.remove('active');
    }

    goToPage(pageIndex) {
        if (pageIndex < 0 || pageIndex >= this.pages.length) return;
        
        this.currentPage = pageIndex;
        const page = this.pages[pageIndex];
        
        this.displayPage(page);
        this.updateNavigationButtons();
        this.updatePageInfo();
    }

    displayPage(page) {
        this.contentArea.innerHTML = `
            <div class="page-container">
                <img src="${page.imagePath}" alt="Side ${page.page}" class="page-image" 
                     onerror="this.src='img/page-not-found.png'; this.alt='Side ikke fundet';">
            </div>
        `;
    }

    updateNavigationButtons() {
        this.prevBtn.disabled = this.currentPage <= 0;
        this.nextBtn.disabled = this.currentPage >= this.pages.length - 1;
    }

    updatePageInfo() {
        if (this.currentPage !== null && this.pages[this.currentPage]) {
            const page = this.pages[this.currentPage];
            const currentPageNum = parseInt(page.page);
            
            // Find the closest TOC heading for this page
            let closestHeading = '';
            let closestPage = -1;
            
            for (const tocItem of this.tocData) {
                const tocPageNum = parseInt(tocItem.page);
                if (tocPageNum <= currentPageNum && tocPageNum > closestPage) {
                    closestPage = tocPageNum;
                    closestHeading = tocItem.title;
                }
            }
            
            let pageInfoText = `Side ${page.page} af ${this.pages.length}`;
            if (closestHeading) {
                pageInfoText += ` • ${closestHeading}`;
            }
            
            this.pageInfo.textContent = pageInfoText;
        }
    }

    navigatePrevious() {
        if (this.currentPage > 0) {
            this.goToPage(this.currentPage - 1);
        }
    }

    navigateNext() {
        if (this.currentPage < this.pages.length - 1) {
            this.goToPage(this.currentPage + 1);
        }
    }

    setupTouchEvents() {
        let startX = null;
        let startY = null;

        this.contentArea.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        });

        this.contentArea.addEventListener('touchend', (e) => {
            if (!startX || !startY) return;

            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            const diffX = startX - endX;
            const diffY = startY - endY;

            // Only handle horizontal swipes that are more horizontal than vertical
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                if (diffX > 0) {
                    // Swipe left - go to next page
                    this.navigateNext();
                } else {
                    // Swipe right - go to previous page
                    this.navigatePrevious();
                }
            }

            startX = null;
            startY = null;
        });
    }

    showError(message) {
        this.contentArea.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-title">Fejl</div>
                <p>${message}</p>
            </div>
        `;
    }

    // Cleanup method to prevent memory leaks
    destroy() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('click', this.handleClickOutside);
    }
}

// Initialize the manual viewer when the script loads
new SimpleManualViewer();