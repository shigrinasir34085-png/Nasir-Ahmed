/**
 * Portfolio UI interactions, hero scroll choreography, Cinema Video Lightbox,
 * Videos gallery filtering, mobile navigation, and contact actions.
 */
(() => {
  'use strict';

  const videos = Array.isArray(window.PORTFOLIO_VIDEOS)
    ? window.PORTFOLIO_VIDEOS
    : [];

  /* ------------------------------------------------------------
     1. Sticky Header Scroll State & Mobile Menu Drawer
  ------------------------------------------------------------ */
  const header = document.querySelector('.site-header');
  const menuToggle = document.getElementById('menu-toggle');
  const mobileDrawer = document.getElementById('mobile-drawer');

  const syncHeaderState = () => {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  };

  window.addEventListener('scroll', syncHeaderState, { passive: true });
  syncHeaderState();

  const closeMobileMenu = () => {
    if (!menuToggle || !mobileDrawer) return;
    menuToggle.setAttribute('aria-expanded', 'false');
    mobileDrawer.classList.remove('is-open');
    document.body.classList.remove('modal-open');
  };

  if (menuToggle && mobileDrawer) {
    menuToggle.addEventListener('click', () => {
      const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!expanded));
      mobileDrawer.classList.toggle('is-open', !expanded);
      document.body.classList.toggle('modal-open', !expanded);
    });

    mobileDrawer.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMobileMenu);
    });
  }

  /* ------------------------------------------------------------
     2. Smooth Anchor Scrolling (respects canvas scroll-behavior: auto)
  ------------------------------------------------------------ */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const id = anchor.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      closeMobileMenu();
      const top =
        target.getBoundingClientRect().top + window.scrollY - 78;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  });

  /* ------------------------------------------------------------
     3. Hero Choreography Synced to 94-Frame Scroll Sequence
  ------------------------------------------------------------ */
  const heroHeadline = document.getElementById('hero-headline-wrap');
  const heroBottom = document.getElementById('hero-bottom-grid');
  const scrollCue = document.getElementById('hero-scroll-cue');

  if (window.__scrollSequence && (heroHeadline || heroBottom)) {
    window.__scrollSequence.onProgress((p) => {
      // Subtle cinematic parallax & fade as the camera dollies into Nasir's smile
      const headlineY = -p * 34;
      const headlineScale = 1 + p * 0.04;
      const headlineOpacity = Math.max(0.22, 1 - p * 0.72);

      if (heroHeadline) {
        heroHeadline.style.transform = `translate3d(0, ${headlineY.toFixed(1)}px, 0) scale(${headlineScale.toFixed(4)})`;
        heroHeadline.style.opacity = headlineOpacity.toFixed(3);
      }

      if (heroBottom) {
        const bottomY = p * 18;
        const bottomOpacity = Math.max(0.4, 1 - Math.max(0, p - 0.55) * 1.15);
        heroBottom.style.transform = `translate3d(0, ${bottomY.toFixed(1)}px, 0)`;
        heroBottom.style.opacity = bottomOpacity.toFixed(3);
      }

      if (scrollCue) {
        scrollCue.classList.toggle('is-hidden', p > 0.04);
      }
    });
  }

  /* ------------------------------------------------------------
     4. Scroll Reveal Observer & Active Nav Section Highlight
  ------------------------------------------------------------ */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const revealObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach((el) => revealObs.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  const sectionNavLinks = Array.from(
    document.querySelectorAll('.nav-pill a[data-section]')
  );
  if (sectionNavLinks.length) {
    const sections = sectionNavLinks
      .map((a) => ({
        link: a,
        el: document.getElementById(a.dataset.section),
      }))
      .filter((item) => item.el);

    const updateActiveSection = () => {
      const ordered = [...sections].sort(
        (a, b) => a.el.offsetTop - b.el.offsetTop
      );
      const scrollMid = window.scrollY + window.innerHeight * 0.35;
      let current = ordered[0];
      for (const s of ordered) {
        if (s.el.offsetTop <= scrollMid) {
          current = s;
        }
      }
      sectionNavLinks.forEach((l) => l.classList.remove('is-active'));
      if (current) current.link.classList.add('is-active');
    };

    window.addEventListener('scroll', updateActiveSection, { passive: true });
    updateActiveSection();
  }

  /* ------------------------------------------------------------
     5. Shared Cinema Video Lightbox Modal
  ------------------------------------------------------------ */
  const modal = document.getElementById('video-modal');
  const modalPlayer = document.getElementById('modal-video-player');
  const modalTitle = document.getElementById('modal-video-title');
  const modalSub = document.getElementById('modal-video-sub');
  const modalDesc = document.getElementById('modal-video-desc');
  const modalClose = document.getElementById('modal-close-btn');
  const modalPrev = document.getElementById('modal-prev-btn');
  const modalNext = document.getElementById('modal-next-btn');

  let activeList = videos;
  let activeIndex = 0;

  const loadModalIndex = (idx) => {
    if (!activeList.length || !modalPlayer) return;
    activeIndex = (idx + activeList.length) % activeList.length;
    const item = activeList[activeIndex];

    if (modalTitle) modalTitle.textContent = item.title;
    if (modalSub) {
      modalSub.textContent = `${item.category} • ${item.duration} • ${item.resolution}`;
    }
    if (modalDesc) modalDesc.textContent = item.description;

    modalPlayer.pause();
    modalPlayer.poster = item.poster;
    modalPlayer.src = item.src;
    modalPlayer.load();
    modalPlayer.play().catch(() => {
      // Autoplay may be deferred until user interacts with native controls
    });
  };

  const openVideoModal = (videoId, list = videos) => {
    if (!modal || !list.length) return;
    activeList = list;
    const found = list.findIndex((v) => v.id === videoId);
    loadModalIndex(found >= 0 ? found : 0);
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  };

  const closeVideoModal = () => {
    if (!modal || !modalPlayer) return;
    modalPlayer.pause();
    modalPlayer.removeAttribute('src');
    modalPlayer.load();
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  };

  if (modal) {
    modalClose?.addEventListener('click', closeVideoModal);
    modalPrev?.addEventListener('click', () => loadModalIndex(activeIndex - 1));
    modalNext?.addEventListener('click', () => loadModalIndex(activeIndex + 1));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeVideoModal();
    });

    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('is-open')) {
        if (e.key === 'Escape') closeMobileMenu();
        return;
      }
      if (e.key === 'Escape') closeVideoModal();
      if (e.key === 'ArrowLeft') loadModalIndex(activeIndex - 1);
      if (e.key === 'ArrowRight') loadModalIndex(activeIndex + 1);
    });
  }

  // Wire any [data-play-video] buttons/cards on Homepage (Hero reel + Selected Work)
  document.querySelectorAll('[data-play-video]').forEach((trigger) => {
    const id = trigger.getAttribute('data-play-video');
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openVideoModal(id, videos);
    });
    if (trigger.getAttribute('role') === 'button') {
      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openVideoModal(id, videos);
        }
      });
    }
  });

  /* ------------------------------------------------------------
     6. Dedicated Videos Page Gallery & Category Filtering
  ------------------------------------------------------------ */
  const galleryGrid = document.getElementById('videos-gallery-grid');
  const filterContainer = document.getElementById('video-filter-pills');
  const filterCountEl = document.getElementById('video-filter-count');

  if (galleryGrid && videos.length) {
    const categories = [
      'All',
      ...Array.from(new Set(videos.map((v) => v.category))),
    ];
    let currentCategory = 'All';

    const renderFilters = () => {
      if (!filterContainer) return;
      filterContainer.innerHTML = categories
        .map((cat) => {
          const count =
            cat === 'All'
              ? videos.length
              : videos.filter((v) => v.category === cat).length;
          const activeClass = cat === currentCategory ? ' is-active' : '';
          return `<button type="button" class="filter-pill${activeClass}" data-category="${cat}">${cat} (${count})</button>`;
        })
        .join('');

      filterContainer.querySelectorAll('.filter-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          currentCategory = btn.dataset.category || 'All';
          renderFilters();
          renderGallery();
        });
      });
    };

    const renderGallery = () => {
      const filtered =
        currentCategory === 'All'
          ? videos
          : videos.filter((v) => v.category === currentCategory);

      if (filterCountEl) {
        filterCountEl.textContent = `Showing ${filtered.length} of ${videos.length} productions`;
      }

      galleryGrid.innerHTML = filtered
        .map(
          (v) => `
          <article class="video-gallery-card" tabindex="0" role="button" aria-label="Play ${v.title}" data-video-id="${v.id}">
            <div class="video-thumb-wrap">
              <img src="${v.poster}" alt="${v.title}" loading="lazy" />
              <div class="work-card__scrim">
                <span class="work-card__play" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.14v14l11-7-11-7z"/>
                  </svg>
                </span>
              </div>
              <span class="work-card__badge">${v.badge}</span>
              <span class="work-card__duration">${v.duration}</span>
            </div>
            <div class="video-card-body">
              <div class="video-card-meta">
                <span class="tag-pill">${v.tag}</span>
                <span class="video-res">${v.resolution}</span>
              </div>
              <h2 class="video-card-title">${v.title}</h2>
              <p class="video-card-desc">${v.description}</p>
            </div>
          </article>
        `
        )
        .join('');

      galleryGrid.querySelectorAll('.video-gallery-card').forEach((card) => {
        const id = card.dataset.videoId;
        const triggerOpen = () => openVideoModal(id, filtered);
        card.addEventListener('click', triggerOpen);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            triggerOpen();
          }
        });
      });
    };

    renderFilters();
    renderGallery();
  }

  /* ------------------------------------------------------------
     7. Contact Copy-to-Clipboard & Project Inquiry Form
  ------------------------------------------------------------ */
  document.querySelectorAll('[data-copy-text]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const value = btn.getAttribute('data-copy-text');
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = orig;
        }, 1800);
      } catch {
        window.location.href = `mailto:${value}`;
      }
    });
  });

  const contactForm = document.getElementById('contact-form');
  const formStatus = document.getElementById('form-status');
  if (contactForm && formStatus) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(contactForm);
      const name = String(data.get('name') || '').trim();
      const email = String(data.get('email') || '').trim();
      const service = String(data.get('service') || 'AI Video Production');
      const message = String(data.get('message') || '').trim();

      if (!name || !email || !message) {
        formStatus.style.color = '#ff934f';
        formStatus.textContent = 'Please fill in your name, email, and project details.';
        return;
      }

      const subject = encodeURIComponent(`Project Inquiry (${service}) — ${name}`);
      const body = encodeURIComponent(
        `Hi Nasir,\n\nName: ${name}\nEmail: ${email}\nService: ${service}\n\nProject Brief:\n${message}`
      );
      window.location.href = `mailto:nasirshigri798@gmail.com?subject=${subject}&body=${body}`;
      formStatus.style.color = '#9be7a8';
      formStatus.textContent =
        'Opening your email client with your project brief — or reach out directly via Fiverr or WhatsApp.';
      contactForm.reset();
    });
  }
})();
