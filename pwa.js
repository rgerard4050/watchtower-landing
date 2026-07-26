// Registers the service worker and surfaces an install button when the browser
// says the app is installable. Include on any page that should be an entry point
// for installing Watchtower.
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (err) {
        console.warn('[pwa] service worker registration failed:', err);
      });
    });
  }

  // Chrome/Edge/Android only. iOS Safari never fires this — installing there is
  // Share -> Add to Home Screen, which we cannot trigger programmatically.
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    var btn = document.getElementById('wtInstallBtn');
    if (btn) btn.remove();
  });

  function showInstallButton() {
    if (document.getElementById('wtInstallBtn')) return;

    var btn = document.createElement('button');
    btn.id = 'wtInstallBtn';
    btn.type = 'button';
    btn.textContent = 'INSTALL APP';
    btn.style.cssText = [
      'position:fixed', 'bottom:18px', 'right:18px', 'z-index:2000',
      'padding:11px 16px', 'border:1px solid #00ff88', 'border-radius:999px',
      'background:rgba(6,10,13,0.94)', 'color:#00ff88', 'cursor:pointer',
      "font-family:'Share Tech Mono',monospace", 'font-size:11px',
      'letter-spacing:0.1em', 'backdrop-filter:blur(10px)',
      'box-shadow:0 4px 20px rgba(0,0,0,0.5)'
    ].join(';');

    btn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
        btn.remove();
      });
    });

    document.body.appendChild(btn);
  }
})();
