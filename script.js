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

// Commander precon set codes (update this list as needed)
const preconSets = [
    'woc', // Wilds of Eldraine Commander
    'moc', // March of the Machine Commander
    'ncc', // New Capenna Commander
    'nec', // Neon Dynasty Commander
    'voc', // Crimson Vow Commander
    'mic', // Midnight Hunt Commander
    'afc', // Forgotten Realms Commander
    'c21', // Commander 2021
    'khc', // Kaldheim Commander
    'znc', // Zendikar Rising Commander
    'c20', // Commander 2020
    'c19', // Commander 2019
    'c18', // Commander 2018
];

// Charts
let manaCurveChart, colorDistributionChart, cardTypesChart;

// Initialize
async function init() {
    showLoading();
    await fetchAllPreconDecks();
    populateFilters();
    hideLoading();
}

// Fetch all precon decks
async function fetchAllPreconDecks() {
    try {
        const promises = preconSets.map(setCode => 
            fetch(`https://api.scryfall.com/cards/search?q=set:${setCode}+is:commander`)
                .then(res => res.json())
                .then(data => ({
                    setCode,
                    commanders: data.data
                }))
        );

        const results = await Promise.all(promises);
        
        for (const result of results) {
            for (const commander of result.commanders) {
                const deck = {
                    id: commander.id,
                    name: commander.name,
                    colors: commander.color_identity,
                    imageUrl: commander.image_uris?.normal || commander.card_faces?.[0]?.image_uris?.normal,
                    setName: commander.set_name,
                    setCode: result.setCode,
                    year: new Date(commander.released_at).getFullYear()
                };
                preconDecks.push(deck);
            }
        }

        displayDecks(preconDecks);
    } catch (error) {
        console.error('Error fetching precon decks:', error);
    }
}

// Display decks in the grid
function displayDecks(decks) {
    decksGrid.innerHTML = '';
    
    decks.forEach(deck => {
        const deckElement = document.createElement('div');
        deckElement.className = 'deck-card';
        deckElement.onclick = () => openDeckDetails(deck);
        
        const colorPips = deck.colors.map(color => 
            `<div class="color-pip" style="background-color: var(--${color.toLowerCase()}-mana)"></div>`
        ).join('');

        deckElement.innerHTML = `
            <img src="${deck.imageUrl}" alt="${deck.name}" class="deck-image">
            <div class="deck-info">
                <h3>${deck.name}</h3>
                <p>${deck.setName}</p>
                <div class="deck-colors">
                    ${colorPips}
                </div>
            </div>
        `;
        
        decksGrid.appendChild(deckElement);
    });
}

// Fetch deck details
async function fetchDeckDetails(deck) {
    try {
        const response = await fetch(`https://api.scryfall.com/cards/search?q=set:${deck.setCode}+-is:commander+include:extras`);
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('Error fetching deck details:', error);
        return [];
    }
}

// Open deck details modal with enhanced features
async function openDeckDetails(deck) {
    showLoading();
    modal.style.display = 'block';
    document.getElementById('deckName').textContent = deck.name;
    
    const cards = await fetchDeckDetails(deck);
    
    // Categorize cards
    const categories = {
        commander: [deck],
        creatures: cards.filter(card => card.type_line.includes('Creature')),
        spells: cards.filter(card => !card.type_line.includes('Creature') && !card.type_line.includes('Land')),
        lands: cards.filter(card => card.type_line.includes('Land'))
    };
    
    // Calculate deck statistics
    const deckStats = calculateDeckStats(cards);
    
    // Update charts
    updateCharts(deckStats);
    
    // Update price information
    updatePriceInfo(cards);
    
    // Update modal content with card lists
    Object.entries(categories).forEach(([category, cardList]) => {
        const container = document.getElementById(`${category}List`);
        container.innerHTML = '';
        
        cardList.forEach(card => {
            const cardElement = document.createElement('div');
            cardElement.className = 'card-item';
            
            // Format mana cost to be more readable
            const manaCost = card.mana_cost ? card.mana_cost.replace(/[{}]/g, '') : '';
            
            // Get card price
            const price = card.prices?.usd ? `$${card.prices.usd}` : 'N/A';
            
            cardElement.innerHTML = `
                <div class="card-item-details">
                    <span class="card-name">${card.name}</span>
                    <div class="card-info">
                        <span class="card-mana">${manaCost}</span>
                        <span class="card-price">${price}</span>
                    </div>
                </div>
            `;
            
            // Add hover preview functionality
            cardElement.addEventListener('mousemove', (e) => showCardPreview(e, card));
            cardElement.addEventListener('mouseleave', hideCardPreview);
            
            container.appendChild(cardElement);
        });
    });
    
    hideLoading();
}

