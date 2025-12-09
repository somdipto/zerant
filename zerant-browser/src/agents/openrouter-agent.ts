import { BrowserAction } from '../types';

// Using the Amazon Nova-2 model (free tier compatible)
const OPENROUTER_API_KEY = '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';

export async function analyzeWithOpenRouter(
  instruction: string,
  pageContext: string
): Promise<BrowserAction[]> {

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://zerant.app',
      'X-Title': 'Zerant Browser Agent'
    },
    body: JSON.stringify({
      model: 'amazon/nova-2-lite-v1:free',
      messages: [{
        role: 'user',
        content: `You are ZERANT, an AI browser agent. Follow these instructions precisely:

USER INSTRUCTION: ${instruction}

PAGE CONTEXT:
${pageContext.slice(0, 5000)}

For YouTube tasks:
- To play a video: First search for the video, then click on the video thumbnail to navigate to the video page, then click the play button
- Use selectors like 'button.ytp-play-button' or '#play' for YouTube play buttons
- For YouTube search: fill the search input (usually '#search' or '.ytd-search') and press enter by clicking the search button

For general web tasks:
- Navigate to a URL using the navigate action type
- Fill forms with the fill action type
- Click elements with the click action type
- Use specific selectors when possible
- Add the 'reason' field to explain why you're taking each action

Available action types: navigate, click, fill, extract, scroll, wait
- navigate: {type:'navigate', url:'https://example.com', reason:'explanation'}
- click: {type:'click', selector:'css-selector', value:'optional text', reason:'explanation'}
- fill: {type:'fill', selector:'css-selector', value:'text', reason:'explanation'}
- extract: {type:'extract', selector:'css-selector', reason:'explanation'}
- scroll: {type:'scroll', amount:500, reason:'explanation'}
- wait: {type:'wait', amount:1000, reason:'explanation'}

Important guidelines:
- Always include a 'reason' for each action
- Use specific CSS selectors when available
- For click actions on YouTube, look for play/pause buttons using selectors like .ytp-play-button, #play, or [aria-label*="Play"]
- On search pages, click on result links to navigate to content
- When a page loads, wait 2-3 seconds before taking the next action
- Return ONLY a JSON array of actions, no other text.

Example for YouTube: [{"type":"fill","selector":"#search","value":"cat videos","reason":"Search for cat videos"},{"type":"click","selector":"#search-icon","reason":"Click search button"},{"type":"click","selector":"#video-thumbnail","value":"cat video","reason":"Click on first video"},{"type":"click","selector":"button.ytp-play-button","value":"play","reason":"Click play button"}]

Return ONLY the JSON array with actions to fulfill the user's request.`
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.choices[0].message.content;
  const jsonMatch = text.match(/\[[\s\S]*\]/);

  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}
