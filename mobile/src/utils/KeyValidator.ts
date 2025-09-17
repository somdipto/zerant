// src/utils/KeyValidator.ts
// API key validation utilities for secure storage

import { getFullApiKey } from '../services/SecureStorage';
import Constants from 'expo-constants';

/**
 * Validate Gemini API key format
 * @param key - The API key to validate
 * @returns Validation result
 */
export interface KeyValidationResult {
  isValid: boolean;
  isReal: boolean;
  format: 'valid' | 'invalid' | 'placeholder';
  error?: string;
  maskedKey: string;
}

export async function validateApiKey(key?: string): Promise<KeyValidationResult> {
  // Use provided key or load from storage
  const apiKey = key || await getFullApiKey();

  if (!apiKey) {
    return {
      isValid: false,
      isReal: false,
      format: 'invalid',
      error: 'No API key provided',
      maskedKey: ''
    };
  }

  // Basic format validation
  const googleApiKeyRegex = /^AIza[0-9A-Za-z_-]{35}$/;
  const isValidFormat = googleApiKeyRegex.test(apiKey);

  if (!isValidFormat) {
    return {
      isValid: false,
      isReal: false,
      format: 'invalid',
      error: 'Invalid Google API key format. Must be 39 characters starting with AIza',
      maskedKey: apiKey.substring(0, 10) + '...' + apiKey.slice(-4)
    };
  }

  // Check if it's the placeholder
  const placeholder = Constants.expoConfig?.extra?.GEMINI_API_KEY || 'AIzaSyA...';
  const isPlaceholder = apiKey === placeholder;

  if (isPlaceholder) {
    return {
      isValid: false,
      isReal: false,
      format: 'placeholder',
      error: 'Please replace the placeholder with your actual Gemini API key',
      maskedKey: apiKey.substring(0, 10) + '...'
    };
  }

  // Assume valid format means it's real (final validation would require API call)
  return {
    isValid: true,
    isReal: true,
    format: 'valid',
    maskedKey: apiKey.substring(0, 10) + '...' + apiKey.slice(-4)
  };
}

/**
 * Test API key connectivity by making a simple API call
 * @param key - The API key to test
 * @returns Test result with API status
 */
export interface ApiTestResult {
  success: boolean;
  isConnected: boolean;
  error?: string;
  responseTime?: number;
  modelAvailable?: boolean;
}

export async function testApiKey(key: string): Promise<ApiTestResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-pro-vision:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Test connection' }] }],
          generationConfig: { maxOutputTokens: 1 }
        })
      }
    );

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      if (response.status === 400) {
        return {
          success: false,
          isConnected: false,
          error: 'Invalid API key - please check your key'
        };
      }
      if (response.status === 403) {
        return {
          success: false,
          isConnected: false,
          error: 'API key invalid or insufficient permissions'
        };
      }
      if (response.status === 429) {
        return {
          success: false,
          isConnected: true,
          error: 'Rate limit exceeded - key is valid but over quota'
        };
      }
      return {
        success: false,
        isConnected: false,
        error: `API error: ${response.status} ${response.statusText}`
      };
    }

    const result = await response.json();
    const isModelAvailable = result.candidates && result.candidates.length > 0;

    return {
      success: true,
      isConnected: true,
      isModelAvailable,
      responseTime,
      error: undefined
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Network error';
    return {
      success: false,
      isConnected: false,
      error: `Connection failed: ${errorMsg}`
    };
  }
}

/**
 * Get validation status for the currently stored key
 * @returns Current key validation status
 */
export async function getCurrentKeyStatus(): Promise<KeyValidationResult> {
  const storedKey = await getFullApiKey();
  return validateApiKey(storedKey);
}

/**
 * Get API connectivity status for the currently stored key
 * @returns Current API connection status
 */
export async function getCurrentApiStatus(): Promise<ApiTestResult> {
  const storedKey = await getFullApiKey();
  if (!storedKey) {
    return {
      success: false,
      isConnected: false,
      error: 'No API key stored'
    };
  }
  return testApiKey(storedKey);
}

// Export for testing
export { validateApiKey, testApiKey, getCurrentKeyStatus, getCurrentApiStatus };
