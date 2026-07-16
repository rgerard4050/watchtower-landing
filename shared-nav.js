(function () {
  const pages = [
    { path: 'index.html', label: 'Home', title: 'Public landing' },
    { path: 'resident.html', label: 'Residents', title: 'Resident portal' },
    { path: 'business.html', label: 'Businesses', title: 'Business portal' },
    { path: 'terminal.html', label: 'Operators', title: 'Operator tools' },
    { path: 'learn.html', label: 'Learn', title: 'How it works' },
  ];

  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const currentFile = currentPath.split('?')[0] || 'index.html';

  function isCurrent(pagePath) {
    return currentFile === pagePath;
  }

  if (document.querySelector('.shared-nav')) return;

  const style = document.createElement('style');
  style.textContent = `
    .shared-nav {
      position: sticky;
      top: 0;
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 18px;
      background: rgba(6, 10, 13, 0.96);
      border-bottom: 1px solid #1a2a38;
      backdrop-filter: blur(10px);
      font-family: 'Share Tech Mono', monospace;
      letter-spacing: 0.08em;
    }
    .shared-nav .brand {
      color: #00ff88;
      font-size: 12px;
      text-transform: uppercase;
      text-decoration: none;
      font-weight: 700;
    }
    .shared-nav .links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .shared-nav .nav-link {
      color: #5a7a8a;
      text-decoration: none;
      font-size: 10px;
      padding: 6px 10px;
      border-radius: 999px;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .shared-nav .nav-link:hover,
    .shared-nav .nav-link.active {
      background: rgba(0, 255, 136, 0.12);
      color: #00ff88;
    }
    @media (max-width: 700px) {
      .shared-nav { padding: 10px 12px; }
      .shared-nav .links { gap: 4px; }
      .shared-nav .nav-link { padding: 5px 8px; font-size: 9px; }
    }
  `;
  document.head.appendChild(style);

  const nav = document.createElement('nav');
  nav.className = 'shared-nav';
  nav.setAttribute('aria-label', 'Primary');

  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = 'index.html';
  brand.textContent = 'Watchtower';

  const links = document.createElement('div');
  links.className = 'links';

  pages.forEach((page) => {
    const link = document.createElement('a');
    link.className = 'nav-link';
    link.href = page.path;
    link.textContent = page.label.toUpperCase();
    if (isCurrent(page.path)) {
      link.classList.add('active');
    }
    links.appendChild(link);
  });

  nav.appendChild(brand);
  nav.appendChild(links);
  document.body.insertBefore(nav, document.body.firstChild);
})();