// Calculate deck statistics
function calculateDeckStats(cards) {
    const stats = {
        manaCurve: Array(8).fill(0), // 0-7+ CMC
        colorDistribution: { W: 0, U: 0, B: 0, R: 0, G: 0 },
        cardTypes: {}
    };
    
    cards.forEach(card => {
        // Mana curve
        const cmc = Math.min(7, Math.floor(card.cmc || 0));
        stats.manaCurve[cmc]++;
        
        // Color distribution
        if (card.colors) {
            card.colors.forEach(color => {
                if (stats.colorDistribution[color] !== undefined) {
                    stats.colorDistribution[color]++;
                }
            });
        }
        
        // Card types
        const mainType = card.type_line.split('—')[0].trim().split(' ')[0];
        stats.cardTypes[mainType] = (stats.cardTypes[mainType] || 0) + 1;
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
            labels: ['0', '1', '2', '3', '4', '5', '6', '7+'],
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
            labels: ['White', 'Blue', 'Black', 'Red', 'Green'],
            datasets: [{
                data: Object.values(stats.colorDistribution),
                backgroundColor: [
                    '#f8e7b9',
                    '#3c89d0',
                    '#382b2f',
                    '#e24d4b',
                    '#427c46'
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
            labels: Object.keys(stats.cardTypes),
            datasets: [{
                data: Object.values(stats.cardTypes),
                backgroundColor: [
                    '#e69f34',
                    '#3c89d0',
                    '#e24d4b',
                    '#427c46',
                    '#f8e7b9',
                    '#382b2f'
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
function updatePriceInfo(cards) {
    const prices = cards.map(card => parseFloat(card.prices?.usd || 0));
    const totalPrice = prices.reduce((a, b) => a + b, 0);
    const averagePrice = totalPrice / prices.length;
    
    document.getElementById('totalPrice').textContent = `$${totalPrice.toFixed(2)}`;
    document.getElementById('avgPrice').textContent = `$${averagePrice.toFixed(2)}`;
}

// Show card preview
function showCardPreview(event, card) {
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX + 20;
    const y = event.clientY + 20;
    
    previewImage.src = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal;
    previewName.textContent = card.name;
    previewType.textContent = card.type_line;
    previewPrice.textContent = card.prices?.usd ? `$${card.prices.usd}` : 'Price not available';
    
    cardPreview.style.display = 'block';
    cardPreview.style.left = `${x}px`;
    cardPreview.style.top = `${y}px`;
}

// Hide card preview
function hideCardPreview() {
    cardPreview.style.display = 'none';
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

// Filter decks
function filterDecks() {
    const filteredDecks = preconDecks.filter(deck => {
        const matchesColors = activeFilters.colors.size === 0 || 
            deck.colors.some(color => activeFilters.colors.has(color));
        const matchesSet = !activeFilters.set || deck.setCode === activeFilters.set;
        const matchesYear = !activeFilters.year || deck.year.toString() === activeFilters.year;
        const matchesSearch = !activeFilters.search || 
            deck.name.toLowerCase().includes(activeFilters.search.toLowerCase()) ||
            deck.setName.toLowerCase().includes(activeFilters.search.toLowerCase());
        
        return matchesColors && matchesSet && matchesYear && matchesSearch;
    });
    
    displayDecks(filteredDecks);
}

// Populate filters
function populateFilters() {
    // Populate set filter
    const sets = [...new Set(preconDecks.map(deck => deck.setCode))];
    sets.forEach(set => {
        const option = document.createElement('option');
        option.value = set;
        option.textContent = preconDecks.find(deck => deck.setCode === set).setName;
        setFilter.appendChild(option);
    });
    
    // Populate year filter
    const years = [...new Set(preconDecks.map(deck => deck.year))].sort((a, b) => b - a);
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });
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
