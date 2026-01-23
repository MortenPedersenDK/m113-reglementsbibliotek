class ManualViewer {
    constructor() {
        this.pages = [];
        this.searchIndex = null;
        this.tocData = null;
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
        this.searchInput = document.getElementById('searchInput');
        this.clearSearchBtn = document.getElementById('clearSearchBtn');
        this.tocContainer = document.getElementById('tocContainer');
        this.searchResults = document.getElementById('searchResults');
        this.contentArea = document.getElementById('contentArea');
        this.pageInfo = document.getElementById('pageInfo');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.offlineBtn = document.getElementById('offlineBtn');
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

        // Search - add multiple event types for better mobile compatibility
        this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        this.searchInput.addEventListener('keyup', (e) => this.handleSearch(e.target.value));
        this.searchInput.addEventListener('change', (e) => this.handleSearch(e.target.value));
        this.searchInput.addEventListener('focus', () => this.showSearchResults());
        this.searchInput.addEventListener('blur', () => {
            // Delay hiding to allow clicking on results
            setTimeout(() => {
                // Only hide if search results are still visible and no navigation occurred
                if (this.searchResults.style.display !== 'none') {
                    this.hideSearchResults();
                }
            }, 300);
        });
        
        // Additional mobile-specific events
        this.searchInput.addEventListener('touchstart', (e) => {
            // Ensure the input can receive focus on mobile
            e.target.focus();
        });
        
        // Add paste event for mobile copy-paste functionality
        this.searchInput.addEventListener('paste', (e) => {
            setTimeout(() => this.handleSearch(e.target.value), 10);
        });
        
        // Add composition events for mobile keyboards with predictive text
        this.searchInput.addEventListener('compositionend', (e) => {
            this.handleSearch(e.target.value);
        });
        
        // Mobile fallback: periodic check for value changes
        // This handles cases where mobile browsers don't fire standard events
        this.lastSearchValue = '';
        this.searchPollingInterval = setInterval(() => {
            if (this.searchInput && this.searchInput.value !== this.lastSearchValue) {
                this.lastSearchValue = this.searchInput.value;
                this.handleSearch(this.searchInput.value);
            }
        }, 300); // Check every 300ms for better responsiveness
        
        // Clear search
        this.clearSearchBtn.addEventListener('click', () => this.clearSearch());

        // Navigation
        this.prevBtn.addEventListener('click', () => this.navigateToPage(this.currentPage - 1));
        this.nextBtn.addEventListener('click', () => this.navigateToPage(this.currentPage + 1));

        // Offline button
        if (this.offlineBtn) {
            this.offlineBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleOfflineStatus();
            });
            
            // Initialize offline status
            this.updateOfflineButtonStatus();
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Touch gestures for mobile
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;
        let touchStartTime = 0;
        let touchCount = 0;

        this.contentArea.addEventListener('touchstart', (e) => {
            touchCount = e.touches.length;
            // Only track single finger touches for swiping
            if (touchCount === 1) {
                touchStartX = e.changedTouches[0].screenX;
                touchStartY = e.changedTouches[0].screenY;
                touchStartTime = Date.now();
            }
        });

        this.contentArea.addEventListener('touchend', (e) => {
            // Only handle swipe if it was a single finger gesture throughout
            if (touchCount === 1 && e.changedTouches.length === 1) {
                touchEndX = e.changedTouches[0].screenX;
                touchEndY = e.changedTouches[0].screenY;
                const touchEndTime = Date.now();
                this.handleSwipe(touchStartX, touchEndX, touchStartY, touchEndY, touchEndTime - touchStartTime);
            }
            touchCount = 0;
        });

        // Mouse wheel navigation
        this.contentArea.addEventListener('wheel', (e) => {
            // Only handle wheel events when a page is displayed and navigation is closed
            if (this.currentPage !== null && !this.navigationOpen) {
                e.preventDefault(); // Prevent default scrolling
                
                // Shorter throttle for more responsive navigation (300ms)
                const now = Date.now();
                if (!this.lastWheelTime || now - this.lastWheelTime > 300) {
                    this.lastWheelTime = now;
                    
                    // Moderate threshold for good responsiveness
                    const threshold = 30; // Minimum deltaY to trigger navigation
                    
                    // Determine scroll direction
                    if (e.deltaY > threshold) {
                        // Scrolling down - go to next page
                        this.navigateToPage(this.currentPage + 1);
                    } else if (e.deltaY < -threshold) {
                        // Scrolling up - go to previous page
                        this.navigateToPage(this.currentPage - 1);
                    }
                }
            }
        }, { passive: false });

        // Close navigation on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.navigationOpen) {
                this.closeNavigation();
            }
        });
    }

    async loadManualData() {
        try {
            // Load search index and table of contents
            await Promise.all([
                this.loadSearchIndex(),
                this.loadTableOfContents()
            ]);
            
            // Generate page list
            this.generatePageList();
            
            // Build table of contents UI
            this.buildTableOfContents();
            
        } catch (error) {
            console.error('Error loading manual data:', error);
            this.showError('Fejl ved indlæsning af manual data');
        }
    }

    async loadSearchIndex() {
        try {
            const searchIndexUrl = window.MANUAL_CONFIG?.searchIndexUrl || 'data/search-index.json';
            const response = await fetch(searchIndexUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.searchIndex = await response.json();
        } catch (error) {
            console.error('Error loading search index:', error);
            this.searchIndex = { words: {}, pages: [] };
        }
    }

    async loadTableOfContents() {
        try {
            const tocUrl = window.MANUAL_CONFIG?.tocUrl || 'data/toc.json';
            const response = await fetch(tocUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.tocData = await response.json();
        } catch (error) {
            console.error('Error loading table of contents:', error);
            this.tocData = { chapters: {} };
        }
    }

    generatePageList() {
        // Generate pages from the search index data
        if (this.searchIndex && this.searchIndex.pages) {
            this.pages = this.searchIndex.pages.map((page, index) => ({
                id: index,
                ...page
            }));
        } else {
            // Fallback to manual generation if search index is not available
            this.generateFallbackPageList();
        }
    }

    generateFallbackPageList() {
        // Fallback page generation based on known structure
        const chapters = {
            '0': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
            '1': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
            '2': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
            '3': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
            '4': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
            '5': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
            '6': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            '7': [1, 2, 3, 4, 5, 6],
            'A': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            'B': [1, 2],
            'C': [1, 2]
        };

        let pageIndex = 0;
        this.pages = [];
        for (const [chapter, pages] of Object.entries(chapters)) {
            for (const page of pages) {
                const pageNum = page.toString().padStart(2, '0');
                this.pages.push({
                    id: pageIndex++,
                    chapter: chapter,
                    page: pageNum,
                    filename: `HRN113_${chapter}-${pageNum}`,
                    imagePath: `pages/HRN113_${chapter}-${pageNum}.png`
                });
            }
        }
    }

    buildTableOfContents() {
        if (!this.tocData || !this.tocData.chapters) {
            this.tocContainer.innerHTML = '<div class="toc-item">Kunne ikke indlæse indholdsfortegnelse</div>';
            return;
        }

        // Add back to index link at the top
        let tocHtml = `
            <div class="toc-back-to-index">
                <a href="index.html" class="toc-item back-link">
                    <span class="back-arrow">←</span>
                    <span class="back-text">Tilbage til Reglementsbibliotek</span>
                </a>
            </div>
        `;
        
        for (const [chapterKey, chapter] of Object.entries(this.tocData.chapters)) {
            const chapterPageId = this.findPageId(chapter.firstPage || `${chapterKey}-01`);
            const sectionsHtml = (chapter.sections || []).map(section => {
                const sectionPageId = this.findPageId(section.filename);
                return `<div class="toc-item section" onclick="app.navigateToPage(${sectionPageId})">${section.number}. ${section.name}</div>`;
            }).join('');

            tocHtml += `
                <div class="toc-chapter">
                    <div class="toc-item chapter" onclick="app.toggleChapter('${chapterKey}')">
                        <span class="chapter-toggle">▶</span>
                        <span class="chapter-title">${chapter.name}</span>
                    </div>
                    <div class="toc-sections" id="chapter-${chapterKey}" style="display: none;">
                        ${sectionsHtml}
                    </div>
                </div>
            `;
        }

        this.tocContainer.innerHTML = tocHtml;
    }

    toggleChapter(chapterKey) {
        const sectionsContainer = document.getElementById(`chapter-${chapterKey}`);
        if (!sectionsContainer) return;
        
        // Check if this chapter has sections
        const chapter = this.tocData?.chapters?.[chapterKey];
        if (!chapter || !chapter.sections || chapter.sections.length === 0) {
            // No sections - navigate directly to first page
            const firstPageId = this.findPageId(chapter.firstPage || `${chapterKey}-01`);
            if (firstPageId !== null) {
                this.navigateToPage(firstPageId);
            }
            return;
        }
        
        const isCurrentlyOpen = sectionsContainer.style.display === 'block';
        
        // First collapse all chapters
        this.collapseAllChapters();
        
        // If the clicked chapter was closed, expand it
        if (!isCurrentlyOpen) {
            this.expandChapter(chapterKey);
        }
    }

    expandChapter(chapterKey) {
        const sectionsContainer = document.getElementById(`chapter-${chapterKey}`);
        if (!sectionsContainer) return;
        
        const toggle = sectionsContainer.previousElementSibling?.querySelector('.chapter-toggle');
        
        sectionsContainer.style.display = 'block';
        if (toggle) {
            toggle.textContent = '▼';
        }
    }

    collapseChapter(chapterKey) {
        const sectionsContainer = document.getElementById(`chapter-${chapterKey}`);
        if (!sectionsContainer) return;
        
        const toggle = sectionsContainer.previousElementSibling?.querySelector('.chapter-toggle');
        
        sectionsContainer.style.display = 'none';
        if (toggle) {
            toggle.textContent = '▶';
        }
    }

    collapseAllChapters() {
        if (!this.tocData || !this.tocData.chapters) return;
        
        // Collapse all chapters
        for (const chapterKey of Object.keys(this.tocData.chapters)) {
            this.collapseChapter(chapterKey);
        }
    }

    // Expand chapter when navigating to a page within it
    expandChapterForPage(pageIndex) {
        if (!this.pages[pageIndex] || !this.tocData || !this.tocData.chapters) return;
        
        const currentChapter = this.pages[pageIndex].chapter;
        
        // First collapse all chapters to maintain accordion behavior
        this.collapseAllChapters();
        
        // Find the chapter key in tocData and expand only the current one
        for (const [chapterKey, chapter] of Object.entries(this.tocData.chapters)) {
            if (chapterKey === currentChapter) {
                this.expandChapter(chapterKey);
                break;
            }
        }
    }

    findPageId(filename) {
        if (!filename) return 0;
        
        // Handle both full filename format (HRN113_X-Y) and short format (X-Y)
        let searchFilename = filename;
        if (!filename.startsWith('HRN113_')) {
            searchFilename = `HRN113_${filename}`;
        }
        
        // Extract chapter and page from filename
        const match = searchFilename.match(/HRN113_(.+)-(.+)/);
        if (!match) return 0;
        
        const chapter = match[1];
        const page = match[2];
        
        const pageIndex = this.pages.findIndex(p => p.chapter === chapter && p.page === page);
        return pageIndex >= 0 ? pageIndex : 0;
    }

    handleSearch(query) {
        // Show/hide clear button
        this.clearSearchBtn.style.display = query.length > 0 ? 'block' : 'none';
        
        if (query.length < 3) {
            this.hideSearchResults();
            return;
        }

        const results = this.search(query);
        this.displaySearchResults(results, query);
    }
    
    clearSearch() {
        this.searchInput.value = '';
        this.clearSearchBtn.style.display = 'none';
        this.hideSearchResults();
    }

    search(query) {
        if (!this.searchIndex || !this.searchIndex.words) {
            return [];
        }

        // Custom regex pattern that includes Danish characters
        const danishWordPattern = /[a-zA-ZæøåÆØÅ]+/g;
        const queryWords = query.toLowerCase().match(danishWordPattern) || [];
        const results = [];
        const pageMatches = {};

        for (const queryWord of queryWords) {
            // Only proceed if query word is at least 3 characters
            if (queryWord.length < 3) continue;
            
            // Find matches with strict criteria
            const indexWords = Object.keys(this.searchIndex.words);
            
            for (const indexWord of indexWords) {
                let scoreBonus = 0;
                
                // Exact word match (highest priority)
                if (indexWord === queryWord) {
                    scoreBonus = 10;
                }
                // Word starts with query (high priority) - but require meaningful length
                else if (indexWord.startsWith(queryWord) && queryWord.length >= 3) {
                    scoreBonus = 6;
                }
                // Query starts with word (medium priority) - require reasonable match
                else if (queryWord.startsWith(indexWord) && indexWord.length >= 3) {
                    scoreBonus = 4;
                }
                // Word contains query - strict requirements
                else if (queryWord.length >= 5 && indexWord.length >= 5 && 
                         indexWord.includes(queryWord) && 
                         queryWord.length >= indexWord.length * 0.6) {
                    scoreBonus = 2;
                }
                // Skip all other matches (too weak/irrelevant)
                else {
                    continue;
                }
                
                const matches = this.searchIndex.words[indexWord] || [];
                
                for (const match of matches) {
                    if (!pageMatches[match.pageId]) {
                        pageMatches[match.pageId] = {
                            ...match,
                            score: 0,
                            matchedWords: [],
                            exactMatches: 0
                        };
                    }
                    
                    pageMatches[match.pageId].score += scoreBonus;
                    pageMatches[match.pageId].matchedWords.push(indexWord);
                    
                    // Track exact matches for better ranking
                    if (scoreBonus >= 10) {
                        pageMatches[match.pageId].exactMatches++;
                    }
                }
            }
        }

        // Convert to array and apply improved sorting
        for (const pageId of Object.keys(pageMatches)) {
            const match = pageMatches[pageId];
            const page = this.pages[pageId];
            if (page && match.score >= 4) { // Pre-filter low scoring results
                // Boost score for pages with multiple exact matches
                const finalScore = match.score + (match.exactMatches * 5);
                
                const context = this.getSearchContext(match.context || '', query);
                
                results.push({
                    ...match,
                    pageId: parseInt(pageId),
                    context: context,
                    displayTitle: `Side ${page.chapter}-${page.page}`,
                    finalScore: finalScore
                });
            }
        }

        // Sort by final score and limit results to top 20 high-quality results
        return results
            .sort((a, b) => b.finalScore - a.finalScore)
            .filter(result => result.finalScore >= 6) // Raise minimum score threshold
            .slice(0, 20);
    }

    getSearchContext(text, query) {
        if (!text) return 'Ingen kontekst tilgængelig';
        
        const queryWords = query.toLowerCase().match(/\w+/g) || [];
        const textLower = text.toLowerCase();
        
        // Find the best position that includes most query words
        let bestIndex = 0;
        let bestScore = 0;
        
        for (let i = 0; i <= text.length - 100; i += 10) {
            const window = textLower.substring(i, i + 100);
            let score = 0;
            
            for (const word of queryWords) {
                if (window.includes(word)) {
                    score++;
                }
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }
        
        // If no good match found, try finding any partial match
        if (bestScore === 0) {
            for (let i = 0; i <= text.length - 100; i += 10) {
                const window = textLower.substring(i, i + 100);
                
                for (const word of queryWords) {
                    for (let j = 0; j < window.length - 2; j++) {
                        if (window.substring(j).includes(word.substring(0, Math.min(3, word.length)))) {
                            bestIndex = i;
                            bestScore = 1;
                            break;
                        }
                    }
                    if (bestScore > 0) break;
                }
                if (bestScore > 0) break;
            }
        }
        
        const start = Math.max(0, bestIndex - 25);
        const end = Math.min(text.length, bestIndex + 125);
        let context = text.substring(start, end);
        
        if (start > 0) context = '...' + context;
        if (end < text.length) context = context + '...';
        
        return context;
    }

    displaySearchResults(results, query) {
        if (results.length === 0) {
            this.searchResults.innerHTML = '<div class="search-result-item">Ingen resultater fundet</div>';
        } else {
            const resultsHtml = results.map((result, index) => {
                const locationInfo = this.getLocationInfo(result.pageId);
                return `
                    <div class="search-result-item" data-page-id="${result.pageId}" data-result-index="${index}">
                        <div class="search-result-context">${this.highlightText(result.context, query)}</div>
                        <div class="search-result-title">${locationInfo}</div>
                    </div>
                `;
            }).join('');
            
            this.searchResults.innerHTML = resultsHtml;
            
            // Add event listeners to search result items
            this.bindSearchResultEvents();
        }
        
        this.showSearchResults();
    }

    bindSearchResultEvents() {
        const resultItems = this.searchResults.querySelectorAll('.search-result-item[data-page-id]');
        
        resultItems.forEach(item => {
            // Use mousedown instead of click to avoid focus conflicts
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent focus change
                e.stopPropagation(); // Prevent event bubbling
                
                const pageId = parseInt(item.getAttribute('data-page-id'));
                this.navigateToPage(pageId);
            });
            
            // Also handle touch events for mobile
            item.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const pageId = parseInt(item.getAttribute('data-page-id'));
                this.navigateToPage(pageId);
            });
        });
    }
    
    getLocationInfo(pageId) {
        const page = this.pages[pageId];
        if (!page) {
            return `Side ${pageId}`;
        }
        
        if (!this.tocData || !this.tocData.chapters) {
            return `Side ${page.chapter}-${page.page}`;
        }
        
        const chapter = this.tocData.chapters[page.chapter];
        if (!chapter) {
            return `Side ${page.chapter}-${page.page}`;
        }
        
        // First try to find exact match
        const possibleFilenames = [
            `HRN113_${page.chapter}-${page.page}`,
            `HRN113_${page.chapter}-${page.page.padStart(2, '0')}`,
            page.filename
        ];
        
        let section = null;
        for (const filename of possibleFilenames) {
            if (filename) {
                section = chapter.sections?.find(s => s.filename === filename);
                if (section) break;
            }
        }
        
        // If no exact match, find the section this page belongs to by finding the 
        // section with the highest page number that is still <= current page
        if (!section && chapter.sections) {
            const currentPageNum = parseInt(page.page);
            let bestSection = null;
            let bestPageNum = -1;
            let bestSectionIndex = -1;
            
            for (let i = 0; i < chapter.sections.length; i++) {
                const sec = chapter.sections[i];
                const match = sec.filename.match(/HRN113_\d+-(\d+)/);
                if (match) {
                    const sectionPageNum = parseInt(match[1]);
                    if (sectionPageNum <= currentPageNum) {
                        // If same page number, prefer later section (higher index)
                        // If higher page number, use it
                        if (sectionPageNum > bestPageNum || 
                            (sectionPageNum === bestPageNum && i > bestSectionIndex)) {
                            bestSection = sec;
                            bestPageNum = sectionPageNum;
                            bestSectionIndex = i;
                        }
                    }
                }
            }
            
            section = bestSection;
        }
        
        if (section) {
            return `${chapter.name} › ${section.number}. ${section.name}`;
        } else {
            return `${chapter.name} › Side ${page.chapter}-${page.page}`;
        }
    }

    highlightText(text, query) {
        if (!text || !query) return text;
        
        // Custom regex pattern that includes Danish characters
        const danishWordPattern = /[a-zA-ZæøåÆØÅ]+/g;
        const queryWords = query.toLowerCase().match(danishWordPattern) || [];
        let highlightedText = text;
        
        // Find all words in the text that could be highlighted
        const textWords = text.match(danishWordPattern) || [];
        const wordsToHighlight = new Set();
        
        // For each query word, find matching words in the text
        for (const queryWord of queryWords) {
            if (queryWord.length < 3) continue;
            
            for (const textWord of textWords) {
                const textWordLower = textWord.toLowerCase();
                
                // Highlight if:
                // 1. Exact match
                if (textWordLower === queryWord) {
                    wordsToHighlight.add(textWord);
                }
                // 2. Text word starts with query (like "udstødning" when searching "udstødningsrør")
                else if (textWordLower.startsWith(queryWord) && queryWord.length >= 3) {
                    wordsToHighlight.add(textWord);
                }
                // 3. Query starts with text word (like "motor" when searching "motoren")
                else if (queryWord.startsWith(textWordLower) && textWordLower.length >= 3) {
                    wordsToHighlight.add(textWord);
                }
                // 4. Meaningful partial match (both words are substantial and one contains the other significantly)
                else if (queryWord.length >= 5 && textWordLower.length >= 5 && 
                         (textWordLower.includes(queryWord) || queryWord.includes(textWordLower)) &&
                         Math.min(queryWord.length, textWordLower.length) >= Math.max(queryWord.length, textWordLower.length) * 0.6) {
                    wordsToHighlight.add(textWord);
                }
            }
        }
        
        // Apply highlighting to all words that should be highlighted
        // Sort by length (longest first) to avoid partial highlighting conflicts
        const sortedWords = Array.from(wordsToHighlight).sort((a, b) => b.length - a.length);
        
        for (const word of sortedWords) {
            // Create custom word boundary that works with Danish characters
            // Use negative lookbehind/lookahead for word characters including Danish
            const regex = new RegExp(`(?<![a-zA-ZæøåÆØÅ])(${this.escapeRegExp(word)})(?![a-zA-ZæøåÆØÅ])`, 'gi');
            highlightedText = highlightedText.replace(regex, (match) => {
                // Avoid double highlighting
                if (match.includes('<span class="highlight">')) {
                    return match;
                }
                return `<span class="highlight">${match}</span>`;
            });
        }
        
        return highlightedText;
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    showSearchResults() {
        if (this.searchResults.innerHTML.trim()) {
            this.searchResults.style.display = 'block';
        }
    }

    hideSearchResults() {
        // Hide search results when input is empty or when explicitly called
        if (!this.searchInput.value.trim() || !document.activeElement || document.activeElement !== this.searchInput) {
            this.searchResults.style.display = 'none';
        }
    }

    navigateToPage(pageId) {
        if (pageId < 0 || pageId >= this.pages.length) {
            return;
        }

        const page = this.pages[pageId];
        this.currentPage = pageId;
        
        this.displayPage(page);
        this.updateNavigation();
        this.updatePageInfo(page);
        this.expandChapterForPage(pageId);
        
        // Close navigation after selecting a page
        this.closeNavigation();
    }

    displayPage(page) {
        const img = new Image();
        img.onload = () => {
            this.contentArea.innerHTML = `
                <div class="page-container">
                    <img src="${page.imagePath}" alt="Side ${page.chapter}-${page.page}" class="page-image">
                </div>
            `;
            
            // Hide search results when image is fully loaded
            this.searchResults.style.display = 'none';
            
            // Set focus to content area to prevent search from reappearing on click
            // Use preventScroll to avoid automatic scrolling
            this.contentArea.focus({ preventScroll: true });
        };
        
        img.onerror = () => {
            this.contentArea.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-title">Fejl</div>
                    <p>Kunne ikke indlæse side ${page.chapter}-${page.page}</p>
                    <p><em>Billedfilen blev ikke fundet: ${page.imagePath}</em></p>
                </div>
            `;
            
            // Hide search results even if image fails to load
            this.searchResults.style.display = 'none';
            this.contentArea.focus({ preventScroll: true });
        };

        // Show loading while image loads
        this.contentArea.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
            </div>
        `;

        img.src = page.imagePath;
    }

    updateNavigation() {
        this.prevBtn.disabled = this.currentPage <= 0;
        this.nextBtn.disabled = this.currentPage >= this.pages.length - 1;
    }

    updatePageInfo(page) {
        const locationInfo = this.getLocationInfo(this.currentPage);
        this.pageInfo.textContent = `${locationInfo} (${this.currentPage + 1} af ${this.pages.length})`;
    }

    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT') return;
        
        switch(e.key) {
            case 'ArrowLeft':
                if (this.currentPage !== null) {
                    this.navigateToPage(this.currentPage - 1);
                }
                break;
            case 'ArrowRight':
                if (this.currentPage !== null) {
                    this.navigateToPage(this.currentPage + 1);
                }
                break;
            case 'Escape':
                this.closeSidebar();
                break;
        }
    }

    handleSwipe(startX, endX, startY, endY, duration) {
        const horizontalThreshold = 70;  // More sensitive - easier to trigger swipes
        const verticalThreshold = 40;    // Keep strict about horizontal-only gestures
        const maxDuration = 600;         // Keep reduced max duration for more deliberate swipes
        const minDuration = 150;         // Keep increased minimum duration
        
        const horizontalDiff = startX - endX;
        const verticalDiff = Math.abs(startY - endY);
        
        // Check if this is a valid horizontal swipe:
        // 1. Horizontal movement must exceed threshold
        // 2. Vertical movement must be less than threshold (not primarily vertical)
        // 3. Duration should be reasonable (not too fast, not too slow)
        // 4. Must have a current page to navigate from
        if (Math.abs(horizontalDiff) > horizontalThreshold && 
            verticalDiff < verticalThreshold && 
            duration >= minDuration && 
            duration <= maxDuration && 
            this.currentPage !== null) {
            
            if (horizontalDiff > 0) {
                // Swipe left - next page
                this.navigateToPage(this.currentPage + 1);
            } else {
                // Swipe right - previous page
                this.navigateToPage(this.currentPage - 1);
            }
        }
    }

    toggleNavigation() {
        if (this.navigationOpen) {
            this.closeNavigation();
        } else {
            this.openNavigation();
        }
    }

    openNavigation() {
        this.navigationOpen = true;
        
        // Calculate toolbar height and position dropdown accordingly
        const toolbar = document.querySelector('.toolbar');
        const toolbarHeight = toolbar ? toolbar.offsetHeight : 58;
        
        this.navDropdown.style.display = 'block';
        this.navDropdown.style.top = toolbarHeight + 'px';
    }

    closeNavigation() {
        this.navigationOpen = false;
        this.navDropdown.style.display = 'none';
    }

    showError(message) {
        this.contentArea.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-title">Fejl</div>
                <p>${message}</p>
            </div>
        `;
    }
    
    // Offline functionality methods
    async toggleOfflineStatus() {
        const manualId = this.offlineBtn.getAttribute('data-manual-id');
        if (!manualId) return;
        
        // Check if offline manager is available
        if (typeof window.offlineManager === 'undefined') {
            this.showOfflineError('Offline funktionalitet er ikke tilgængelig');
            return;
        }
        
        try {
            await window.offlineManager.toggleOfflineStatus(manualId);
            this.updateOfflineButtonStatus();
        } catch (error) {
            console.error('Failed to toggle offline status:', error);
            this.showOfflineError('Kunne ikke opdatere offline status');
        }
    }
    
    async updateOfflineButtonStatus() {
        if (!this.offlineBtn) return;
        
        const manualId = this.offlineBtn.getAttribute('data-manual-id');
        if (!manualId) return;
        
        // Check if offline manager is available
        if (typeof window.offlineManager === 'undefined') {
            this.offlineBtn.textContent = 'Offline N/A';
            this.offlineBtn.className = 'offline-btn error';
            this.offlineBtn.disabled = true;
            return;
        }
        
        try {
            const isOffline = window.offlineManager.offlineManuals.has(manualId);
            const isDownloading = window.offlineManager.pendingDownloads.has(manualId);
            
            if (isDownloading) {
                this.offlineBtn.textContent = '⏳ Downloader...';
                this.offlineBtn.className = 'offline-btn downloading';
                this.offlineBtn.disabled = true;
            } else if (isOffline) {
                this.offlineBtn.textContent = '✓ Offline';
                this.offlineBtn.className = 'offline-btn offline';
                this.offlineBtn.disabled = false;
                this.offlineBtn.title = 'Klik for at fjerne offline adgang';
            } else {
                this.offlineBtn.textContent = '⬇ Offline';
                this.offlineBtn.className = 'offline-btn';
                this.offlineBtn.disabled = false;
                this.offlineBtn.title = 'Klik for at downloade til offline brug';
            }
        } catch (error) {
            console.error('Failed to update offline button status:', error);
            this.offlineBtn.textContent = 'Offline Error';
            this.offlineBtn.className = 'offline-btn error';
            this.offlineBtn.disabled = true;
        }
    }
    
    showOfflineError(message) {
        // Show a temporary notification or update button text
        const originalText = this.offlineBtn.textContent;
        this.offlineBtn.textContent = 'Error';
        this.offlineBtn.className = 'offline-btn error';
        
        setTimeout(() => {
            this.updateOfflineButtonStatus();
        }, 3000);
    }
    
    // Cleanup method to prevent memory leaks
    destroy() {
        if (this.searchPollingInterval) {
            clearInterval(this.searchPollingInterval);
            this.searchPollingInterval = null;
        }
    }
}

// Initialize the application
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ManualViewer();
});

// Cleanup when page is unloaded
window.addEventListener('beforeunload', () => {
    if (app && app.destroy) {
        app.destroy();
    }
});