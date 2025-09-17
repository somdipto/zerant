// Browser-compatible utilities for ContactSearchAgent

/**
 * Convert base64 string to ArrayBuffer for image processing
 * @param base64 - Base64 encoded image data
 * @returns ArrayBuffer representation
 */
export async function base64ToArrayBuffer(base64: string): Promise<ArrayBuffer> {
  // Remove data URL prefix if present (data:image/png;base64,)
  const base64Data = base64.replace(/^data:image\\/[a-z]+\\/[a-z]+;base64,/, '');

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}

/**
 * Convert ArrayBuffer to base64 string for API calls
 * @param buffer - ArrayBuffer image data
 * @returns Base64 encoded string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  let bytesLength = bytes.byteLength;

  for (let i = 0; i < bytesLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

/**
 * Validate image data integrity
 * @param buffer - Image ArrayBuffer
 * @returns Validation result
 */
export function validateImageData(buffer: ArrayBuffer): {
  isValid: boolean;
  sizeKB: number;
  mimeType?: string;
} {
  const sizeKB = (buffer.byteLength / 1024).toFixed(1);

  // Basic validation - check if it's a reasonable image size
  if (buffer.byteLength < 1000 || buffer.byteLength > 10 * 1024 * 1024) { // 1KB to 10MB
    return { isValid: false, sizeKB: parseFloat(sizeKB) };
  }

  // Check for common image headers
  const uint8Array = new Uint8Array(buffer);
  const header = uint8Array.slice(0, 8);
  const headerHex = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join('');

  const imageSignatures = {
    png: '89504e47',    // PNG
    jpeg: 'ffd8ffe0',   // JPEG (JFIF)
    jpeg2: 'ffd8ffdb',  // JPEG (other)
    gif: '47494638',    // GIF
    webp: '52494646'    // WebP (RIFF)
  };

  let mimeType: string | undefined;
  for (const [type, signature] of Object.entries(imageSignatures)) {
    if (headerHex.startsWith(signature)) {
      mimeType = `image/${type === 'jpeg' || type === 'jpeg2' ? 'jpeg' : type}`;
      break;
    }
  }

  return {
    isValid: !!mimeType,
    sizeKB: parseFloat(sizeKB),
    mimeType
  };
}

/**
 * Compress image data if too large for API limits
 * @param buffer - Original image buffer
 * @param maxSizeKB - Maximum size in KB
 * @returns Compressed buffer
 */
export async function compressImageIfNeeded(
  buffer: ArrayBuffer,
  maxSizeKB: number = 2048 // 2MB default for Gemini API
): Promise<ArrayBuffer> {
  const validation = validateImageData(buffer);
  if (validation.isValid && parseFloat(validation.sizeKB) <= maxSizeKB) {
    return buffer; // No compression needed
  }

  // For browser environment, we'll need to use Canvas API for compression
  // This is a simplified version - in production, implement full compression
  console.warn(`Image size ${validation.sizeKB}KB exceeds limit ${maxSizeKB}KB. Compression needed but not implemented in browser context.`);
  return buffer; // Return original for now
}

/**
 * Extract image dimensions from buffer (basic implementation)
 * @param buffer - Image ArrayBuffer
 * @returns Dimensions or null if not detectable
 */
export function getImageDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  const uint8Array = new Uint8Array(buffer);

  // PNG IHDR chunk (basic detection)
  if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47) {
    // Find IHDR chunk starting at byte 12
    for (let i = 12; i < buffer.byteLength - 8; i++) {
      if (uint8Array[i] === 0x49 && uint8Array[i+1] === 0x48 && uint8Array[i+2] === 0x44 && uint8Array[i+3] === 0x52) {
        // Width at bytes i+4 to i+7 (big-endian)
        const width = (uint8Array[i+4] << 24) | (uint8Array[i+5] << 16) | (uint8Array[i+6] << 8) | uint8Array[i+7];
        // Height at bytes i+8 to i+11
        const height = (uint8Array[i+8] << 24) | (uint8Array[i+9] << 16) | (uint8Array[i+10] << 8) | uint8Array[i+11];
        return { width, height };
      }
    }
  }

  // JPEG (simplified - looks for SOF markers)
  if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
    // This is more complex - for now return null
  }

  return null;
}
