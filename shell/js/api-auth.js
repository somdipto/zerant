(() => {
  if (typeof window.fetch !== 'function') {
    return;
  }

  let cachedToken = window.__ZERANT_TOKEN__ || '';
  let tokenPromise = null;

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function loadTokenWithRetry() {
    if (cachedToken) {
      return cachedToken;
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const token = await window.zerant?.getApiToken?.();
        if (typeof token === 'string' && token.trim()) {
          cachedToken = token.trim();
          window.__ZERANT_TOKEN__ = cachedToken;
          return cachedToken;
        }
      } catch {
        // IPC handler may not be ready during the earliest startup phase.
      }

      await sleep(100);
    }

    return '';
  }

  async function getToken() {
    if (cachedToken) {
      return cachedToken;
    }

    if (!tokenPromise) {
      tokenPromise = loadTokenWithRetry().finally(() => {
        tokenPromise = null;
      });
    }

    return tokenPromise;
  }

  function isLocalZerantApiUrl(input) {
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url;

    if (!rawUrl) {
      return false;
    }

    try {
      const url = new URL(rawUrl, window.location.href);
      return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '8765';
    } catch {
      return false;
    }
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (!isLocalZerantApiUrl(input)) {
      return originalFetch(input, init);
    }

    const token = await getToken();
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const auth = headers.get('Authorization')?.trim();

    if (token && (!auth || /^Bearer$/i.test(auth))) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (input instanceof Request) {
      return originalFetch(new Request(input, { ...init, headers }));
    }

    return originalFetch(input, { ...init, headers });
  };
})();
