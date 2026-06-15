/* ============================================================
   ANIBLOSSOM — Main JavaScript
   Handles: navigation, search, UI interactions, cache, routing
   ============================================================ */

'use strict';

/* ── Simple Cache (localStorage with TTL) ─────────────────── */
const Cache = {
  prefix: 'aniblossom_',
  defaultTTL: 24 * 60 * 60 * 1000, // 24h

  set(key, data, ttl = this.defaultTTL) {
    try {
      const entry = { data, expires: Date.now() + ttl };
      localStorage.setItem(this.prefix + key, JSON.stringify(entry));
    } catch(e) {
      // Storage full — clear oldest entries
      this._evict();
    }
  },

  get(key) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() > entry.expires) {
        localStorage.removeItem(this.prefix + key);
        return null;
      }
      return entry.data;
    } catch { return null; }
  },

  del(key) {
    localStorage.removeItem(this.prefix + key);
  },

  _evict() {
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(this.prefix));
    // Remove half of cached items (oldest first based on key order)
    keys.slice(0, Math.ceil(keys.length / 2))
      .forEach(k => localStorage.removeItem(k));
  },

  // Cache image thumbnail as data URL
  async setImage(url) {
    if (this.get('img_' + url)) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        this.set('img_' + url, reader.result, 7 * 24 * 60 * 60 * 1000); // 7 days
      };
      reader.readAsDataURL(blob);
    } catch {}
  },

  getImage(url) {
    return this.get('img_' + url);
  }
};

/* ── Image loading with cache ─────────────────────────────── */
function loadCachedImage(imgEl, src) {
  if (!src) return;
  const cached = Cache.getImage(src);
  if (cached) {
    imgEl.src = cached;
    imgEl.classList.add('loaded');
    return;
  }
  // Load normally, then cache it in background
  imgEl.src = src;
  imgEl.onload = () => {
    imgEl.classList.add('loaded');
    // Cache after slight delay to not block
    setTimeout(() => Cache.setImage(src), 200);
  };
  imgEl.onerror = () => { imgEl.src = '/assets/placeholder.png'; };
}

