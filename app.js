// ============================================================
// Denní Aktuality - hlavní aplikační logika
// ============================================================

const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

const DEFAULT_FEEDS = [
    // Technologie & AI
    { name: 'Lupa.cz', url: 'https://www.lupa.cz/rss/clanky/', category: 'tech' },
    { name: 'Root.cz', url: 'https://www.root.cz/rss/clanky/', category: 'tech' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'tech' },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'tech' },
    // Česká politika
    { name: 'iDNES - Zprávy', url: 'https://servis.idnes.cz/rss.aspx?c=zpravodaj', category: 'politics' },
    { name: 'Aktuálně.cz', url: 'https://www.aktualne.cz/rss/', category: 'politics' },
    { name: 'ČT24', url: 'https://ct24.ceskatelevize.cz/rss/hlavni-zpravy', category: 'politics' },
    // Finance
    { name: 'E15', url: 'https://www.e15.cz/rss', category: 'finance' },
    { name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/', category: 'finance' },
    { name: 'Hospodářské noviny', url: 'https://ihned.cz/?m=rss', category: 'finance' },
];

const CATEGORY_LABELS = {
    tech: 'Technologie & AI',
    politics: 'Česká politika',
    finance: 'Finance',
};

// ---- State ----
let allArticles = [];
let currentFilter = 'all';

// ---- Feed Management ----
function getFeeds() {
    const stored = localStorage.getItem('rss_feeds');
    if (stored) {
        return JSON.parse(stored);
    }
    localStorage.setItem('rss_feeds', JSON.stringify(DEFAULT_FEEDS));
    return DEFAULT_FEEDS;
}

function saveFeeds(feeds) {
    localStorage.setItem('rss_feeds', JSON.stringify(feeds));
}

function addFeed(name, url, category) {
    const feeds = getFeeds();
    feeds.push({ name, url, category });
    saveFeeds(feeds);
    renderFeedsList();
}

function removeFeed(index) {
    const feeds = getFeeds();
    feeds.splice(index, 1);
    saveFeeds(feeds);
    renderFeedsList();
}

// ---- RSS Fetching & Parsing ----
async function fetchFeed(feed) {
    try {
        const proxyUrl = CORS_PROXY + encodeURIComponent(feed.url);
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        return parseFeed(text, feed);
    } catch (err) {
        console.warn(`Nepodařilo se načíst ${feed.name}: ${err.message}`);
        return [];
    }
}

function parseFeed(xmlText, feed) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const articles = [];

    // RSS 2.0 items
    const items = doc.querySelectorAll('item');
    items.forEach(item => {
        const title = item.querySelector('title')?.textContent?.trim();
        const link = item.querySelector('link')?.textContent?.trim();
        const pubDate = item.querySelector('pubDate')?.textContent?.trim();

        if (title && link) {
            articles.push({
                title,
                link,
                date: pubDate ? new Date(pubDate) : new Date(),
                source: feed.name,
                category: feed.category,
            });
        }
    });

    // Atom entries (fallback)
    if (articles.length === 0) {
        const entries = doc.querySelectorAll('entry');
        entries.forEach(entry => {
            const title = entry.querySelector('title')?.textContent?.trim();
            const linkEl = entry.querySelector('link[href]');
            const link = linkEl?.getAttribute('href');
            const updated = entry.querySelector('updated')?.textContent?.trim()
                || entry.querySelector('published')?.textContent?.trim();

            if (title && link) {
                articles.push({
                    title,
                    link,
                    date: updated ? new Date(updated) : new Date(),
                    source: feed.name,
                    category: feed.category,
                });
            }
        });
    }

    return articles;
}

