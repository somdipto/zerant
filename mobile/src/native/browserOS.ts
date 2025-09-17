import { NativeModules } from 'react-native';

// Type definitions for native methods
export interface BrowserOSNative {
  // Core browser methods
  loadURL: (url: string) => Promise<void>;
  screenshot: () => Promise<string>; // Returns base64 PNG
  dispatchGesture: (gesture: { type: 'tap' | 'swipe'; x?: number; y?: number; duration?: number }) => Promise<void>;
  dispatchKeyEvent: (event: { text?: string; keyCode?: number }) => Promise<void>;
  scrollBy: (params: { direction: 'up' | 'down'; pixels: number }) => Promise<void>;
  getCurrentURL: () => Promise<string>;
  injectJavaScript: (js: string) => Promise<void>;
  evaluateJavaScript: (js: string) => Promise<string>;
  getViewportDimensions: () => Promise<{ width: number; height: number }>;
  registerScreenshotCallback?: (callback: (base64: string) => void) => string | null;
  unregisterScreenshotCallback?: (callbackId: string) => void;
}

// Fallback implementation for when native module is not available
const fallbackImplementation: BrowserOSNative = {
  loadURL: async (url: string) => {
    console.log(`Fallback: Loading URL ${url}`);
    return Promise.resolve();
  },
  screenshot: async () => {
    console.log('Fallback: Screenshot requested');
    return Promise.reject(new Error('Native screenshot not available in fallback'));
  },
  dispatchGesture: async (gesture: any) => {
    console.log('Fallback: Gesture dispatched', gesture);
    return Promise.reject(new Error('Native gestures not available in fallback'));
  },
  dispatchKeyEvent: async (event: any) => {
    console.log('Fallback: Key event dispatched', event);
    return Promise.reject(new Error('Native key events not available in fallback'));
  },
  scrollBy: async (params: any) => {
    console.log('Fallback: Scroll by', params);
    return Promise.reject(new Error('Native scroll not available in fallback'));
  },
  getCurrentURL: async () => {
    console.log('Fallback: Getting current URL');
    return Promise.resolve('about:blank');
  },
  injectJavaScript: async (js: string) => {
    console.log('Fallback: Injecting JS (no-op)');
    return Promise.resolve();
  },
  evaluateJavaScript: async (js: string) => {
    console.log('Fallback: Evaluating JS (no-op)');
    return Promise.resolve('undefined');
  },
  getViewportDimensions: async () => {
    return Promise.resolve({ width: 375, height: 667 });
  },
  registerScreenshotCallback: undefined as any,
  unregisterScreenshotCallback: undefined as any
};

// Get the native module safely
const nativeModule = NativeModules.BrowserOS;

// Create the API using native or fallback
const api: BrowserOSNative = nativeModule || fallbackImplementation;

// Debug log
console.log('BrowserOS API initialized:', nativeModule ? 'Using native module' : 'Using fallback implementation');

// Export the API
export const browserOS = api;

// Utility functions
export async function getViewportDimensions(): Promise<{ width: number; height: number }> {
  try {
    if (nativeModule?.getViewportDimensions) {
      const dimensions = await nativeModule.getViewportDimensions();
      if (dimensions) {
        return dimensions;
      }
    }
  } catch (error) {
    console.warn('Viewport dimensions not available, using defaults');
  }

  // Default mobile viewport
  return { width: 390, height: 844 };
}

// Screenshot callback management
let screenshotCallback: ((base64: string) => void) | null = null;
let callbackId: string | null = null;

export function registerScreenshotCallback(callback: (base64: string) => void): { remove: () => void } {
  screenshotCallback = callback;

  if (nativeModule?.registerScreenshotCallback) {
    callbackId = nativeModule.registerScreenshotCallback((base64: string) => {
      if (screenshotCallback) {
        screenshotCallback(base64);
      }
    });
  }

  return {
    remove: () => {
      if (callbackId && nativeModule?.unregisterScreenshotCallback) {
        nativeModule.unregisterScreenshotCallback(callbackId);
      }
      screenshotCallback = null;
      callbackId = null;
    }
  };
}

// Error handling wrapper
export async function withErrorHandling<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`BrowserOS ${operation} failed:`, error);
    throw new Error(`Browser operation failed (${operation}): ${String(error)}`);
  }
}

// Convenience methods
export const browser = {
  newTab: async (url: string) => {
    try {
      console.log(`🌐 Navigating to: ${url}`);
      await api.loadURL(url);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for load
    } catch (error) {
      console.error('Navigation error:', error);
      throw new Error(`Failed to navigate to ${url}: ${String(error)}`);
    }
  },

  click: async (x: number, y: number) => {
    try {
      console.log(`🖱️ Clicking at (${x}, ${y})`);
      const viewport = await getViewportDimensions();
      x = Math.max(0, Math.min(x, viewport.width - 1));
      y = Math.max(0, Math.min(y, viewport.height - 1));

      await api.dispatchGesture({
        type: 'tap',
        x,
        y,
        duration: 100
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Click error:', error);
      throw new Error(`Click failed at (${x}, ${y}): ${String(error)}`);
    }
  },

  type: async (text: string, submit = false) => {
    try {
      console.log(`⌨️ Typing: "${text}"${submit ? ' + Enter' : ''}`);
      for (const char of text) {
        await api.dispatchKeyEvent({ text: char });
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (submit) {
        await api.dispatchKeyEvent({ keyCode: 66 }); // Enter
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error('Typing error:', error);
      throw new Error(`Typing failed: ${String(error)}`);
    }
  },

  scroll: async (down = true) => {
    try {
      const direction = down ? 'down' : 'up';
      console.log(`📜 Scrolling ${direction}`);
      await api.scrollBy({
        direction: direction as 'up' | 'down',
        pixels: 500
      });
      await new Promise(resolve => setTimeout(resolve, 400));
    } catch (error) {
      console.error('Scroll error:', error);
      throw new Error(`Scroll ${down ? 'down' : 'up'} failed: ${String(error)}`);
    }
  }
};

// Export types
export type { BrowserOSNative };
