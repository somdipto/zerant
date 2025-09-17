# Agent Tool Call Design

## Overview

This document describes the updated design for tool calling in the BrowseAgent, incorporating LangChain's `bindTools` for explicit tool selection by the LLM. This eliminates the need for custom structured schemas like StepExecutionSchema, instead leveraging tool binding to guide the LLM in deciding between tool calls or direct answers. The LLM is prompted to use real tools for actions or a special 'final_answer' tool for simple text responses.

The design maintains the plan-then-execute flow but shifts tool decision-making to `bindTools`, allowing the LLM to output `tool_calls` in its response. This is more robust and aligns with LangChain's recommended agent-free tool calling pattern.

// NTN -- we are not pure plan then execute, we use hybrid approach, which plan for HORIZON steps and then execute them.

## Core Architecture

The BrowseAgent executes plans step-by-step. For each step:
- Bind tools (including 'final_answer') to the LLM.
- Invoke the bound LLM with a prompt describing the step and available tools.
- Parse the response's `tool_calls`: Execute real tools or handle 'final_answer' directly.

This provides full control without agents like ReAct.

## Design Components

### 1. Keep Planner Output Simple (No Change Needed)

The PlannerTool output remains simple with natural language actions:

```typescript
// PlannerTool output remains simple:
const PlanSchema = z.object({
  steps: z.array(z.object({
    action: z.string(),     // Natural language: "Navigate to google.com"
    reasoning: z.string()   // Why this step is needed
  }))
});
```

### 2. Define Special 'final_answer' Tool

// NTN -- let's define answer tool later.
To handle non-tool responses, add a dummy tool:

```typescript
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const finalAnswerTool = new DynamicStructuredTool({
  name: "final_answer",
  description: "Use this if no tool is needed and you can provide a direct answer.",
  schema: z.object({
    content: z.string()  // The direct text response
  }),
  func: async ({ content }) => content  // Identity function; real execution is handled separately
});
```

### 3. BrowseAgent Step Execution Flow

```typescript
// This is pseudo code and should be appropriately updated according to the specific logic in the implementation.

class BrowseAgent {
  private llm: BaseChatModel;
  private toolManager: ToolManager;
  private messageManager: MessageManager;
  
  async execute(task: string): Promise<void> {
    // Step 1: Get plan from PlannerTool
    const planResult = await this.toolManager.execute('planner', { task });
    const plan = JSON.parse(planResult).plan;
   
   for {
    .... 
    /// NTN -- this is just the inner loop for step execution
    // NTN -- this is JUST pseudo code, need not implement it exactly like this. Think through and integrate this logic with my code.
    // Step 2: Execute each step
    for (let i = 0; i < plan.steps.length; i++) {
      this.currentStepOfPlan = i;
      const step = plan.steps[i];
      
      // Step 3: Get LLM to decide tool calls using bindTools
      // NTN -- let's call this function _executeStep
      const executionResponse = await this._executeStep(step);
      
      // Step 4: Parse and execute tool calls
      if (executionResponse.tool_calls && executionResponse.tool_calls.length > 0) {
        for (const toolCall of executionResponse.tool_calls) {
          if (toolCall.name === 'final_answer') {
            await this._handleSimpleAnswer(toolCall.args);
          } else {
            await this._executeToolCall(toolCall);
          }
        }
      } else {
        // Fallback: Treat content as direct answer if no tool calls
        await this._handleSimpleAnswer({ content: executionResponse.content });
      }
      
      // Step 5: Check if task is complete
      if (await this._isTaskComplete()) {
        break;
      }
    }
    ....
   }
  }
  
  private async _executeStep(step: PlanStep): Promise<AIMessage> {
    // Get all available tools + final_answer
    const tools = [...this.toolManager.getAllTools(), finalAnswerTool];
    
    // Bind tools to LLM
    const llmWithTools = this.llm.bindTools(tools);
    
    // Build messages for this step
    const messages = [
      new SystemMessage(this._buildStepExecutionPrompt(tools)),
      new HumanMessage(`
        Current step to execute:
        Action: ${step.action}
        Reasoning: ${step.reasoning}
      `)
    ];
    
    // Invoke bound LLM
    const response = await llmWithTools.invoke(messages);
    
    // Add raw response to message history for tracing
    this.messageManager.addAIMessage(JSON.stringify(response));
    
    return response;
  }
}
```

// NTN -- can we put this into browser AGent prompt itself
// NTN -- look at PlannerTool -- there is SystemPrompt and TaskPrompt -- should we do something like this for BrowserAgent as well
### 4. Step Execution Prompt

```typescript
// This is pseudo code and should be appropriately updated according to the specific logic in the implementation.

const STEP_EXECUTION_PROMPT = `
You are executing a single step in a web automation plan.

Your task is to:
1. Understand what the step is asking you to do
2. Decide if you need to use a tool or can answer directly with 'final_answer'

AVAILABLE TOOLS (including final_answer):
{tools_description}  // Dynamically insert tool names/descriptions

