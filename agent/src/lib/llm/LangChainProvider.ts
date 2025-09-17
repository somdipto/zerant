/**
 * LangChainProvider - Singleton pattern for LLM instance management
 * 
 * This module exports a pre-initialized singleton instance that's created
 * when the module is first imported. The getInstance() method ensures only
 * one instance exists throughout the application lifecycle.
 * 
 * Usage: import { getLLM } from '@/lib/llm/LangChainProvider'
 * No manual initialization needed - the singleton is created automatically.
 */
import { ChatOpenAI } from "@langchain/openai"
import { ChatAnthropic } from "@langchain/anthropic"
import { ChatOllama } from "@langchain/ollama"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { BaseMessage } from "@langchain/core/messages"
import { LLMSettingsReader } from "@/lib/llm/settings/LLMSettingsReader"
import { BrowserOSProvider } from '@/lib/llm/settings/browserOSTypes'
import { Logging } from '@/lib/utils/Logging'

// Default constants
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_STREAMING = true
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_OPENAI_MODEL = "gpt-4o"
const DEFAULT_ANTHROPIC_MODEL = 'claude-4-sonnet'
const DEFAULT_OLLAMA_MODEL = "qwen3:4b"
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
const DEFAULT_NXTSCAPE_PROXY_URL = "https://llm.browseros.com/default/"
const DEFAULT_NXTSCAPE_MODEL = "default-llm"
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

// Simple cache for LLM instances
const llmCache = new Map<string, BaseChatModel>()

// Model capabilities interface
export interface ModelCapabilities {
  maxTokens: number;  // Maximum context window size
}

export class LangChainProvider {
  private static instance: LangChainProvider
  private currentProvider: BrowserOSProvider | null = null
  
  // Skip token counting flag - set to true for maximum speed (returns fixed estimates)
  private static readonly SKIP_TOKEN_COUNTING = false
  
  // Constructor and initialization
  static getInstance(): LangChainProvider {
    if (!LangChainProvider.instance) {
      LangChainProvider.instance = new LangChainProvider()
    }
    return LangChainProvider.instance
  }
  
  // Public getter methods
  async getLLM(options?: { temperature?: number; maxTokens?: number }): Promise<BaseChatModel> {
    // Get the current provider configuration
    const provider = await LLMSettingsReader.read()
    this.currentProvider = provider
    
    // Check cache
    const cacheKey = this._getCacheKey(provider, options)
    if (llmCache.has(cacheKey)) {
      Logging.log('LangChainProvider', `Using cached LLM for provider: ${provider.name}`, 'info')
      return llmCache.get(cacheKey)!
    }
    
    // Create new LLM instance based on provider type
    Logging.log('LangChainProvider', `Creating new LLM for provider: ${provider.name}`, 'info')
    const llm = this._createLLMFromProvider(provider, options)
    llmCache.set(cacheKey, llm)
    
    // Log metrics about the LLM configuration
    const maxTokens = this._calculateMaxTokens(provider, options?.maxTokens)
    await Logging.logMetric('llm.created', {
      provider: provider.name,
      provider_type: provider.type,
      model_name: provider.modelId || this._getDefaultModelForProvider(provider.type),
      max_tokens: maxTokens,
      temperature: options?.temperature ?? provider.modelConfig?.temperature ?? DEFAULT_TEMPERATURE,
    })
    
    return llm
  }
  
