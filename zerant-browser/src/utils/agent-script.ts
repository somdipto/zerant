export const AGENT_SCRIPT = `
(function() {
  window.getPageContext = function() {
    return {
      url: window.location.href,
      title: document.title,
      html: document.body.innerHTML.slice(0, 10000),
      text: document.body.innerText.slice(0, 5000)
    };
  };

  window.executeAction = function(action) {
    try {
      switch(action.type) {
        case 'click':
          let clickEl;

          // Special handling for YouTube and other complex sites
          if (window.location.hostname.includes('youtube.com')) {
            if (action.selector) {
              // Try the provided selector first
              clickEl = document.querySelector(action.selector);
            }

            // If no specific selector or element not found, try common YouTube selectors
            if (!clickEl) {
              if (action.value && action.value.toLowerCase().includes('play')) {
                // Look for play buttons on YouTube
                clickEl = document.querySelector('button.ytp-play-button') ||
                         document.querySelector('ytd-play-button') ||
                         document.querySelector('.play-button') ||
                         document.querySelector('#play') ||
                         document.querySelector('button[title*="Play" i]') ||
                         document.querySelector('button[title*="Pause" i]');
              } else {
                // General search for the action value in text
                const possibleElements = Array.from(document.querySelectorAll('button, a, #thumbnail, .yt-simple-endpoint'));
                clickEl = possibleElements.find(el =>
                  el.textContent && el.textContent.toLowerCase().includes(action.value ? action.value.toLowerCase() : '')
                );
              }
            }
          }

          // Default behavior if not YouTube or YouTube-specific selectors didn't work
          if (!clickEl) {
            clickEl = action.selector ?
              document.querySelector(action.selector) :
              document.querySelector('a, button');
          }

          if (clickEl) {
            clickEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            clickEl.click();

            // Additional click for video elements (sometimes needed for play buttons)
            if (action.value && (action.value.toLowerCase().includes('play') || action.value.toLowerCase().includes('video'))) {
              setTimeout(() => {
                if (clickEl && clickEl.getAttribute('aria-label') &&
                   (clickEl.getAttribute('aria-label').toLowerCase().includes('play') ||
                    clickEl.getAttribute('aria-label').toLowerCase().includes('pause'))) {
                  clickEl.click();
                }
              }, 500);
            }

            return { success: true, elementText: clickEl.textContent || clickEl.title || 'clicked element' };
          } else {
            return { success: false, error: 'Element not found for click action' };
          }

        case 'fill':
          const input = document.querySelector(action.selector);
          if (input) {
            input.value = action.value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            return { success: true, value: action.value };
          } else {
            return { success: false, error: 'Input element not found for fill action' };
          }

        case 'navigate':
          if (action.url) {
            window.location.href = action.url;
            return { success: true, url: action.url };
          } else {
            return { success: false, error: 'No URL provided for navigate action' };
          }

        case 'extract':
          const elements = document.querySelectorAll(action.selector || 'p, h1, h2, h3, .yt-formatted-string, #title, #video-title');
          const data = Array.from(elements).slice(0, 10).map(el => el.textContent.trim());
          return { success: true, data };

        case 'scroll':
          window.scrollBy(0, action.amount || 500);
          return { success: true, amount: action.amount || 500 };

        case 'wait':
          // This is handled in the React Native app, not in the script
          return { success: true, waitTime: action.amount || 1000 };

        case 'hover':
          const hoverEl = document.querySelector(action.selector);
          if (hoverEl) {
            hoverEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            return { success: true };
          } else {
            return { success: false, error: 'Element not found for hover action' };
          }

        default:
          return { success: false, error: 'Unknown action type: ' + action.type };
      }
    } catch(e) {
      return { success: false, error: e.message };
    }
  };

  true;
})();
`;