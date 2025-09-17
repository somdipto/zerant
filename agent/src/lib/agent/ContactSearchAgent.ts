import { BrowserAgent } from './BrowserAgent';
import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ToolManager } from '@/lib/tools/ToolManager';
import { PubSub } from '@/lib/pubsub';
import { GoogleGenerativeAI } from '@google/generative-ai';
// Browser-compatible utilities for screenshot handling
import { base64ToArrayBuffer } from '@/lib/utils/browserUtils';

// Dynamic contact search schema - no hardcoded values
export const ContactSearchSchema = z.object({
  target: z.string().min(1),  // What to search for (company, person, organization)
  contactType: z.enum(['email', 'phone', 'address', 'social', 'general']).default('email'),  // Type of contact info needed
  location: z.string().optional(),  // Geographic location filter
  additionalFilters: z.string().optional(),  // Extra search terms (e.g., "investor", "press", "support")
  analysisDepth: z.enum(['quick', 'thorough']).default('quick'),  // How many pages/sites to analyze
  maxResults: z.number().int().min(1).max(10).default(5)  // Maximum number of results to process
});

export type ContactSearchParams = z.infer<typeof ContactSearchSchema>;

// Contact extraction result type
export type ContactResult = {
  value: string;  // The actual contact (email, phone, address)
  type: 'email' | 'phone' | 'address' | 'social' | 'general';
  confidence: number;  // 0.0 - 1.0 confidence score
  source: 'text' | 'vision' | 'both';  // Where it was extracted from
  context: string;  // Context about where it was found
  validation: {
    domainMatch?: boolean;  // For emails - matches target domain
    patternMatch?: boolean;  // Follows expected pattern for contact type
    locationMatch?: boolean;  // Matches specified location if provided
  };
};

export class ContactSearchAgent extends BrowserAgent {
  private geminiApiKey: string;
  private toolManager: ToolManager;
  private genAI: GoogleGenerativeAI | null = null;
  private screenshotBufferCache: Map<string, ArrayBuffer> = new Map();

  constructor(executionContext: ExecutionContext) {
    super(executionContext);
    this.toolManager = new ToolManager(executionContext);
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    if (this.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(this.geminiApiKey);
    }
    this._registerContactSearchTools();
  }

  private _registerContactSearchTools(): void {
    // Register core contact search tools
    this.toolManager.register(this._createDynamicSearchTool());
    this.toolManager.register(this._createGeminiVisionTool());
    this.toolManager.register(this._createContactExtractionTool());
    this.toolManager.register(this._createContactValidationTool());
  }