  // Get model capabilities based on provider
  async getModelCapabilities(): Promise<ModelCapabilities> {
    const provider = await LLMSettingsReader.read()
    
    // Use provider's context window if available
    if (provider.modelConfig?.contextWindow) {
      return { maxTokens: provider.modelConfig.contextWindow }
    }
    
    // Otherwise determine based on provider type and model
    switch (provider.type) {
      case 'browseros':
        // BrowserOS/Nxtscape uses gemini 2.5 flash by default
        return { maxTokens: 1_000_000 }
        
      case 'openai':
      case 'openai_compatible':
      case 'openrouter':
        const modelId = provider.modelId || DEFAULT_OPENAI_MODEL
        if (modelId.includes('gpt-4') || modelId.includes('o1') || modelId.includes('o3') || modelId.includes('o4')) {
          return { maxTokens: 128_000 }
        }
        return { maxTokens: 32_768 }
        
      case 'anthropic':
        const anthropicModel = provider.modelId || DEFAULT_ANTHROPIC_MODEL
        if (anthropicModel.includes('claude-3.7') || anthropicModel.includes('claude-4')) {
          return { maxTokens: 200_000 }
        }
        return { maxTokens: 100_000 }
        
      case 'google_gemini':
        const geminiModel = provider.modelId || DEFAULT_GEMINI_MODEL
        if (geminiModel.includes('2.5') || geminiModel.includes('2.0')) {
          return { maxTokens: 1_500_000 }
        }
        return { maxTokens: 1_000_000 }
        
      case 'ollama':
        const ollamaModel = provider.modelId || DEFAULT_OLLAMA_MODEL
        if (ollamaModel.includes('mixtral') || ollamaModel.includes('llama') || 
            ollamaModel.includes('qwen') || ollamaModel.includes('deepseek')) {
          return { maxTokens: 32_768 }
        }
        return { maxTokens: 8_192 }
        
      case 'custom':
        // Custom providers - conservative default
        return { maxTokens: 32_768 }
        
      default:
        return { maxTokens: 8_192 }
    }
  }
  
  getCurrentProvider(): BrowserOSProvider | null {
    return this.currentProvider
  }
  
  clearCache(): void {
    llmCache.clear()
    this.currentProvider = null
  }
  
  private _isReasoningModel(modelId: string): boolean {
    const reasoningModels = ['o1', 'o3', 'o4', 'gpt-5', 'gpt-6']
    return reasoningModels.some(model => modelId.toLowerCase().includes(model))
  }
  
  private _getDefaultModelForProvider(type: string): string {
    switch (type) {
      case 'browseros':
        return DEFAULT_NXTSCAPE_MODEL
      case 'openai':
      case 'openai_compatible':
      case 'openrouter':
      case 'custom':
        return DEFAULT_OPENAI_MODEL
      case 'anthropic':
        return DEFAULT_ANTHROPIC_MODEL
      case 'google_gemini':
        return DEFAULT_GEMINI_MODEL
      case 'ollama':
        return DEFAULT_OLLAMA_MODEL
      default:
        return 'unknown'
    }
  }
  
  /**
   * Patches token counting methods on any chat model for ultra-fast approximation.
   * This eliminates tiktoken "Unknown model" errors and maximizes performance.
   * Uses bit shift operations for speed: 4 chars ≈ 1 token
   */
  private _patchTokenCounting<T extends BaseChatModel>(model: T): T {
    const _CHARS_PER_TOKEN = 2  // Bit shift for division by 4: x >> 2
    const _MESSAGE_OVERHEAD = 20      // Estimated chars for message structure (role, formatting)
    const _COMPLEX_CONTENT_ESTIMATE = 100  // Rough char estimate for non-string content
    
    // Cast model to any for monkey-patching
    const m = model as any
    
    // Ultra-fast mode: skip counting entirely for maximum performance
    if (LangChainProvider.SKIP_TOKEN_COUNTING) {
      m.getNumTokens = async () => 100 
      m.getNumTokensFromMessages = async () => 5000 
      return model
    }
    
    // Fast approximation for single text strings using bit shift
    m.getNumTokens = async function(text: string): Promise<number> {
      // Add 3 before shift for ceiling division: (x + 3) >> 2 ≈ Math.ceil(x / 4)
      // This is ~2-3x faster than Math.ceil(x / 4)
      return (text.length + 3) >> _CHARS_PER_TOKEN
    }
    
    // Optimized token counting for message arrays
    m.getNumTokensFromMessages = async function(messages: BaseMessage[]): Promise<number> {
      // Pre-calculate total overhead for all messages (faster than per-message addition)
      let totalChars = messages.length * _MESSAGE_OVERHEAD
      
      for (const msg of messages) {
        const content = (msg as any).content
        
        if (typeof content === 'string') {
          totalChars += content.length
          continue  // Skip remaining checks for speed
        }
        
        // Handle complex content without expensive JSON.stringify
        if (Array.isArray(content)) {
          // Use bit shift for multiplication: << 6 is multiply by 64
          // Slightly overestimate to avoid JSON.stringify cost
          totalChars += content.length << 6  
        } else if (content) {
          // Fixed estimate for other content types
          totalChars += _COMPLEX_CONTENT_ESTIMATE
        }
        // Note: Skipping name and additional_kwargs for speed
        // These are rare and have minimal impact on token count
      }
      
      // Use bit shift for final division with ceiling
      return (totalChars + 3) >> _CHARS_PER_TOKEN
    }
    
    return model
  }
  
