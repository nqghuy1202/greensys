/* ============================================================
   notif-panel.onload.js
   Page 0 → Execute when Page Loads
   Load React → ReactDOM → Babel → JSX (sequential)
   ============================================================ */
(function () {
  function loadScript(src, integrity) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
      }
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Kiểm tra đã load chưa (tránh load lại nếu page reload một phần)
  var p = window.React
    ? Promise.resolve()
    : loadScript(
        'https://unpkg.com/react@18.3.1/umd/react.development.js',
        'sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L'
      ).then(function () {
        return loadScript(
          'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
          'sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm'
        );
      });

  p.then(function () {
    return window.Babel
      ? Promise.resolve()
      : loadScript(
          'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
          'sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y'
        );
  }).then(function () {
    window.notifLoadJSX();
  }).catch(function (e) {
    console.error('[notif] dependency load failed:', e);
  });
})();
