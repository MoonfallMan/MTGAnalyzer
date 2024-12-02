// Cache DOM elements
const decksGrid = document.getElementById('decksGrid');
const searchInput = document.getElementById('searchInput');
const setFilter = document.getElementById('setFilter');
const yearFilter = document.getElementById('yearFilter');
const loadingSpinner = document.getElementById('loadingSpinner');
const modal = document.getElementById('deckModal');
const modalContent = document.getElementById('modalContent');
const closeButton = document.querySelector('.close-button');
const manaButtons = document.querySelectorAll('.mana-btn');

// Card preview elements
const cardPreview = document.getElementById('cardPreview');
const previewImage = document.getElementById('previewImage');
const previewName = document.getElementById('previewName');
const previewType = document.getElementById('previewType');
const previewPrice = document.getElementById('previewPrice');

// State management
let preconDecks = [];
let activeFilters = {
    colors: new Set(),
    set: '',
    year: '',
    search: ''
};
let loadingProgress = {
    total: 0,
    loaded: 0
};

// Charts
let manaCurveChart, colorDistributionChart, cardTypesChart;

// Cache management
const CACHE_KEY = 'mtgAnalyzer_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function getCachedData() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const { timestamp, data } = JSON.parse(cached);
    const now = new Date().getTime();

    // Check if cache is expired (older than 24 hours)
    if (now - timestamp > CACHE_DURATION) {
        localStorage.removeItem(CACHE_KEY);
        return null;
    }

    return data;
}

function setCachedData(data) {
    const cacheObject = {
        timestamp: new Date().getTime(),
        data: data
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObject));
}

// Display loading progress
function updateLoadingProgress() {
    const percentage = loadingProgress.total ? Math.round((loadingProgress.loaded / loadingProgress.total) * 100) : 0;
    loadingSpinner.innerHTML = `Loading decks... ${percentage}% complete`;
}

// Initialize
async function init() {
    showLoading();
    await fetchAllPreconDecks();
    hideLoading();
}

// Fetch all precon decks
async function fetchAllPreconDecks() {
    try {
        // Check cache first
        const cachedDecks = getCachedData();
        if (cachedDecks) {
            preconDecks = cachedDecks;
            displayDecks(preconDecks);
            populateFilters();
            initializeTouchEvents();
            return;
        }

        // If no cache, fetch from API
        showLoading();
        const setsResponse = await fetch('https://api.scryfall.com/sets');
        const setsData = await setsResponse.json();
        
        // Filter for commander sets and precons
        const commanderSets = setsData.data.filter(set => 
            (set.set_type === 'commander' || 
             set.name.toLowerCase().includes('commander') ||
             set.name.toLowerCase().includes('precon')) &&
            !set.digital
        );

        loadingProgress.total = commanderSets.length;
        loadingProgress.loaded = 0;
        updateLoadingProgress();

        // Process each set
        for (const set of commanderSets) {
            try {
                const response = await fetch(`https://api.scryfall.com/cards/search?q=set:${set.code}+is:commander`);
                const data = await response.json();
                
                if (data.data) {
                    const newDecks = [];
                    for (const commander of data.data) {
                        const deck = {
                            id: commander.id,
                            name: commander.name,
                            colors: commander.color_identity,
                            imageUrl: commander.image_uris?.normal || commander.card_faces?.[0]?.image_uris?.normal,
                            setName: set.name,
                            setCode: set.code,
                            year: new Date(commander.released_at).getFullYear()
                        };
                        newDecks.push(deck);
                        preconDecks.push(deck);
                    }
                    
                    // Sort and display new decks immediately
                    newDecks.sort((a, b) => b.year - a.year);
                    displayDecks(newDecks, true);
                }
                
                loadingProgress.loaded++;
                updateLoadingProgress();
            } catch (error) {
                console.error(`Error fetching commanders for set ${set.code}:`, error);
                loadingProgress.loaded++;
                updateLoadingProgress();
            }
        }

        // Final sort of all decks
        preconDecks.sort((a, b) => b.year - a.year);
        
        // Cache the fetched data
        setCachedData(preconDecks);
        
        // Update filters after all decks are loaded
        populateFilters();
        initializeTouchEvents();
        hideLoading();
    } catch (error) {
        console.error('Error fetching precon decks:', error);
        
        // If API fetch fails, try to use cached data even if expired
        const cachedDecks = getCachedData(true);
        if (cachedDecks) {
            preconDecks = cachedDecks;
            displayDecks(preconDecks);
            populateFilters();
            initializeTouchEvents();
        }
        hideLoading();
    }
}