Always use a tool if the step requires interaction (e.g., navigation, search).
Use 'final_answer' ONLY if no tool is needed and you can provide a direct response.

EXAMPLES:

Step: "Navigate to google.com"
Response: Call tool 'navigation_tool' with args { "url": "https://google.com" }

Step: "Check if we're on the homepage"
Response: Call tool 'final_answer' with args { "content": "Yes, we are on the Google homepage." }
`;
```

### 5. Tool Execution with Message Updates

```typescript
// This is pseudo code and should be appropriately updated according to the specific logic in the implementation.

private async _executeToolCall(toolCall: ToolCall): Promise<void> {
  const { name: tool_name, args } = toolCall;
  
  // Validate tool exists (exclude final_answer here)
  if (!this.toolManager.has(tool_name)) {
    throw new Error(`Tool ${tool_name} not found`);
  }
  
  // Record tool call in message history
  // NTN -- we don't have message manager function to record tool call, you add that.
  // NTN -- ACtually create a separate private method for this _updateMessageManagerWithToolCall , _updateMessageManagerWithToolResult and so on.
  this.messageManager.addToolCall({
    name: tool_name,
    args: args
  });
  
  try {
    // Execute tool
    const result = await this.toolManager.execute(tool_name, args);
    
    // Record tool result
    this.messageManager.addToolResult({
      tool_call_id: toolCallId,
      content: JSON.stringify(result)
    });
    
  } catch (error) {
    // Record tool error
    this.messageManager.addToolResult({
      tool_call_id: toolCallId,
      content: `Error: ${error.message}`,
      is_error: true
    });
    throw error;
  }
}

// NTN -- this need not be separate method, just use _updateMessageManagerWithToolResult
private async _handleSimpleAnswer(args: { content: string }): Promise<void> {
  // Record as AI message or special entry
  this.messageManager.addAIMessage(args.content);
}
```

### 6. Dynamic Tool Registration

```typescript
// This is pseudo code and should be appropriately updated according to the specific logic in the implementation.

// ToolManager provides tool descriptions dynamically
class ToolManager {
  getAllTools(): DynamicStructuredTool[] {
    return Object.values(this.tools);  // Return array of bound tools
  }
  

  // NTN  -- this is not defined
  getToolDescriptions(): string {
 // NTN -- you can probably use the zod schema used for input of the tool and then convert that to JSON schema using something like below
 // NTN -- i have already installed zod-to-json-schema 
//  import { DynamicStructuredTool } from "@langchain/core/tools";
// import { zodToJsonSchema } from "zod-to-json-schema";
// import { z } from "zod";

// const browserNavigationTool = new DynamicStructuredTool({
//   name: "navigation_tool",
//   description: "Navigate browser to a specific URL",
//   schema: z.object({
//     url: z.string().describe("The URL to navigate to"),
//   }),
//   func: async ({ url }) => `Navigated to ${url}`,
// });

// // Convert the tool's schema to JSON Schema
// const toolJsonSchema = zodToJsonSchema(
//   browserNavigationTool.schema,
//   "browserNavigationSchema"
// );

// console.log(JSON.stringify(toolJsonSchema, null, 2));

  }
}
```

## Key Design Benefits

1. **Explicit Tool Calling**: Uses `bindTools` to guide LLM, reducing brittle parsing.
2. **Flexible Responses**: 'final_answer' tool allows direct answers without forcing tool use.
3. **LangChain Native**: Leverages `bindTools` for better LLM compatibility and structured `tool_calls`.
4. **Traceable**: Records raw LLM responses and tool calls/results in history.
5. **Extensible**: Add tools dynamically; `bindTools` handles schema injection.
6. **No Custom Schemas for Decisions**: Replaces StepExecutionSchema with tool calls, simplifying output parsing.

## Migration Path

1. **Remove** custom StepExecutionSchema and `withStructuredOutput` calls.
2. **Add** 'final_answer' tool and update prompts to reference it.
3. **Update** `_getStepExecution` to use `bindTools` and parse `tool_calls`.
4. **Modify** execution loop to handle multiple tool calls per response if needed.
5. **Test** with steps requiring tools vs. direct answers.
6. **Refine** prompt to encourage proper use of 'final_answer' only when appropriate.

## Comparison with Nanobrowser

### Similarities
- Explicit tool selection by LLM.
- Comprehensive message history tracking.
- Dynamic tool discovery and description.

### Differences
- Nanobrowser: Action arrays in single stage.
- Our Design: Rolling-horizon planning with bindTools for decisions.
- Updated: bindTools replaces custom schemas for better reliability.

## Implementation Notes

1. Ensure LLM supports tool calling (e.g., GPT-4o, not all models do).
2. Handle multi-tool calls in `tool_calls` array (parallel execution if applicable).
3. For streaming: Use `llmWithTools.stream` and accumulate chunks before parsing.
4. Error handling: Retry on invalid tool calls.
5. Message history: Track bound tools for reproducibility.