  /**
   * Calculate appropriate maxTokens based on user request, context window, and defaults
   * @param provider - The LLM provider configuration
   * @param requestedMaxTokens - User-requested max tokens (optional)
   * @returns Calculated max tokens for the response
   */
  private _calculateMaxTokens(
    provider: BrowserOSProvider,
    requestedMaxTokens?: number
  ): number {
    const contextWindow = provider.modelConfig?.contextWindow
    
    if (requestedMaxTokens) {
      // User explicitly requested a limit - respect it but cap at context window
      return contextWindow 
        ? Math.min(requestedMaxTokens, contextWindow)
        : requestedMaxTokens
    } else if (contextWindow) {
      // No explicit request - use reasonable default capped by 50% of context window
      // This leaves room for input and conversation history
      return Math.min(DEFAULT_MAX_TOKENS, Math.floor(contextWindow * 0.5))
    } else {
      // No context window info - use conservative default
      return DEFAULT_MAX_TOKENS
    }
  }
  
  private _createLLMFromProvider(
    provider: BrowserOSProvider,
    options?: { temperature?: number; maxTokens?: number }
  ): BaseChatModel {
    // Extract parameters from provider config first, then override with options
    const temperature = options?.temperature ?? 
                       provider.modelConfig?.temperature ?? 
                       DEFAULT_TEMPERATURE
    
    const maxTokens = this._calculateMaxTokens(provider, options?.maxTokens)
    
    const streaming = DEFAULT_STREAMING
    
    // Map provider type to appropriate LangChain adapter
    switch (provider.type) {
      case 'browseros':
        return this._createBrowserOSLLM(temperature, maxTokens, streaming)
      
      case 'openai':
      case 'openai_compatible':
      case 'openrouter':
      case 'custom':
        return this._createOpenAICompatibleLLM(provider, temperature, maxTokens, streaming)
      
      case 'anthropic':
        return this._createAnthropicLLM(provider, temperature, maxTokens, streaming)
      
      case 'google_gemini':
        return this._createGeminiLLM(provider, temperature, maxTokens)
      
      case 'ollama':
        return this._createOllamaLLM(provider, temperature, maxTokens)
      
      default:
        Logging.log('LangChainProvider', 
          `Unknown provider type: ${provider.type}, falling back to BrowserOS`, 
          'warning')
        return this._createBrowserOSLLM(temperature, maxTokens, streaming)
    }
  }
  
  // BrowserOS built-in provider (uses proxy, no API key needed)
  private _createBrowserOSLLM(
    temperature: number, 
    maxTokens?: number, 
    streaming: boolean = true
  ): ChatOpenAI {
    const model = new ChatOpenAI({
      modelName: DEFAULT_NXTSCAPE_MODEL,
      temperature,
      maxTokens,
      streaming,
      openAIApiKey: 'nokey',
      configuration: {
        baseURL: DEFAULT_NXTSCAPE_PROXY_URL,
        apiKey: 'nokey',
        dangerouslyAllowBrowser: true
      }
    })
    
    return this._patchTokenCounting(model)
  }
  
  // OpenAI-compatible providers (OpenAI, OpenAI-compatible, OpenRouter, Custom)
  private _createOpenAICompatibleLLM(
    provider: BrowserOSProvider,
    temperature: number,
    maxTokens?: number,
    streaming: boolean = true
  ): ChatOpenAI {
    if (!provider.apiKey && provider.type !== 'custom') {
      Logging.log('LangChainProvider', 
        `Warning: No API key for ${provider.name} provider, using default`, 
        'warning')
    }
    
    const modelId = provider.modelId || DEFAULT_OPENAI_MODEL
    const isReasoningModel = this._isReasoningModel(modelId)
    
    const config: any = {
      modelName: modelId,
      streaming,
      openAIApiKey: provider.apiKey || 'nokey',
      configuration: {
        baseURL: provider.baseUrl || 'https://api.openai.com/v1',
        apiKey: provider.apiKey || 'nokey',
        dangerouslyAllowBrowser: true
      }
    }
    
    if (isReasoningModel) {
      config.temperature = 1
      if (maxTokens) {
        config.modelKwargs = {
          max_completion_tokens: maxTokens
        }
      }
    } else {
      config.temperature = temperature
      if (maxTokens) {
        config.maxTokens = maxTokens
      }
    }
    
    const model = new ChatOpenAI(config)
    return this._patchTokenCounting(model)
  }
  
