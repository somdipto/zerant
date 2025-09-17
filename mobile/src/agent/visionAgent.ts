// src/agent/visionAgent.ts
// Vision-guided browser automation agent using Gemini + BrowserOS

import { browser, withErrorHandling, registerScreenshotCallback } from '../native/browserOS';
import { nextAction, Action, validateCoordinates } from '../ai/geminiVision';
import { getViewportDimensions } from '../ai/geminiVision';

// Agent execution result
export interface AgentResult {
  success: boolean;
  answer?: string;
  steps: number;
  actions: string[];
  contacts?: Array<{
    value: string;
    type: 'email' | 'phone' | 'address';
    confidence: number;
    source: 'gemini' | 'dom' | 'screenshot';
  }>;
  error?: string;
  finalURL?: string;
}

// Main agent execution function
export async function runTask(task: string, maxSteps = 25, onProgress?: (message: string, step: number) => void): Promise<AgentResult> {
  console.log(`🤖 Vision-Agent starting: "${task}" (max ${maxSteps} steps)`);

  const result: AgentResult = {
    success: false,
    steps: 0,
    actions: [],
    contacts: []
  };

  let currentStep = 0;
  let extractedContacts: any[] = [];
  let screenshotCallback: { remove: () => void } | null = null;

  try {
    // Step 1: Initialize browser and navigate to Google
    onProgress?.('🌐 Opening Google...', 0);
    await withErrorHandling('navigation', () => browser.newTab('https://www.google.com'));
    result.actions.push('Navigate to Google');

    // Step 2: Register screenshot callback for real-time monitoring
    screenshotCallback = registerScreenshotCallback((base64) => {
      onProgress?.(`📸 Screenshot captured (${((base64.length / 1024) | 0)}KB)`, currentStep);
    });

    // Human-like delay for page load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Main agent loop
    while (currentStep < maxSteps) {
      currentStep++;
      result.steps = currentStep;

      // Step 3: Capture current screenshot
      onProgress?.(`🔍 Step ${currentStep}: Analyzing screen state...`, currentStep);
      const screenshot = await withErrorHandling('screenshot', () => browser.screenshot());
      result.actions.push(`Screenshot #${currentStep}`);

      // Step 4: Get Gemini's next action
      onProgress?.(`🧠 Gemini deciding next action for step ${currentStep}...`, currentStep);
      const action = await nextAction(screenshot, task);
      result.actions.push(`Gemini Action: ${action.type}${action.text ? ` "${action.text}"` : ''}${action.x ? ` (${action.x},${action.y})` : ''}`);

      // Step 5: Execute the action
      switch (action.type) {
        case 'click':
          if (action.x && action.y) {
            const viewport = await getViewportDimensions();
            if (validateCoordinates(action.x, action.y, viewport.width, viewport.height)) {
              await withErrorHandling('click', () => browser.click(action.x, action.y));
              result.actions.push(`Clicked at (${action.x}, ${action.y})`);
              onProgress?.(`🖱️ Clicked at (${action.x}, ${action.y})`, currentStep);
            } else {
              console.warn(`Invalid click coordinates: (${action.x}, ${action.y})`);
              onProgress?.(`⚠️ Invalid click coordinates, scrolling instead`, currentStep);
              await browser.scroll(true);
            }
          }
          break;

        case 'type':
          if (action.text) {
            await withErrorHandling('type', () => browser.type(action.text || '', action.submit || false));
            result.actions.push(`Typed: "${action.text}"${action.submit ? ' + Enter' : ''}`);
            onProgress?.(`⌨️ Typed: "${action.text}"${action.submit ? ' + Enter' : ''}`, currentStep);
          }
          break;

        case 'scroll':
          await withErrorHandling('scroll', () => browser.scroll(action.direction === 'down'));
          result.actions.push(`Scrolled ${action.direction || 'down'}`);
          onProgress?.(`📜 Scrolled ${action.direction || 'down'}`, currentStep);
          break;

        case 'done':
          // Task completed!
          result.success = true;
          result.answer = action.answer || 'Task completed successfully';
          result.finalURL = await browser.getCurrentURL();

          // Try to extract final contacts if not already done
          if (extractedContacts.length === 0) {
            extractedContacts = await extractFinalContacts();
          }

          result.contacts = extractedContacts;
          onProgress?.(`✅ Task complete! ${action.answer}`, currentStep);
          console.log(`🎉 Vision-Agent completed: ${action.answer}`);
          return result;
      }

      // Human-like delay between actions
      await new Promise(resolve => setTimeout(resolve, 700));

      // Optional: Extract contacts after significant actions (clicks, typing)
      if (['click', 'type'].includes(action.type)) {
        const newContacts = await extractContactsFromCurrentPage();
        if (newContacts.length > 0) {
          extractedContacts.push(...newContacts);
          extractedContacts = [...new Set(extractedContacts.map(c => JSON.stringify(c)))].map(s => JSON.parse(s));
          onProgress?.(`📧 Found ${newContacts.length} new contacts (total: ${extractedContacts.length})`, currentStep);
        }
      }
    }

    // Max steps reached
    result.answer = `Max steps (${maxSteps}) reached. Partial progress made.`;
    result.finalURL = await browser.getCurrentURL();
    result.contacts = extractedContacts;
    onProgress?.(`⏱️ Max steps reached: ${result.answer}`, currentStep);
    console.log(`⚠️ Vision-Agent stopped: ${result.answer}`);

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.success = false;
    result.answer = `Error occurred: ${result.error}`;
    onProgress?.(`❌ Error: ${result.error}`, currentStep);
    console.error('Vision-Agent error:', error);
  } finally {
    // Cleanup
    if (screenshotCallback) {
      screenshotCallback.remove();
    }
    // Close browser tab (optional)
    // await browser.newTab('about:blank');
  }

  return result;
}