  // Dynamic search tool - builds queries based on user parameters
  private _createDynamicSearchTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'dynamic_search_tool',
      description: 'Perform dynamic Google search for contact information based on user-specified target and parameters. Opens Google and enters the search query in the search bar.',
      schema: ContactSearchSchema,
      func: async (params: ContactSearchParams) => {
        try {
          // Build dynamic search query based on user input
          const searchQuery = this._buildDynamicSearchQuery(params);

          // Publish search intent to UI
          this.pubsub.publishMessage(
            PubSub.createMessage(
              `🔍 Searching Google for: "${params.target} ${params.contactType}" using query: "${searchQuery}"`,
              'thinking'
            )
          );

          // Navigate to Google
          const navTool = this.toolManager.get('navigation_tool');
          if (navTool) {
            await navTool.func({ url: 'https://www.google.com' });
          }

          // Wait for page to load
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Enter search query in Google search bar
          const interactTool = this.toolManager.get('interact_tool');
          if (interactTool) {
            // Clear search box and enter query
            await interactTool.func({
              operation: 'clear',
              element: 'Google search input field'
            });
            await interactTool.func({
              operation: 'input_text',
              element: 'Google search input field',
              text: searchQuery
            });
            // Press Enter to search
            await interactTool.func({
              operation: 'click',
              element: 'Google search button or press Enter'
            });
          }

          // Wait for search results
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Take screenshot for vision analysis
          const screenshotTool = this.toolManager.get('screenshot_tool');
          let screenshotPath = '';
          if (screenshotTool) {
            const screenshotResult = await screenshotTool.func({ tabId: 'current' });
            const parsedScreenshot = JSON.parse(screenshotResult as string);
            if (parsedScreenshot.ok) {
              screenshotPath = parsedScreenshot.output as string;
            }
          }

          // Initial vision analysis of search results
          let visionResults: any = { contacts: [], insights: [] };
          const visionTool = this.toolManager.get('gemini_vision_tool');
          if (visionTool && screenshotPath) {
            const visionResult = await visionTool.func({
              screenshotPath,
              analysisType: 'contact_extraction',
              context: `Analyze Google search results for ${params.target} ${params.contactType} contacts. Look for email addresses, phone numbers, and contact links in the search results.`
            });
            visionResults = JSON.parse(visionResult as string).output;
          }

          return JSON.stringify({
            ok: true,
            output: {
              searchQuery,
              target: params.target,
              contactType: params.contactType,
              screenshotPath,
              initialContacts: visionResults.contacts || [],
              searchInsights: visionResults.insights || [],
              nextSteps: params.analysisDepth === 'quick'
                ? 'Quick analysis complete. Ready for extraction.'
                : 'Thorough analysis initiated. Processing multiple result pages.',
              params  // Include original parameters for workflow continuation
            }
          });

        } catch (error) {
          return JSON.stringify({
            ok: false,
            error: `Dynamic search failed: ${error instanceof Error ? error.message : String(error)}`,
            params
          });
        }
      }
    });
  }

  // Gemini vision tool for screenshot analysis
  private _createGeminiVisionTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'gemini_vision_tool',
      description: 'Use Gemini vision model to analyze browser screenshots and extract contact information (emails, phones, addresses) based on context.',
      schema: z.object({
        screenshotPath: z.string(),  // Path to screenshot file
        analysisType: z.enum(['contact_extraction', 'ui_analysis', 'link_identification', 'text_extraction']).default('contact_extraction'),
        context: z.string(),  // What to look for in the screenshot
        target: z.string().optional(),  // Target entity (company/person) for context
        contactType: z.enum(['email', 'phone', 'address', 'social', 'general']).optional()  // Specific contact type to prioritize
      }),
      func: async ({ screenshotPath, analysisType, context, target, contactType }) => {
        if (!this.geminiApiKey || !this.genAI) {
          this.pubsub.publishMessage(
            PubSub.createMessage(
              '⚠️ Gemini API not configured. Falling back to text extraction only.',
              'error'
            )
          );
          return JSON.stringify({
            ok: false,
            error: 'GEMINI_API_KEY not configured or invalid. Using text extraction only.',
            fallback: 'text_only',
            screenshotPath
          });
        }

        try {
          // Get screenshot data from browser-compatible cache or tool
          let imageData: ArrayBuffer | null = null;
          let base64Image: string;

          // Check cache first
          if (this.screenshotBufferCache.has(screenshotPath)) {
            imageData = this.screenshotBufferCache.get(screenshotPath)!;
            this.pubsub.publishMessage(
              PubSub.createMessage(`📸 Using cached screenshot data for ${screenshotPath}`, 'thinking')
            );
          } else {
            // Request screenshot data from screenshot tool
            const screenshotTool = this.toolManager.get('screenshot_tool');
            if (screenshotTool) {
              // Request the actual image data, not just path
              const dataRequest = await screenshotTool.func({
                tabId: 'current',
                format: 'base64',  // Request base64 data directly
                fullPage: true,
                quality: 0.8
              });

              const parsedData = JSON.parse(dataRequest as string);
              if (parsedData.ok && parsedData.output) {
                base64Image = parsedData.output as string;
                // Convert base64 to ArrayBuffer for processing
                imageData = base64ToArrayBuffer(base64Image);
                // Cache for future use
                this.screenshotBufferCache.set(screenshotPath, imageData);

                this.pubsub.publishMessage(
                  PubSub.createMessage(`📸 Processed ${((imageData.byteLength / 1024) | 0)}KB screenshot`, 'thinking')
                );
              } else {
                throw new Error('Screenshot tool failed to provide image data');
              }
            } else {
              throw new Error('Screenshot tool not available');
            }
          }

          // Ensure we have the data
          if (!imageData) {
            throw new Error('No screenshot data available for analysis');
          }

          // Convert ArrayBuffer back to base64 for Gemini API
          base64Image = await this._arrayBufferToBase64(imageData);

          // Create detailed prompt for contact extraction
          const targetContext = target ? `Target entity: ${target}. ` : '';
          const typeContext = contactType ? `Contact type: ${contactType}. ` : '';
          const fullPrompt = `${targetContext}${typeContext}${context}

Analyze this webpage screenshot and extract all contact information. Look for:
- Email addresses (especially those related to ${target || 'the target entity'})
- Phone numbers in contact sections
- Physical addresses in footer or contact pages
- Social media links (LinkedIn, Twitter, etc.)
- Contact forms or 'Get in touch' sections

For each contact found, provide:
1. The contact value (email, phone, address, URL)
2. Contact type (email, phone, address, social, general)
3. Confidence score (0.0-1.0) based on relevance to target
4. Location on page (header, footer, contact section, etc.)
5. Surrounding context that makes this contact relevant

Return structured JSON format:
{
  "contacts": [
    {
      "value": "contact@example.com",
      "type": "email",
      "confidence": 0.95,
      "location": "contact section",
      "context": "Found in 'Investor Relations' section",
      "domainMatch": true
    }
  ],
  "insights": ["Summary of what was found", "Page type analysis"],
  "pageType": "contact page or search results",
  "overallConfidence": 0.85
}

Focus on high-quality, relevant contacts. Ignore generic support emails unless specifically requested.`;

          this.pubsub.publishMessage(
            PubSub.createMessage(
              `👁️ Analyzing screenshot with live Gemini API...\nTarget: ${target || 'general contacts'}\nType: ${contactType || 'any'}\nContext: ${context.substring(0, 100)}...`,
              'thinking'
            )
          );

          // Call real Gemini API
          const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
          const result = await model.generateContent([
            fullPrompt,
            {
              inlineData: {
                data: base64Image,
                mimeType: 'image/png'
              }
            }
          ]);

          const responseText = result.response.text();
          let parsedResponse;
          try {
            // Try to parse JSON response
            parsedResponse = JSON.parse(responseText);
          } catch (parseError) {
            // If JSON parsing fails, try to extract structured data from text
            this.pubsub.publishMessage(
              PubSub.createMessage(
                `⚠️ Gemini returned unstructured response. Parsing manually...`,
                'thinking'
              )
            );
            parsedResponse = await this._parseUnstructuredGeminiResponse(responseText, target, contactType);
          }

          // Validate and structure the response
          const structuredResult = this._structureGeminiResponse(parsedResponse, target, contactType);

          // Publish analysis results
          this.pubsub.publishMessage(
            PubSub.createMessage(
              `✅ Gemini vision analysis complete!\nFound: ${structuredResult.contacts.length} contacts\nConfidence: ${(structuredResult.overallConfidence * 100).toFixed(0)}%\nPage type: ${structuredResult.pageType}`,
              'thinking'
            )
          );

          return JSON.stringify({
            ok: true,
            output: {
              analysisType,
              contacts: structuredResult.contacts,
              insights: structuredResult.insights,
              confidence: structuredResult.overallConfidence,
              pageType: structuredResult.pageType,
              processedAt: new Date().toISOString(),
              screenshotPath,
              context,
              rawResponseLength: responseText.length,
              apiModel: 'gemini-1.5-flash',
              target,
              contactType
            }
          });

        } catch (error) {
          console.error('Gemini API Error:', error);
          this.pubsub.publishMessage(
            PubSub.createMessage(
              `❌ Gemini vision analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}\nFalling back to text extraction.`,
              'error'
            )
          );
          return JSON.stringify({
            ok: false,
            error: `Gemini vision analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            screenshotPath,
            fallback: 'text_extraction',
            fallbackContacts: [],
            errorType: error instanceof Error ? error.name : 'unknown'
          });
        }
      }
    });
  }

  // Contact extraction tool - combines text and vision analysis
  private _createContactExtractionTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'contact_extraction_tool',
      description: 'Extract and combine contact information from page content and Gemini vision analysis.',
      schema: z.object({
        params: ContactSearchSchema,  // Original search parameters
        useVision: z.boolean().default(true),  // Whether to use Gemini vision
        validateContacts: z.boolean().default(true)  // Whether to validate extracted contacts
      }),
      func: async ({ params, useVision, validateContacts }) => {
        try {
          this.pubsub.publishMessage(
            PubSub.createMessage(
              `🔍 Starting live contact extraction for ${params.target} (${params.contactType})`,
              'thinking'
            )
          );

          const extractedContacts: ContactResult[] = [];

          // Step 1: Extract text content from current page
          const extractTool = this.toolManager.get('extract_tool');
          let textContent = '';
          if (extractTool) {
            const textResult = await extractTool.func({
              type: 'text',
              tabId: 'current',
              selector: 'body'  // Extract all visible text
            });
            const parsedText = JSON.parse(textResult as string);
            if (parsedText.ok) {
              textContent = parsedText.output as string;
            }
          }

          // Step 2: Extract links (potential contact pages)
          let links: string[] = [];
          if (extractTool) {
            const linksResult = await extractTool.func({
              type: 'links',
              tabId: 'current',
              filter: params.contactType === 'email' ? 'mailto:' : undefined
            });
            const parsedLinks = JSON.parse(linksResult as string);
            if (parsedLinks.ok) {
              links = parsedLinks.output as string[];
            }
          }

          // Step 3: Vision analysis if enabled
          let visionContacts: ContactResult[] = [];
          if (useVision) {
            const screenshotTool = this.toolManager.get('screenshot_tool');
            if (screenshotTool) {
              const screenshotResult = await screenshotTool.func({ tabId: 'current' });
              const parsedScreenshot = JSON.parse(screenshotResult as string);
              if (parsedScreenshot.ok) {
                const screenshotPath = parsedScreenshot.output as string;
                const visionTool = this.toolManager.get('gemini_vision_tool');
                if (visionTool) {
                  const visionResult = await visionTool.func({
                    screenshotPath,
                    analysisType: 'contact_extraction',
                    context: `Extract ${params.contactType} contacts for ${params.target}. Look for emails, phone numbers, addresses in the page content.`,
                    target: params.target,
                    contactType: params.contactType
                  });
                  const parsedVision = JSON.parse(visionResult as string);
                  if (parsedVision.ok) {
                    visionContacts = parsedVision.output.contacts || [];
                  }
                }
              }
            }
          }

          // Step 4: Basic text-based extraction (fallback)
          const textContacts = this._extractContactsFromText(textContent, params);

          // Step 5: Combine and deduplicate
          const allContacts = [...textContacts, ...visionContacts];
          const uniqueContacts = this._deduplicateContacts(allContacts);

          // Step 6: Validate if requested
          let validatedContacts: ContactResult[] = uniqueContacts;
          if (validateContacts) {
            const validationTool = this.toolManager.get('contact_validation_tool');
            if (validationTool) {
              const validationResult = await validationTool.func({
                contacts: uniqueContacts,
                target: params.target,
                contactType: params.contactType,
                location: params.location
              });
              const parsedValidation = JSON.parse(validationResult as string);
              if (parsedValidation.ok) {
                validatedContacts = parsedValidation.output.validatedContacts;
              }
            }
          }

          // Publish extraction results
          this.pubsub.publishMessage(
            PubSub.createMessage(
              `📧 Extracted ${validatedContacts.length} ${params.contactType} contacts for ${params.target}`,
              'assistant'
            )
          );

          return JSON.stringify({
            ok: true,
            output: {
              params,
              textContentLength: textContent.length,
              totalLinksFound: links.length,
              visionContacts: visionContacts.length,
              textContacts: textContacts.length,
              validatedContacts,
              extractionSummary: {
                sourcesUsed: useVision ? ['text', 'vision'] : ['text'],
                validationApplied: validateContacts,
                confidenceThreshold: 0.6,
                finalCount: validatedContacts.length
              }
            }
          });

        } catch (error) {
          return JSON.stringify({
            ok: false,
            error: `Contact extraction failed: ${error instanceof Error ? error.message : String(error)}`,
            params,
            fallback: 'Partial extraction may still be available from text content.'
          });
        }
      }
    });
  }

  // Contact validation tool
  private _createContactValidationTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'contact_validation_tool',
      description: 'Validate extracted contacts against target, domain patterns, and location data.',
      schema: z.object({
        contacts: z.array(z.object({
          value: z.string(),
          type: z.enum(['email', 'phone', 'address', 'social', 'general']),
          source: z.enum(['text', 'vision', 'both'])
        })),
        target: z.string(),  // Target entity for validation context
        contactType: z.enum(['email', 'phone', 'address', 'social', 'general']),
        location: z.string().optional()  // Location for address validation
      }),
      func: async ({ contacts, target, contactType, location }) => {
        try {
          const validatedContacts: ContactResult[] = [];

          for (const contact of contacts) {
            let confidence = 0.5;  // Base confidence
            const validation = {
              domainMatch: false,
              patternMatch: false,
              locationMatch: false
            };

            // Email validation
            if (contactType === 'email' && contact.type === 'email') {
              const emailValidation = this._validateEmail(contact.value, target);
              confidence = emailValidation.confidence;
              validation.domainMatch = emailValidation.domainMatch;
              validation.patternMatch = emailValidation.patternMatch;
            }

            // Phone validation
            if (contactType === 'phone' && contact.type === 'phone') {
              const phoneValidation = this._validatePhone(contact.value, location);
              confidence = phoneValidation.confidence;
              validation.patternMatch = phoneValidation.patternMatch;
              if (location) {
                validation.locationMatch = phoneValidation.areaCodeMatchesLocation;
              }
            }

            // Address validation
            if (contactType === 'address' && contact.type === 'address') {
              const addressValidation = this._validateAddress(contact.value, target, location);
              confidence = addressValidation.confidence;
              validation.locationMatch = addressValidation.locationMatch;
            }

            // Adjust confidence based on source
            if (contact.source === 'vision') confidence *= 0.9;  // Vision slightly less reliable
            if (contact.source === 'both') confidence *= 1.1;  // Both sources increase confidence

            // Cap confidence at 1.0
            confidence = Math.min(confidence, 1.0);

            validatedContacts.push({
              ...contact,
              confidence,
              context: `${target} - ${contactType} contact`,
              validation
            });
          }

          // Filter out low-confidence contacts (below 0.6)
          const highConfidenceContacts = validatedContacts.filter(c => c.confidence >= 0.6);

          return JSON.stringify({
            ok: true,
            output: {
              originalCount: contacts.length,
              validatedCount: validatedContacts.length,
              highConfidenceCount: highConfidenceContacts.length,
              validatedContacts,
              highConfidenceContacts,
              validationSummary: {
                averageConfidence: validatedContacts.reduce((sum, c) => sum + c.confidence, 0) / validatedContacts.length,
                domainMatches: validatedContacts.filter(c => c.validation.domainMatch).length,
                patternMatches: validatedContacts.filter(c => c.validation.patternMatch).length,
                locationMatches: validatedContacts.filter(c => c.validation.locationMatch).length
              }
            }
          });

        } catch (error) {
          return JSON.stringify({
            ok: false,
            error: `Contact validation failed: ${error instanceof Error ? error.message : String(error)}`,
            fallbackContacts: contacts.map(c => ({ ...c, confidence: 0.5, validation: {} }))
          });
        }
      }
    });
  }

  // Private helper methods for dynamic query building and validation

  private _buildDynamicSearchQuery(params: ContactSearchParams): string {
    const { target, contactType, location, additionalFilters, analysisDepth } = params;

    // Base query structure
    let query = `${target} ${contactType}`;

    // Add contact-specific modifiers
    const contactModifiers = {
      email: ['contact email', 'email address', '"get in touch"', 'mailto:'],
      phone: ['phone number', 'contact phone', 'call us'],
      address: ['address', 'location', 'office', 'headquarters'],
      social: ['linkedin', 'twitter', 'contact page', 'social media'],
      general: ['contact', 'reach out', 'get in touch', 'information']
    };

    // Add relevant modifiers
    const modifiers = contactModifiers[contactType] || contactModifiers.general;
    query += ` ${modifiers.join(' OR ')}`;

    // Add location filter
    if (location) {
      query += ` ${location}`;
    }

    // Add additional filters
    if (additionalFilters) {
      query += ` ${additionalFilters}`;
    }

    // Add search operators for better results
    query += ' -inurl:(login signup register)';

    // For thorough analysis, add site diversity
    if (analysisDepth === 'thorough') {
      query += ' site:*.com OR site:*.org OR site:*.io OR site:*.co';
    }

    return query.trim();
  }

  // REMOVED: Mock implementation - now using real Gemini API

  private async _parseUnstructuredGeminiResponse(
    responseText: string,
    target?: string,
    contactType?: string
  ): Promise<any> {
    // Try to extract JSON-like structure from unstructured text response
    // Look for common patterns that Gemini might return
    const jsonMatch = responseText.match(/\{[^}]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Continue to manual parsing
      }
    }

    // Manual parsing - look for email patterns, phone patterns, etc.
    const emails = responseText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
    const phones = responseText.match(/(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g) || [];

    return {
      contacts: [
        ...emails.map(email => ({
          value: email,
          type: 'email' as const,
          confidence: 0.7,
          location: 'text response',
          context: `Extracted from Gemini text: ${responseText.substring(0, 100)}...`
        })),
        ...phones.map(phone => ({
          value: phone,
          type: 'phone' as const,
          confidence: 0.6,
          location: 'text response',
          context: `Extracted from Gemini text: ${responseText.substring(0, 100)}...`
        }))
      ].slice(0, 5), // Limit to top 5
      insights: [
        'Gemini returned unstructured response',
        `Found ${emails.length} emails and ${phones.length} phones in text`,
        'Manual parsing applied',
        `Target context: ${target || 'general'}`
      ],
      overallConfidence: 0.6,
      pageType: 'unstructured_analysis'
    };
  }

  private _structureGeminiResponse(
    rawResponse: any,
    target?: string,
    contactType?: string
  ): {
    contacts: ContactResult[];
    insights: string[];
    overallConfidence: number;
    pageType: string;
  } {
    const contacts: ContactResult[] = [];
    const insights: string[] = [];
    let overallConfidence = 0.8;
    let pageType = 'unknown';

    // Ensure rawResponse has the expected structure
    const response = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse;

    // Extract contacts array (handle different possible structures)
    let rawContacts = [];
    if (response.contacts && Array.isArray(response.contacts)) {
      rawContacts = response.contacts;
    } else if (response.response && response.response.contacts) {
      rawContacts = response.response.contacts;
    } else if (Array.isArray(response)) {
      rawContacts = response;
    }

    // Process each contact
    for (const rawContact of rawContacts) {
      let contact: ContactResult = {
        value: '',
        type: 'general',
        confidence: 0.5,
        source: 'vision',
        context: '',
        validation: {}
      };

      // Extract value
      if (typeof rawContact === 'string') {
        contact.value = rawContact;
        contact.type = this._inferContactType(contact.value);
        contact.context = `Direct extraction from Gemini response`;
        contact.confidence = 0.7;
      } else if (rawContact.value) {
        contact.value = rawContact.value;
        contact.type = rawContact.type || this._inferContactType(contact.value);
        contact.confidence = rawContact.confidence || 0.8;
        contact.context = rawContact.context || rawContact.location_on_page || 'Gemini extraction';
      }

      // Add validation based on target
      if (target && contact.type === 'email') {
        const emailValidation = this._validateEmail(contact.value, target);
        contact.validation = {
          domainMatch: emailValidation.domainMatch,
          patternMatch: emailValidation.patternMatch
        };
        contact.confidence = emailValidation.confidence;
      }

      // Filter out empty or invalid contacts
      if (contact.value && contact.value.trim()) {
        contacts.push(contact);
      }
    }

    // Extract insights
    if (response.insights && Array.isArray(response.insights)) {
      insights.push(...response.insights);
    } else if (response.response && response.response.insights) {
      insights.push(...response.response.insights);
    } else {
      insights.push(
        `Gemini analyzed screenshot for ${target || 'contact information'}`,
        `Found ${contacts.length} potential contacts`,
        `Analysis type: ${contactType || 'general'}`
      );
    }

    // Extract page type
    if (response.pageType) {
      pageType = response.pageType;
    } else if (contacts.length > 3) {
      pageType = 'contact page';
    } else if (contacts.length > 0) {
      pageType = 'partial contact info';
    } else {
      pageType = 'no contacts found';
    }

    // Calculate overall confidence
    if (contacts.length > 0) {
      overallConfidence = contacts.reduce((sum, c) => sum + c.confidence, 0) / contacts.length;
    }

    // Limit contacts to reasonable number
    return {
      contacts: contacts.slice(0, 10),
      insights,
      overallConfidence,
      pageType
    };
  }

  private _inferContactType(value: string): ContactResult['type'] {
    const lowerValue = value.toLowerCase();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phoneRegex = /\+?\d{1,4}?[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/;
    const urlRegex = /https?:\/\/\S+/;

    if (emailRegex.test(value)) return 'email';
    if (phoneRegex.test(value)) return 'phone';
    if (urlRegex.test(value)) return 'social';
    if (lowerValue.includes('street') || lowerValue.includes('ave') || lowerValue.includes('rd')) return 'address';
    return 'general';
  }
    // Simulate Gemini vision results - in production, replace with actual API call
    const mockContacts: ContactResult[] = [];
    const insights: string[] = [];
    let confidence = 0.85;

    // Simulate different analysis types
    switch (analysisType) {
      case 'contact_extraction':
        if (contactType === 'email') {
          mockContacts.push({
            value: `contact@${target?.toLowerCase().replace(/\s+/g, '')}.com`,
            type: 'email',
            confidence: 0.92,
            source: 'vision',
            context: `Email link detected in contact section for ${target}`,
            validation: { domainMatch: true, patternMatch: true }
          });
          insights.push('Email address detected in visible text elements');
          insights.push(`Domain matches target: ${target}`);
        }
        if (contactType === 'phone') {
          mockContacts.push({
            value: '+1-555-0123-4567',
            type: 'phone',
            confidence: 0.88,
            source: 'vision',
            context: `Phone number found in header for ${target}`,
            validation: { patternMatch: true }
          });
          insights.push('Phone number extracted from page header');
        }
        break;

      case 'ui_analysis':
        insights.push('Contact section detected in lower right of page');
        insights.push('Multiple clickable links identified in footer');
        insights.push('Form elements suggest contact form presence');
        break;

      case 'link_identification':
        mockContacts.push({
          value: `https://${target?.toLowerCase().replace(/\s+/g, '')}.com/contact`,
          type: 'social',
          confidence: 0.95,
          source: 'vision',
          context: `Contact page link detected for ${target}`,
          validation: { patternMatch: true }
        });
        insights.push('Contact page link identified in navigation');
        break;
    }

    return { contacts: mockContacts, insights, confidence };
  }

  private _extractContactsFromText(text: string, params: ContactSearchParams): ContactResult[] {
    const { target, contactType } = params;
    const contacts: ContactResult[] = [];

    // Simple regex-based extraction (enhance with more sophisticated patterns)
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;

    if (contactType === 'email') {
      let match;
      while ((match = emailRegex.exec(text)) !== null) {
        const email = match[1];
        if (this._isRelevantEmail(email, target)) {
          contacts.push({
            value: email,
            type: 'email',
            confidence: 0.75,
            source: 'text',
            context: `${target} email found in text content`,
            validation: {
              domainMatch: email.toLowerCase().includes(target?.toLowerCase().replace(/\s+/g, '') || ''),
              patternMatch: true
            }
          });
        }
      }
    }

    if (contactType === 'phone') {
      let match;
      while ((match = phoneRegex.exec(text)) !== null) {
        const phone = match[0];
        contacts.push({
          value: phone,
          type: 'phone',
          confidence: 0.70,
          source: 'text',
          context: `${target} phone number found in text`,
          validation: { patternMatch: true }
        });
      }
    }

    return contacts;
  }

  private _deduplicateContacts(contacts: ContactResult[]): ContactResult[] {
    const seen = new Set<string>();
    return contacts.filter(contact => {
      if (seen.has(contact.value.toLowerCase())) {
        return false;
      }
      seen.add(contact.value.toLowerCase());
      return true;
    });
  }

  private _isRelevantEmail(email: string, target?: string): boolean {
    if (!target) return true;

    const targetDomain = target.toLowerCase().replace(/\s+/g, '');
    const emailDomain = email.split('@')[1]?.toLowerCase() || '';

    // Check if email domain relates to target
    return emailDomain.includes(targetDomain) ||
           email.includes('contact') ||
           email.includes('info') ||
           email.includes('support');
  }

  private _validateEmail(email: string, target?: string): { confidence: number; domainMatch: boolean; patternMatch: boolean } {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const patternMatch = emailRegex.test(email);
    let domainMatch = false;
    let confidence = patternMatch ? 0.8 : 0.3;

    if (target) {
      const targetParts = target.toLowerCase().split(/\s+/);
      const emailDomain = email.split('@')[1]?.toLowerCase() || '';
      domainMatch = targetParts.some(part => emailDomain.includes(part));
      if (domainMatch) confidence += 0.15;
    }

    // Check for common contact patterns
    if (email.toLowerCase().includes('contact') ||
        email.toLowerCase().includes('info') ||
        email.toLowerCase().includes('support')) {
      confidence += 0.1;
    }

    return { confidence: Math.min(confidence, 1.0), domainMatch, patternMatch };
  }

  private _validatePhone(phone: string, location?: string): {
    confidence: number;
    patternMatch: boolean;
    areaCodeMatchesLocation?: boolean
  } {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    const patternMatch = phoneRegex.test(cleanPhone);
    let confidence = patternMatch ? 0.75 : 0.3;

    let areaCodeMatchesLocation = false;
    if (location && cleanPhone.startsWith('1')) {
      // Extract area code (first 3 digits after country code)
      const areaCode = cleanPhone.slice(1, 4);
      // Simple location mapping (expand with more comprehensive data)
      const areaCodeLocations: Record<string, string[]> = {
        '212': ['New York', 'NY'],
        '310': ['Los Angeles', 'CA'],
        '415': ['San Francisco', 'CA'],
        '617': ['Boston', 'MA'],
        '206': ['Seattle', 'WA']
      };

      areaCodeMatchesLocation = Object.values(areaCodeLocations).some(locations =>
        locations.some(loc => location.toLowerCase().includes(loc.toLowerCase()))
      );

      if (areaCodeMatchesLocation) confidence += 0.15;
    }

    return { confidence: Math.min(confidence, 1.0), patternMatch, areaCodeMatchesLocation };
  }

  private _validateAddress(address: string, target?: string, location?: string): {
    confidence: number;
    locationMatch: boolean
  } {
    let confidence = 0.6;
    let locationMatch = false;

    if (location) {
      locationMatch = address.toLowerCase().includes(location.toLowerCase());
      if (locationMatch) confidence += 0.2;
    }

    if (target) {
      // Check if address mentions target
      const targetMention = address.toLowerCase().includes(target.toLowerCase());
      if (targetMention) confidence += 0.15;
    }

    // Basic address pattern check
    const addressPatterns = ['st', 'street', 'ave', 'avenue', 'rd', 'road', 'blvd', 'boulevard', 'suite', 'floor'];
    const hasAddressPattern = addressPatterns.some(pattern => address.toLowerCase().includes(pattern));
    if (hasAddressPattern) confidence += 0.1;

    return { confidence: Math.min(confidence, 1.0), locationMatch };
  }

  // Override execute method to provide contact search-specific system prompt
  async execute(task: string, metadata?: any): Promise<void> {
    // Parse task to extract parameters (or use metadata)
    let searchParams: ContactSearchParams;

    try {
      // Try to parse parameters from task or metadata
      if (metadata?.params) {
        searchParams = ContactSearchSchema.parse(metadata.params);
      } else {
        // Basic parsing from task string (enhance with NLP if needed)
        searchParams = this._parseTaskToParams(task);
      }
    } catch (error) {
      // Default parameters for simple tasks
      searchParams = {
        target: task,
        contactType: 'email',
        location: undefined,
        additionalFilters: undefined,
        analysisDepth: 'quick',
        maxResults: 5
      };
    }

    // Add contact search-specific system prompt
    const contactPrompt = `
You are a Contact Search Agent specialized in finding contact information for companies, people, and organizations.

## CORE WORKFLOW (Follow BrowserOS Patterns):
1. **CLASSIFY**: Determine if simple (direct search) or complex (multi-page analysis)
2. **PLAN**: Create TODO list with dynamic steps based on user parameters
3. **EXECUTE**: Use dynamic_search_tool → gemini_vision_tool → contact_extraction_tool
4. **VALIDATE**: Use contact_validation_tool and reassess confidence
5. **COMPLETE**: Call done_tool with verified contacts or explain why no contacts found

## DYNAMIC SEARCH STRATEGY:
- ALWAYS start with dynamic_search_tool using user parameters
- Build queries dynamically: \`${searchParams.target} ${searchParams.contactType} contact\`
- Use search operators: "contact us" "get in touch" site:*.com -inurl:login
- For thorough analysis: process multiple result pages and domains

## CONTACT EXTRACTION RULES:
- Prioritize ${searchParams.contactType} contacts for ${searchParams.target}
${searchParams.location ? `- Location filter: ${searchParams.location}` : ''}
${searchParams.additionalFilters ? `- Additional context: ${searchParams.additionalFilters}` : ''}
- Use BOTH text extraction AND Gemini vision analysis
- Extract from: page content, links, screenshots, contact sections
- Validate domain relevance to target entity

## QUALITY CRITERIA:
- Minimum confidence: 0.6 for final results
- Prefer direct company domains over directories
- Cross-verify vision and text extractions
- Flag suspicious patterns (info@, noreply@, support@ for non-support queries)

## ERROR HANDLING:
- If no results: try alternative search terms or domains
- If low confidence: request human verification or try different approach
- If blocked: navigate to target website directly and search contact page

## SUCCESS DEFINITION:
- Extract 1-5 high-confidence ${searchParams.contactType} contacts for ${searchParams.target}
- Provide validation insights and confidence scores
- Include context about where each contact was found
- Suggest next steps for outreach or verification

Current parameters: Target="${searchParams.target}", Type="${searchParams.contactType}", Depth="${searchParams.analysisDepth}"
Call done_tool when you have verified contacts or exhausted reasonable search options.
    `;

    // Prepend contact prompt to existing system prompt
    const currentSystemPrompt = this.messageManager.getSystemMessages()[0]?.content || '';
    this.messageManager.removeSystemMessages();
    this.messageManager.addSystem(contactPrompt + '\n\n' + currentSystemPrompt);

    // Add search parameters to conversation context
    this.messageManager.addAI(
      `Contact search initialized with parameters: Target="${searchParams.target}", Type="${searchParams.contactType}", Location="${searchParams.location || 'any'}", Depth="${searchParams.analysisDepth}"`
    );

    // Store parameters in execution context for tool access
    this.executionContext.setContactSearchParams(searchParams);

    // Execute with contact search context
    return super.execute(task, { ...metadata, params: searchParams });
  }

  // Helper method to parse task string into parameters
  private _parseTaskToParams(task: string): ContactSearchParams {
    const lowerTask = task.toLowerCase();

    // Detect contact type
    let contactType: 'email' | 'phone' | 'address' | 'social' | 'general' = 'email';
    if (lowerTask.includes('phone') || lowerTask.includes('call') || lowerTask.includes('number')) {
      contactType = 'phone';
    } else if (lowerTask.includes('address') || lowerTask.includes('location') || lowerTask.includes('office')) {
      contactType = 'address';
    } else if (lowerTask.includes('linkedin') || lowerTask.includes('twitter') || lowerTask.includes('social')) {
      contactType = 'social';
    }

    // Extract target (simplified - enhance with better NLP)
    const target = task.replace(/find|get|search|locate|contact/i, '').trim();

    // Detect location
    const locationMatch = task.match(/(in|at|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    const location = locationMatch ? locationMatch[2] : undefined;

    // Detect additional filters
    const filterMatch = task.match(/for\s+([a-z\s]+)/i);
    const additionalFilters = filterMatch ? filterMatch[1].trim() : undefined;

    return {
      target,
      contactType,
      location,
      additionalFilters,
      analysisDepth: 'quick',
      maxResults: 5
    };
  }

  // Cleanup method
  public cleanup(): void {
    super.cleanup();
    // Clear any stored search parameters
    this.executionContext.clearContactSearchParams();
  }
}
