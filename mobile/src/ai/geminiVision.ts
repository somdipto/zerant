// src/ai/geminiVision.ts
// Gemini Vision driver for vision-guided browser automation

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro-vision:generateContent';
const API_KEY = Constants.expoConfig?.extra?.GEMINI_API_KEY as string || '';

if (!API_KEY) {
  throw new Error('GEMINI_API_KEY not configured in app.json');
}

// Action types the agent can perform
export interface Action {
  type: 'click' | 'type' | 'scroll' | 'done';
  x?: number;
  y?: number;
  text?: string;
  submit?: boolean;
  direction?: 'up' | 'down';
  answer?: string;
}

// Main function that sends screenshot to Gemini and gets next action
export async function nextAction(b64PNG: string, task: string): Promise<Action> {
  try {
    const payload = {
      contents: [{
        parts: [
          {
            text: `You are driving a browser to complete exactly this task: "${task}".

Your available actions (output EXACTLY ONE per response):
- CLICK x y (click at coordinates x,y - numbers only, 0-800 for typical mobile viewport)
- TYPE text [SUBMIT] (type text, optional SUBMIT to press enter)
- SCROLL down (scroll down to see more content)
- SCROLL up (scroll up to previous content)
- DONE <summary> (task complete, provide summary of results)

Current browser screenshot attached. Analyze and choose EXACTLY ONE action.
Focus on completing the task efficiently. Coordinates should be within visible viewport.

Output format: CLICK 320 410 | TYPE Search investor emails SUBMIT | SCROLL down | DONE Found 3 investor emails
`
          },
          {
            inline_data: {
              mime_type: 'image/png',
              data: b64PNG
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,  // Low temperature for consistent actions
        topK: 1,
        topP: 0.8,
        maxOutputTokens: 60  // Keep responses short and action-focused
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ]
    };

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      console.warn('No text response from Gemini, using fallback action');
      return { type: 'scroll', direction: 'down' };
    }

    console.log('Gemini Vision Response:', text);

    // Parse the action from Gemini's response
    const action = parseAction(text);
    return action;

  } catch (error) {
    console.error('Gemini Vision error:', error);
    // Fallback to safe scrolling action
    return { type: 'scroll', direction: 'down' };
  }
}

// Parse Gemini's text response into structured action
function parseAction(text: string): Action {
  // Normalize and clean the response
  const cleanText = text.trim().toUpperCase();

  // DONE action - task completion
  if (cleanText.startsWith('DONE')) {
    const summaryMatch = text.match(/DONE\s*(.+)/i);
    return {
      type: 'done',
      answer: summaryMatch ? summaryMatch[1].trim() : 'Task completed'
    };
  }

  // CLICK action with coordinates
  const clickMatch = text.match(/CLICK\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i);
  if (clickMatch) {
    return {
      type: 'click',
      x: Math.round(parseFloat(clickMatch[1])),
      y: Math.round(parseFloat(clickMatch[2]))
    };
  }

  // TYPE action with optional SUBMIT
  const typeMatch = text.match(/TYPE\s+(.+?)(?:\s+SUBMIT)?$/i);
  if (typeMatch) {
    const textContent = typeMatch[1].trim();
    return {
      type: 'type',
      text: textContent,
      submit: text.toLowerCase().includes('submit')
    };
  }

  // SCROLL action
  if (cleanText.includes('SCROLL DOWN')) {
    return { type: 'scroll', direction: 'down' };
  }

  if (cleanText.includes('SCROLL UP')) {
    return { type: 'scroll', direction: 'up' };
  }

  // Default fallback - scroll down to see more content
  console.warn(`Unrecognized action "${text}", defaulting to scroll down`);
  return { type: 'scroll', direction: 'down' };
}

// Validate coordinates are within reasonable viewport bounds
export function validateCoordinates(x: number, y: number, viewportWidth = 800, viewportHeight = 600): boolean {
  return x >= 0 && x <= viewportWidth && y >= 0 && y <= viewportHeight;
}

// Get viewport dimensions (for coordinate validation)
export function getViewportDimensions(): { width: number; height: number } {
  // Default mobile viewport - adjust based on device if needed
  return { width: 375, height: 812 }; // iPhone 12/13 dimensions
}

// Export for testing
export { GEMINI_ENDPOINT, API_KEY };
