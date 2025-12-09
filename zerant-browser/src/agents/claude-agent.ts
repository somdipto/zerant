import { BrowserAction } from '../types';

const OPENROUTER_API_KEY = 'YOUR_OPENROUTER_KEY'; // User will provide

export async function analyzeWithClaude(
  instruction: string,
  pageContext: string
): Promise<BrowserAction[]> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'amazon/nova-2-lite-v1:free',
      messages: [{
        role: 'user',
        content: `You are ZERANT, an AI browser agent.

USER INSTRUCTION: ${instruction}

PAGE CONTEXT:
${pageContext.slice(0, 5000)}

Return ONLY a JSON array of actions. Available types: click, fill, navigate, extract, scroll, wait.
Example: [{"type":"click","selector":"button","reason":"..."}]`
      }]
    })
  });

  const data = await response.json();
  const text = data.choices[0].message.content;
  const jsonMatch = text.match(/\[[\s\S]*\]/);

  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}