  // Anthropic provider
  private _createAnthropicLLM(
    provider: BrowserOSProvider,
    temperature: number,
    maxTokens?: number,
    streaming: boolean = true
  ): ChatAnthropic {
    if (!provider.apiKey) {
      throw new Error(`API key required for ${provider.name} provider`)
    }
    
    const model = new ChatAnthropic({
      modelName: provider.modelId || DEFAULT_ANTHROPIC_MODEL,
      temperature,
      maxTokens,
      streaming,
      anthropicApiKey: provider.apiKey,
      anthropicApiUrl: provider.baseUrl || 'https://api.anthropic.com'
    })
    
    return this._patchTokenCounting(model)
  }
  
  // Google Gemini provider
  private _createGeminiLLM(
    provider: BrowserOSProvider,
    temperature: number,
    maxTokens?: number
  ): ChatGoogleGenerativeAI {
    if (!provider.apiKey) {
      throw new Error(`API key required for ${provider.name} provider`)
    }
    
    const model = new ChatGoogleGenerativeAI({
      model: provider.modelId || DEFAULT_GEMINI_MODEL,
      temperature,
      maxOutputTokens: maxTokens,
      apiKey: provider.apiKey,
      convertSystemMessageToHumanContent: true
    })
    
    return this._patchTokenCounting(model)
  }
  
  // Ollama provider (local, no API key required)
  private _createOllamaLLM(
    provider: BrowserOSProvider,
    temperature: number,
    maxTokens?: number
  ): ChatOllama {
    const ollamaConfig: any = {
      model: provider.modelId || DEFAULT_OLLAMA_MODEL,
      temperature,
      maxRetries: 2,
      baseUrl: provider.baseUrl || DEFAULT_OLLAMA_BASE_URL
    }
    
    // Add context window if specified in provider config
    if (provider.modelConfig?.contextWindow) {
      ollamaConfig.numCtx = provider.modelConfig.contextWindow
    }
    
    const model = new ChatOllama(ollamaConfig)
    
    return this._patchTokenCounting(model)
  }
  
  // Cache key includes all relevant provider settings and options
  private _getCacheKey(
    provider: BrowserOSProvider, 
    options?: { temperature?: number; maxTokens?: number }
  ): string {
    // Create a deterministic string from all cache-relevant values
    // Using string concatenation is faster than JSON.stringify for simple cases
    const keyParts = [
      provider.id,
      provider.type,
      provider.modelId || 'd',
      provider.baseUrl || 'd',
      provider.apiKey ? provider.apiKey.slice(-8) : 'n',  // Last 8 chars of API key
      provider.modelConfig?.temperature?.toString() || 'd',
      provider.modelConfig?.contextWindow?.toString() || 'd',
      options?.temperature?.toString() || 'd',
      options?.maxTokens?.toString() || 'd',
      provider.updatedAt  // Include update timestamp to invalidate cache on provider changes
    ]
    
    // Use FNV-1a hash (very fast, good distribution for short strings)
    const str = keyParts.join('|')
    let hash = 2166136261  // FNV offset basis
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash = (hash * 16777619) >>> 0  // FNV prime, keep as 32-bit unsigned
    }
    
    // Return provider ID with hash for readability (base36 is compact)
    return `${provider.id}-${hash.toString(36)}`
  }
}

// Export singleton instance for easy access
export const langChainProvider = LangChainProvider.getInstance()

// Convenience function for quick access
export async function getLLM(options?: { temperature?: number; maxTokens?: number }): Promise<BaseChatModel> {
  return langChainProvider.getLLM(options)
}