// Display decks in the grid
function displayDecks(decks, append = false) {
    if (!append) {
        decksGrid.innerHTML = '';
    }
    
    decks.forEach(deck => {
        const deckElement = document.createElement('div');
        deckElement.className = 'deck-card';
        deckElement.onclick = () => openDeckDetails(deck);
        
        const colorPips = deck.colors.map(color => 
            `<div class="color-pip" style="background-color: var(--${color.toLowerCase()}-mana)"></div>`
        ).join('');

        deckElement.innerHTML = `
            <div class="deck-image">
                <img src="${deck.imageUrl}" alt="${deck.name}" loading="lazy">
            </div>
            <div class="deck-info">
                <h3>${deck.name}</h3>
                <div class="color-pips">${colorPips}</div>
                <p class="set-name">${deck.setName} (${deck.year})</p>
            </div>
        `;
        
        decksGrid.appendChild(deckElement);
    });
}

// Populate filters
function populateFilters() {
    // Get unique sets and years
    const sets = [...new Set(preconDecks.map(deck => deck.setName))].sort();
    const years = [...new Set(preconDecks.map(deck => deck.year))].sort((a, b) => b - a);
    
    // Populate set filter
    setFilter.innerHTML = '<option value="">All Sets</option>' +
        sets.map(set => `<option value="${set}">${set}</option>`).join('');
    
    // Populate year filter
    yearFilter.innerHTML = '<option value="">All Years</option>' +
        years.map(year => `<option value="${year}">${year}</option>`).join('');
}

// Filter decks
function filterDecks() {
    const filteredDecks = preconDecks.filter(deck => {
        const matchesColors = activeFilters.colors.size === 0 || 
            deck.colors.some(color => activeFilters.colors.has(color));
        const matchesSet = !activeFilters.set || deck.setName === activeFilters.set;
        const matchesYear = !activeFilters.year || deck.year.toString() === activeFilters.year;
        const matchesSearch = !activeFilters.search || 
            deck.name.toLowerCase().includes(activeFilters.search.toLowerCase()) ||
            deck.setName.toLowerCase().includes(activeFilters.search.toLowerCase());
        
        return matchesColors && matchesSet && matchesYear && matchesSearch;
    });
    
    displayDecks(filteredDecks);
}

// Fetch deck details
async function fetchDeckDetails(deck) {
    try {
        // Using proper Scryfall syntax for the query
        const query = `e:${deck.setCode} -is:commander`;
        const encodedQuery = encodeURIComponent(query);
        const response = await fetch(`https://api.scryfall.com/cards/search?q=${encodedQuery}&unique=cards`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
            throw new Error('No cards found for this deck');
        }
        
        return data.data;
    } catch (error) {
        console.error('Error fetching deck details:', error);
        throw error;
    }
}

// Calculate deck statistics
function calculateDeckStats(cards) {
    const stats = {
        manaCurve: Array(11).fill(0), // 0-10+ CMC
        colors: {
            W: 0, U: 0, B: 0, R: 0, G: 0, C: 0
        },
        types: {
            Creature: 0,
            Instant: 0,
            Sorcery: 0,
            Artifact: 0,
            Enchantment: 0,
            Planeswalker: 0,
            Land: 0
        }
    };

    cards.forEach(card => {
        // Mana curve
        const cmc = Math.min(10, Math.floor(card.cmc || 0));
        stats.manaCurve[cmc]++;

        // Colors
        if (card.colors && card.colors.length > 0) {
            card.colors.forEach(color => {
                if (stats.colors.hasOwnProperty(color)) {
                    stats.colors[color]++;
                }
            });
        } else {
            stats.colors.C++;
        }

        // Card types
        Object.keys(stats.types).forEach(type => {
            if (card.type_line && card.type_line.includes(type)) {
                stats.types[type]++;
            }
        });
    });

    return stats;
}