async function fetchAllFeeds() {
    const feeds = getFeeds();
    const fetchBtn = document.getElementById('fetch-btn');
    const loading = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Načítám...';
    loading.classList.remove('hidden');
    errorEl.classList.add('hidden');

    try {
        const results = await Promise.allSettled(feeds.map(f => fetchFeed(f)));
        allArticles = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value);

        // Seřadit dle data (nejnovější první)
        allArticles.sort((a, b) => b.date - a.date);

        // Omezit na posledních 100 článků
        allArticles = allArticles.slice(0, 100);

        const failedCount = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.length === 0)).length;

        if (allArticles.length === 0) {
            errorEl.textContent = 'Nepodařilo se načíst žádné zprávy. Zkontrolujte připojení k internetu nebo zkuste později.';
            errorEl.classList.remove('hidden');
        } else if (failedCount > 0) {
            errorEl.textContent = `Načteno ${allArticles.length} článků. ${failedCount} zdroj(ů) se nepodařilo načíst.`;
            errorEl.classList.remove('hidden');
        }

        renderNews();
    } catch (err) {
        errorEl.textContent = 'Chyba při načítání: ' + err.message;
        errorEl.classList.remove('hidden');
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Načíst aktuality';
        loading.classList.add('hidden');
    }
}

// ---- Rendering ----
function renderNews() {
    const container = document.getElementById('news-list');
    const filtered = currentFilter === 'all'
        ? allArticles
        : allArticles.filter(a => a.category === currentFilter);

    if (filtered.length === 0) {
        container.innerHTML = allArticles.length === 0
            ? '<p style="text-align:center;color:#888;padding:40px 0;">Klikněte na "Načíst aktuality" pro zobrazení zpráv.</p>'
            : '<p style="text-align:center;color:#888;padding:40px 0;">Žádné zprávy v této kategorii.</p>';
        return;
    }

    container.innerHTML = filtered.map(article => {
        const dateStr = formatDate(article.date);
        const categoryClass = `category-${article.category}`;
        return `
            <div class="news-item">
                <a href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">
                    ${escapeHtml(article.title)}
                </a>
                <div class="news-meta">
                    <span class="news-source">${escapeHtml(article.source)}</span>
                    <span class="news-category ${categoryClass}">${CATEGORY_LABELS[article.category] || article.category}</span>
                    <span>${dateStr}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderFeedsList() {
    const container = document.getElementById('feeds-list');
    const feeds = getFeeds();

    container.innerHTML = feeds.map((feed, index) => {
        const categoryClass = `category-${feed.category}`;
        return `
            <div class="feed-item">
                <div class="feed-info">
                    <div class="feed-name">
                        ${escapeHtml(feed.name)}
                        <span class="news-category ${categoryClass}">${CATEGORY_LABELS[feed.category] || feed.category}</span>
                    </div>
                    <div class="feed-url">${escapeHtml(feed.url)}</div>
                </div>
                <button class="btn-delete" onclick="removeFeed(${index})">Odebrat</button>
            </div>
        `;
    }).join('');
}

// ---- Helpers ----
function formatDate(date) {
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'právě teď';
    if (diffMins < 60) return `před ${diffMins} min`;
    if (diffHours < 24) return `před ${diffHours} hod`;

    return date.toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---- Event Listeners ----
document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        });
    });

    // Category filters
    document.querySelectorAll('.filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.category;
            renderNews();
        });
    });

    // Fetch button
    document.getElementById('fetch-btn').addEventListener('click', fetchAllFeeds);

    // Add feed
    document.getElementById('add-feed-btn').addEventListener('click', () => {
        const name = document.getElementById('feed-name').value.trim();
        const url = document.getElementById('feed-url').value.trim();
        const category = document.getElementById('feed-category').value;

        if (!name || !url) {
            alert('Vyplňte název i URL feedu.');
            return;
        }

        try {
            new URL(url);
        } catch {
            alert('Zadejte platnou URL adresu.');
            return;
        }

        addFeed(name, url, category);
        document.getElementById('feed-name').value = '';
        document.getElementById('feed-url').value = '';
    });

    // Initial render
    renderFeedsList();
    renderNews();
});