// Extract contacts from current page using DOM analysis
async function extractContactsFromCurrentPage(): Promise<any[]> {
  try {
    // Inject JavaScript to extract contacts from current DOM
    const jsCode = `
      (function() {
        const contacts = [];

        // Email extraction
        const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/gi;
        const bodyText = document.body.innerText;
        const emails = [...bodyText.matchAll(emailRegex)].slice(0, 5);

        emails.forEach(email => {
          contacts.push({
            value: email[1],
            type: 'email',
            confidence: 0.8,
            source: 'dom',
            context: 'body text extraction'
          });
        });

        // Phone extraction
        const phoneRegex = /((?:\\+?1[-. ]?)?\\(?([0-9]{3})\\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4}))/g;
        const phones = [...bodyText.matchAll(phoneRegex)].slice(0, 3);

        phones.forEach(phone => {
          contacts.push({
            value: phone[0],
            type: 'phone',
            confidence: 0.7,
            source: 'dom',
            context: 'body text extraction'
          });
        });

        // Contact links
        const contactLinks = Array.from(document.querySelectorAll('a[href]')).filter(link => {
          const href = link.getAttribute('href') || '';
          const text = link.textContent || '';
          return href.includes('mailto:') ||
                 href.includes('contact') ||
                 text.toLowerCase().includes('email') ||
                 text.toLowerCase().includes('phone');
        }).slice(0, 3);

        contactLinks.forEach(link => {
          const href = link.getAttribute('href') || '';
          if (href.startsWith('mailto:')) {
            contacts.push({
              value: href.replace('mailto:', ''),
              type: 'email',
              confidence: 0.9,
              source: 'dom',
              context: 'mailto link'
            });
          }
        });

        return contacts;
      })();
    `;

    const result = await withErrorHandling('dom_extraction', () => browser.evaluateJavaScript(jsCode));
    const contacts = JSON.parse(result || '[]');

    console.log(`DOM extraction found ${contacts.length} contacts`);
    return contacts;
  } catch (error) {
    console.warn('DOM extraction failed:', error);
    return [];
  }
}

// Extract final contacts when task completes
async function extractFinalContacts(): Promise<any[]> {
  console.log('🔍 Extracting final contacts from completed task...');
  return await extractContactsFromCurrentPage();
}

// Agent utilities
export const visionAgentUtils = {
  // Estimate task complexity (number of steps needed)
  estimateSteps: (task: string): number => {
    const simpleTasks = ['search', 'find', 'get', 'look up'];
    const complexTasks = ['research', 'analyze', 'compare', 'multiple'];

    const lowerTask = task.toLowerCase();
    if (simpleTasks.some(word => lowerTask.includes(word))) return 8;
    if (complexTasks.some(word => lowerTask.includes(word))) return 20;
    return 12; // Default
  },

  // Pre-process task for better Gemini understanding
  preprocessTask: (task: string): string => {
    const processed = task
      .replace(/investor emails?/gi, 'investor contact email addresses')
      .replace(/contact info/gi, 'email addresses and phone numbers')
      .replace(/find the/gi, 'locate and extract');

    return processed.charAt(0).toUpperCase() + processed.slice(1);
  },

  // Clean up extracted contacts (deduplicate, validate)
  cleanupContacts: (contacts: any[]): any[] => {
    // Remove duplicates
    const unique = contacts.filter((contact, index, self) =>
      index === self.findIndex(c => c.value.toLowerCase() === contact.value.toLowerCase())
    );

    // Sort by confidence and type
    return unique
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .filter(c => (c.confidence || 0) > 0.5) // Filter low confidence
      .slice(0, 10); // Limit to top 10
  }
};

// Export for testing
export { extractContactsFromCurrentPage, extractFinalContacts };