// Update charts with deck statistics
function updateCharts(stats) {
    // Destroy existing charts
    if (manaCurveChart) manaCurveChart.destroy();
    if (colorDistributionChart) colorDistributionChart.destroy();
    if (cardTypesChart) cardTypesChart.destroy();
    
    // Mana Curve Chart
    const manaCurveCtx = document.getElementById('manaCurveChart').getContext('2d');
    manaCurveChart = new Chart(manaCurveCtx, {
        type: 'bar',
        data: {
            labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'],
            datasets: [{
                label: 'Number of Cards',
                data: stats.manaCurve,
                backgroundColor: '#e69f34'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
    
    // Color Distribution Chart
    const colorDistributionCtx = document.getElementById('colorDistributionChart').getContext('2d');
    colorDistributionChart = new Chart(colorDistributionCtx, {
        type: 'pie',
        data: {
            labels: ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless'],
            datasets: [{
                data: Object.values(stats.colors),
                backgroundColor: [
                    '#f8e7b9',
                    '#3c89d0',
                    '#382b2f',
                    '#e24d4b',
                    '#427c46',
                    '#808080'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
    
    // Card Types Chart
    const cardTypesCtx = document.getElementById('cardTypesChart').getContext('2d');
    cardTypesChart = new Chart(cardTypesCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(stats.types),
            datasets: [{
                data: Object.values(stats.types),
                backgroundColor: [
                    '#e69f34',
                    '#3c89d0',
                    '#e24d4b',
                    '#427c46',
                    '#f8e7b9',
                    '#382b2f',
                    '#808080'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Update price information
async function updatePriceInfo(cards) {
    try {
        let totalPrice = 0;
        let cardCount = 0;

        cards.forEach(card => {
            if (card.prices && card.prices.usd) {
                totalPrice += parseFloat(card.prices.usd);
                cardCount++;
            }
        });

        if (cardCount === 0) return null;

        const averagePrice = totalPrice / cardCount;
        return `$${totalPrice.toFixed(2)} (Avg: $${averagePrice.toFixed(2)})`;
    } catch (error) {
        console.error('Error calculating price info:', error);
        return null;
    }
}

// Open deck details modal with enhanced features
async function openDeckDetails(deck) {
    modal.style.display = 'block';
    
    // Initial modal content with loading state
    modalContent.innerHTML = `
        <span class="close-button">&times;</span>
        <div class="deck-header">
            <img src="${deck.imageUrl}" alt="${deck.name}" class="commander-image">
            <div class="deck-title">
                <h2>${deck.name}</h2>
                <p class="set-info">${deck.setName} (${deck.year})</p>
            </div>
        </div>
        <div class="deck-stats">
            <div class="loading-stats">
                <div class="spinner"></div>
                <div class="stats-loading-text">Loading deck details...</div>
            </div>
        </div>
    `;

    // Initialize close button
    const closeButton = modalContent.querySelector('.close-button');
    closeButton.onclick = () => modal.style.display = 'none';

    try {
        const cards = await fetchDeckDetails(deck);
        if (!cards || cards.length === 0) {
            throw new Error('No deck data found');
        }

        const stats = calculateDeckStats(cards);
        const priceInfo = await updatePriceInfo(cards);

        const statsDiv = modalContent.querySelector('.deck-stats');
        statsDiv.innerHTML = `
            <div class="chart-container">
                <canvas id="manaCurveChart"></canvas>
            </div>
            <div class="chart-container">
                <canvas id="colorDistributionChart"></canvas>
            </div>
            <div class="chart-container">
                <canvas id="cardTypesChart"></canvas>
            </div>
            ${priceInfo ? `<p class="price-info">Estimated Value: ${priceInfo}</p>` : ''}
        `;

        updateCharts(stats);
    } catch (error) {
        console.error('Error loading deck details:', error);
        const statsDiv = modalContent.querySelector('.deck-stats');
        statsDiv.innerHTML = `
            <div class="error-message">
                <p>Sorry, we couldn't load the deck details. Please try again later.</p>
                <p class="error-details">${error.message}</p>
            </div>
        `;
    }
}

// Show card preview
function showCardPreview(event, card) {
    const isTouchDevice = 'ontouchstart' in window;
    const rect = event.target.getBoundingClientRect();
    
    // Enhanced image URL handling
    let imageUrl = null;
    if (card.image_uris?.normal) {
        imageUrl = card.image_uris.normal;
    } else if (card.card_faces) {
        // Try to find an image URL in any of the card faces
        for (const face of card.card_faces) {
            if (face.image_uris?.normal) {
                imageUrl = face.image_uris.normal;
                break;
            }
        }
    }
    
    if (!imageUrl) {
        console.warn('No image URL found for card:', card.name);
        imageUrl = 'https://c1.scryfall.com/file/scryfall-cards/normal/front/1/4/141fe8b4-08cf-4c51-9b8a-684d1de55d29.jpg'; // Default card back image
    }
    
    previewImage.src = imageUrl;
    previewName.textContent = card.name;
    previewType.textContent = card.type_line;
    previewPrice.textContent = card.prices?.usd ? `$${card.prices.usd}` : 'Price not available';
    
    cardPreview.style.display = 'block';

    if (isTouchDevice) {
        // Center the preview for touch devices
        cardPreview.style.left = '50%';
        cardPreview.style.top = '50%';
        
        // Add close button if it doesn't exist
        if (!cardPreview.querySelector('.preview-close')) {
            const closeBtn = document.createElement('div');
            closeBtn.className = 'preview-close';
            closeBtn.innerHTML = '×';
            closeBtn.addEventListener('click', hideCardPreview);
            cardPreview.appendChild(closeBtn);
        }
    } else {
        // Position next to cursor for desktop
        const x = event.clientX + 20;
        const y = event.clientY + 20;
        
        // Adjust position if preview would go off screen
        const previewRect = cardPreview.getBoundingClientRect();
        const maxX = window.innerWidth - previewRect.width - 20;
        const maxY = window.innerHeight - previewRect.height - 20;
        
        cardPreview.style.left = `${Math.min(x, maxX)}px`;
        cardPreview.style.top = `${Math.min(y, maxY)}px`;
    }
}

// Hide card preview
function hideCardPreview() {
    cardPreview.style.display = 'none';
}

// Initialize touch events
function initializeTouchEvents() {
    const isTouchDevice = 'ontouchstart' in window;
    
    if (isTouchDevice) {
        // Add touch event listeners to card items
        document.addEventListener('click', (e) => {
            const cardItem = e.target.closest('.card-item');
            if (!cardItem) {
                hideCardPreview();
            }
        });

        // Prevent scrolling when touching the preview
        cardPreview.addEventListener('touchmove', (e) => {
            e.preventDefault();
        });
    }
}

// Close modal
closeButton.onclick = function() {
    modal.style.display = 'none';
}

window.onclick = function(event) {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

// Event listeners
searchInput.addEventListener('input', (e) => {
    activeFilters.search = e.target.value;
    filterDecks();
});

setFilter.addEventListener('change', (e) => {
    activeFilters.set = e.target.value;
    filterDecks();
});

yearFilter.addEventListener('change', (e) => {
    activeFilters.year = e.target.value;
    filterDecks();
});

manaButtons.forEach(button => {
    button.addEventListener('click', () => {
        const color = button.dataset.color;
        button.classList.toggle('active');
        
        if (activeFilters.colors.has(color)) {
            activeFilters.colors.delete(color);
        } else {
            activeFilters.colors.add(color);
        }
        
        filterDecks();
    });
});

// Loading spinner
function showLoading() {
    loadingSpinner.style.display = 'block';
}

function hideLoading() {
    loadingSpinner.style.display = 'none';
}

// Initialize the application
init();
