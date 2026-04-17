(() => {
    const renderer = window.__zerantRenderer;
    if (!renderer) {
      console.error('[shortcut-router] Missing renderer bridge');
      return;
    }

    if (!window.zerant) {
      return;
    }

    function getActiveTabId() {
      return renderer.getActiveTabId();
    }

    window.zerant.onShortcut((action) => {
      if (action === 'new-tab') {
        window.zerant.newTab();
      } else if (action === 'close-tab') {
        const activeTabId = getActiveTabId();
        if (activeTabId) window.zerant.closeTab(activeTabId);
      } else if (action === 'quick-screenshot') {
        window.zerant.quickScreenshot();
      } else if (action === 'open-settings') {
        window.openSettings?.();
      } else if (action === 'bookmark-page') {
        window.openBookmarkPopup?.();
      } else if (action === 'toggle-bookmarks-bar') {
        window.toggleBookmarksBar?.();
      } else if (action === 'find-in-page') {
        window.toggleFindBar?.(true);
      } else if (action === 'open-history') {
        window.openHistoryPage?.();
      } else if (action === 'open-bookmarks') {
        if (typeof ocSidebar !== 'undefined') ocSidebar.activateItem('bookmarks');
      } else if (action === 'show-about') {
        renderAboutPanel();
      } else if (action === 'show-shortcuts') {
        showShortcutsOverlay();
      } else if (action === 'zoom-in') {
        window.changeZoom?.('in');
      } else if (action === 'zoom-out') {
        window.changeZoom?.('out');
      } else if (action === 'zoom-reset') {
        window.changeZoom?.('reset');
      } else if (action.startsWith('focus-tab-')) {
        const index = parseInt(action.replace('focus-tab-', ''), 10);
        window.zerant.focusTabByIndex(index);
      } else if (action === 'claronote-record') {
        document.querySelectorAll('.panel-tab').forEach((button) => button.classList.remove('active'));
        document.querySelector('[data-panel-tab="claronote"]').classList.add('active');
        document.getElementById('panel-activity').style.display = 'none';
        document.getElementById('panel-chat').style.display = 'none';
        document.getElementById('panel-screenshots').style.display = 'none';
        document.getElementById('panel-claronote').style.display = 'flex';

        if (typeof window.openWingmanPanel === 'function') {
          window.openWingmanPanel();
        } else if (!document.getElementById('wingman-panel').classList.contains('open')) {
          document.getElementById('wingman-panel').classList.add('open');
          if (typeof window.updatePanelLayout === 'function') {
            window.updatePanelLayout();
          }
        }

        if (typeof window.initClaroNote === 'function') {
          window.initClaroNote().then(() => {
            if (typeof window.toggleClaroNoteRecording === 'function') {
              window.toggleClaroNoteRecording();
            }
          });
        }
      } else if (action === 'voice-input') {
        window.zerant.toggleVoice();
      } else if (action === 'show-onboarding') {
        showOnboarding();
      }
    });
})();
