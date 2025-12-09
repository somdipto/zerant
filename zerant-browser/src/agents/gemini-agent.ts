import { GoogleGenerativeAI } from '@google/generative-ai';
import { BrowserAction } from '../types';

const GEMINI_API_KEY = 'AIzaSyCOpv1TqFGhez_g9lTTzdH5PGrxT87e070';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function analyzeWithGemini(
  instruction: string,
  pageContext: string
): Promise<BrowserAction[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const prompt = `You are ZERANT, an AI browser agent.

USER INSTRUCTION: ${instruction}

PAGE CONTEXT:
${pageContext.slice(0, 5000)}

Return ONLY a JSON array of actions. Available types: click, fill, navigate, extract, scroll, wait.
Example: [{"type":"navigate","url":"https://google.com"},{"type":"fill","selector":"input[name='q']","value":"search term"},{"type":"click","selector":"button[type='submit']"}]

Return valid JSON array only, no explanation.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\[[\s\S]*\]/);

  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}