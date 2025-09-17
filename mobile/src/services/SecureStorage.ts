// src/services/SecureStorage.ts
// Secure API key storage using expo-secure-store

import * as SecureStore from 'expo-secure-store';

export const API_KEY_STORAGE_KEY = 'gemini_api_key_v1';

export interface StorageResult {
  success: boolean;
  key?: string;
  error?: string;
}

/**
 * Save API key to secure storage
 * @param apiKey - The Gemini API key to store
 * @returns Storage result with success status
 */
export async function saveApiKey(apiKey: string): Promise<StorageResult> {
  try {
    // Validate key format (basic check)
    if (!apiKey || !apiKey.startsWith('AIzaSy')) {
      return {
        success: false,
        error: 'Invalid API key format. Must start with AIzaSy...'
      };
    }

    // Store in secure storage (iOS Keychain, Android Keystore)
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, apiKey);

    console.log('✅ API key saved securely');
    return {
      success: true,
      key: apiKey.substring(0, 10) + '...'
    };
  } catch (error) {
    console.error('Secure storage save error:', error);
    return {
      success: false,
      error: `Failed to save API key: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Retrieve API key from secure storage
 * @returns Storage result with API key if available
 */
export async function getApiKey(): Promise<StorageResult> {
  try {
    const key = await SecureStore.getItemAsync(API_KEY_STORAGE_KEY);

    if (!key) {
      return {
        success: false,
        error: 'No API key found. Please configure your Gemini API key.'
      };
    }

    console.log('✅ API key retrieved from secure storage');
    return {
      success: true,
      key: key.substring(0, 10) + '...'
    };
  } catch (error) {
    console.error('Secure storage get error:', error);
    return {
      success: false,
      error: `Failed to retrieve API key: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Delete API key from secure storage
 * @returns Storage result
 */
export async function deleteApiKey(): Promise<StorageResult> {
  try {
    await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
    console.log('🗑️ API key deleted from secure storage');
    return { success: true };
  } catch (error) {
    console.error('Secure storage delete error:', error);
    return {
      success: false,
      error: `Failed to delete API key: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Check if API key exists in secure storage
 * @returns True if key exists
 */
export async function hasApiKey(): Promise<boolean> {
  try {
    const key = await SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
    return !!key;
  } catch {
    return false;
  }
}

/**
 * Get the full API key (use with caution - prefer getApiKey() for masked version)
 * @returns Full API key string or null
 */
export async function getFullApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Export for testing
export { SecureStore };