/* ── Navigation & Page State ──────────────────────────────── */
const Nav = {
  init() {
    this.bindSearch();
    this.bindGenreBar();
    this.bindBanner();
    this.bindNavButtons();
    this.highlightActive();
  },

  highlightActive() {
    const path = location.pathname;
    document.querySelectorAll('[data-nav-link]').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === path);
    });
  },

  bindSearch() {
    const input = document.getElementById('searchInput');
    const dropdown = document.getElementById('searchDropdown');
    if (!input || !dropdown) return;

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { dropdown.classList.remove('open'); return; }
      timer = setTimeout(() => this.runSearch(q, dropdown), 300);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2) dropdown.classList.add('open');
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.nav-search')) dropdown.classList.remove('open');
    });

    // Keyboard shortcut (Cmd/Ctrl + K)
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault(); input.focus(); input.select();
      }
      if (e.key === 'Escape') { input.blur(); dropdown.classList.remove('open'); }
    });
  },

  async runSearch(query, dropdown) {
    // Show loading state
    dropdown.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Searching…</div>';
    dropdown.classList.add('open');

    const cacheKey = 'search_' + query;
    const cached = Cache.get(cacheKey);
    if (cached) { this.renderSearchResults(cached, dropdown); return; }

    try {
      const res = await fetch(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=6&sfw=true`
      );
      const data = await res.json();
      const results = (data.data || []).slice(0, 6);
      Cache.set(cacheKey, results, 10 * 60 * 1000); // 10 min
      this.renderSearchResults(results, dropdown);
    } catch {
      dropdown.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Search unavailable</div>';
    }
  },

  renderSearchResults(results, dropdown) {
    if (!results.length) {
      dropdown.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">No results found</div>';
      return;
    }
    dropdown.innerHTML = results.map(item => `
      <a class="search-result-item" href="/watch/${item.mal_id}">
        <img src="${item.images?.jpg?.small_image_url || ''}" alt="" loading="lazy">
        <div>
          <div class="search-result-title">${item.title}</div>
          <div class="search-result-meta">
            ${item.type || 'TV'} · ${item.year || '—'} · ⭐ ${item.score || '—'}
          </div>
        </div>
      </a>
    `).join('');
  },

  bindGenreBar() {
    const btns = document.querySelectorAll('.genre-scroll-btn');
    const inner = document.querySelector('.genre-bar-inner');
    if (!inner) return;
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = btn.dataset.dir === 'left' ? -200 : 200;
        inner.scrollBy({ left: dir, behavior: 'smooth' });
      });
    });

    document.querySelectorAll('.genre-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });
  },

  bindBanner() {
    const banner = document.querySelector('.site-banner');
    const closeBtn = document.querySelector('.site-banner-close');
    if (!closeBtn || !banner) return;
    if (sessionStorage.getItem('ab_banner_closed')) { banner.remove(); return; }
    closeBtn.addEventListener('click', () => {
      banner.style.transition = 'opacity 0.2s';
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 200);
      sessionStorage.setItem('ab_banner_closed', '1');
    });
  },

  bindNavButtons() {
    // Random anime button
    const randBtn = document.getElementById('randomBtn');
    if (randBtn) {
      randBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('https://api.jikan.moe/v4/random/anime');
          const data = await res.json();
          if (data.data?.mal_id) location.href = `/watch/${data.data.mal_id}`;
        } catch {}
      });
    }
  }
};

/* ── Hero Slider ──────────────────────────────────────────── */
const Hero = {
  current: 0,
  slides: [],
  timer: null,

  init() {
    this.slides = Array.from(document.querySelectorAll('.hero-slide'));
    if (!this.slides.length) return;

    const counter = document.querySelector('.hero-counter');
    const prev = document.querySelector('[data-hero-prev]');
    const next = document.querySelector('[data-hero-next]');

    if (counter) counter.textContent = `${this.current + 1} / ${this.slides.length}`;

    if (prev) prev.addEventListener('click', () => this.go(-1));
    if (next) next.addEventListener('click', () => this.go(1));

    this.start();

    // Pause on hover
    const hero = document.querySelector('.hero');
    if (hero) {
      hero.addEventListener('mouseenter', () => clearInterval(this.timer));
      hero.addEventListener('mouseleave', () => this.start());
    }
  },

  go(dir) {
    this.slides[this.current].classList.remove('active');
    this.current = (this.current + dir + this.slides.length) % this.slides.length;
    this.slides[this.current].classList.add('active');

    const counter = document.querySelector('.hero-counter');
    if (counter) counter.textContent = `${this.current + 1} / ${this.slides.length}`;

    clearInterval(this.timer);
    this.start();
  },

  start() {
    this.timer = setInterval(() => this.go(1), 6000);
  }
};

/* ── Watch Page ───────────────────────────────────────────── */
const WatchPage = {
  init() {
    this.bindPlayerBar();
    this.bindEpisodeList();
    this.bindSeasons();
    this.bindWatchActions();
    this.saveToHistory();
  },

  bindPlayerBar() {
    // Toggle buttons (autoplay, auto-skip, auto-next, lights off)
    document.querySelectorAll('.player-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('on');
        const label = toggle.dataset.pref;
        if (label) {
          const val = toggle.classList.contains('on');
          localStorage.setItem('ab_pref_' + label, val ? '1' : '0');
        }
      });
    });

    // Restore pref state
    document.querySelectorAll('.player-toggle[data-pref]').forEach(toggle => {
      const val = localStorage.getItem('ab_pref_' + toggle.dataset.pref);
      if (val === '1') toggle.classList.add('on');
    });

    // Server dropdown
    const serverSelect = document.getElementById('serverSelect');
    if (serverSelect) {
      serverSelect.addEventListener('change', () => {
        Toast.show(`Switched to ${serverSelect.value} server`, 'success');
        // In real implementation: reload iframe src
      });
    }

    // Audio toggle (sub/dub)
    document.querySelectorAll('.audio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.audio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Toast.show(`${btn.textContent} selected`, 'success');
      });
    });

    // Lights off
    const lightsBtn = document.querySelector('[data-pref="lights"]');
    if (lightsBtn) {
      lightsBtn.addEventListener('click', () => {
        document.body.classList.toggle('lights-off', lightsBtn.classList.contains('on'));
      });
    }
  },

  bindEpisodeList() {
    document.querySelectorAll('.ep-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.ep-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const title = item.querySelector('.ep-title')?.textContent;
        const watchTitle = document.querySelector('.watch-ep-title');
        if (watchTitle && title) watchTitle.textContent = title;
      });
    });

    // Ep view modes (list vs grid)
    document.querySelectorAll('.ep-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ep-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const list = document.querySelector('.episode-list');
        if (list) {
          list.classList.toggle('ep-grid-mode', btn.dataset.view === 'grid');
        }
      });
    });

    // Episode search/filter
    const epSearch = document.querySelector('.ep-search input');
    if (epSearch) {
      epSearch.addEventListener('input', () => {
        const q = epSearch.value.toLowerCase();
        document.querySelectorAll('.ep-item').forEach(item => {
          const title = item.querySelector('.ep-title')?.textContent.toLowerCase() || '';
          item.style.display = title.includes(q) ? '' : 'none';
        });
      });
    }
  },

  bindSeasons() {
    document.querySelectorAll('.season-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  },

  bindWatchActions() {
    const shareBtn = document.querySelector('[data-action="share"]');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: document.title, url: location.href });
          } catch {}
        } else {
          navigator.clipboard.writeText(location.href);
          Toast.show('Link copied!', 'success');
        }
      });
    }

    const downloadBtn = document.querySelector('[data-action="download"]');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        Toast.show('Download feature coming soon', 'success');
      });
    }

    const reportBtn = document.querySelector('[data-action="report"]');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        Toast.show('Report submitted — thank you', 'success');
      });
    }
  },

  saveToHistory() {
    // Save current anime to watch history
    const animeId = document.body.dataset.animeId;
    const title    = document.body.dataset.animeTitle;
    const thumb    = document.body.dataset.animeThumb;
    const ep       = document.body.dataset.currentEp;

    if (!animeId) return;

    const history = JSON.parse(localStorage.getItem('ab_history') || '[]');
    const existing = history.findIndex(h => h.id === animeId);
    const entry = { id: animeId, title, thumb, ep, ts: Date.now() };

    if (existing !== -1) history.splice(existing, 1);
    history.unshift(entry);
    if (history.length > 50) history.pop();

    localStorage.setItem('ab_history', JSON.stringify(history));
  }
};

/* ── Comments ─────────────────────────────────────────────── */
const Comments = {
  init() {
    // Tab switching
    document.querySelectorAll('.comment-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.comment-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });

    // Like / dislike buttons
    document.querySelectorAll('.comment-action-btn[data-vote]').forEach(btn => {
      btn.addEventListener('click', () => {
        const countEl = btn.querySelector('.comment-likes');
        if (!countEl) return;
        const count = parseInt(countEl.textContent) || 0;
        const wasActive = btn.classList.contains('voted');
        btn.classList.toggle('voted', !wasActive);
        countEl.textContent = wasActive ? count - 1 : count + 1;
        btn.style.color = wasActive ? '' : 'var(--accent)';
      });
    });
  }
};

/* ── Toast Notifications ──────────────────────────────────── */
const Toast = {
  container: null,

  show(message, type = 'success', duration = 3000) {
    if (!this.container) {
      this.container = document.getElementById('toastContainer');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toastContainer';
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
      }
    }

    const icons = {
      success: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
      error:   `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || ''}</span>${message}`;
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(12px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

/* ── Card Remove buttons ──────────────────────────────────── */
function bindRemoveButtons() {
  document.querySelectorAll('.card-remove, .history-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const card = btn.closest('.anime-card, .history-card');
      if (card) {
        card.style.transition = 'opacity 0.2s, transform 0.2s';
        card.style.opacity = '0'; card.style.transform = 'scale(0.95)';
        setTimeout(() => card.remove(), 200);
      }
    });
  });
}

/* ── Image lazy loading (intersection observer) ───────────── */
function initLazyImages() {
  const imgs = document.querySelectorAll('img[data-src]');
  if (!imgs.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (src) loadCachedImage(img, src);
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '200px 0px' });

  imgs.forEach(img => observer.observe(img));
}

/* ── Safari-safe CSS fix ──────────────────────────────────── */
function fixSafari() {
  const ua = navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  if (isSafari) {
    document.documentElement.classList.add('is-safari');
    // Backdrop filter fallback
    document.querySelectorAll('.navbar, .hero-nav-btn, .hero-countdown').forEach(el => {
      if (!CSS.supports('backdrop-filter', 'blur(1px)')) {
        el.style.backgroundColor = 'rgba(10,10,15,0.97)';
      }
    });
  }
}

/* ── Boot ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  fixSafari();
  Nav.init();
  Hero.init();
  Comments.init();
  bindRemoveButtons();
  initLazyImages();

  if (document.body.classList.contains('watch-page')) {
    WatchPage.init();
  }
});

// Expose for inline use
window.Toast = Toast;
window.Cache = Cache;
