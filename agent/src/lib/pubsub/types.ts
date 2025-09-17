import { z } from 'zod'

// Message envelope for upsert-based updates
export const MessageSchema = z.object({
  msgId: z.string(),  // Stable ID for message (e.g., "msg_think_1", "msg_tool_result_2")
  content: z.string(),  // Full markdown content
  role: z.enum(['thinking', 'user', 'assistant', 'error', 'narration', 'plan_editor']),  // Message role (added plan_editor)
  ts: z.number(),  // Timestamp in milliseconds
})

export type Message = z.infer<typeof MessageSchema>

// Execution status
export const ExecutionStatusSchema = z.object({
  status: z.enum(['running', 'done', 'cancelled', 'error']),  // Current execution state
  ts: z.number(),  // Timestamp when status changed
  message: z.string().optional(),  // Optional message (e.g., error details)
})

export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>

// Human input request/response schemas
export const HumanInputRequestSchema = z.object({
  requestId: z.string(),  // Unique request identifier
  prompt: z.string(),  // The prompt to show to the human
})

export type HumanInputRequest = z.infer<typeof HumanInputRequestSchema>

export const HumanInputResponseSchema = z.object({
  requestId: z.string(),  // Matching request identifier
  action: z.enum(['done', 'abort']),  // User's action choice
})

export type HumanInputResponse = z.infer<typeof HumanInputResponseSchema>

// Plan editing schemas
export const PlanStepSchema = z.object({
  id: z.string(),  // Unique step identifier
  action: z.string(),  // Step description/action
  reasoning: z.string().optional(),  // Why this step is needed
  order: z.number(),  // Display order
  isEditable: z.boolean().default(true)  // Whether step can be edited
})

export type PlanStep = z.infer<typeof PlanStepSchema>

export const PlanEditRequestSchema = z.object({
  planId: z.string(),  // Unique plan identifier
  steps: z.array(PlanStepSchema),  // Array of plan steps
  task: z.string(),  // Original task description
  isPreview: z.boolean().default(true)  // Whether this is a preview or final plan
})

export type PlanEditRequest = z.infer<typeof PlanEditRequestSchema>

export const PlanEditResponseSchema = z.object({
  planId: z.string(),  // Matching plan identifier
  action: z.enum(['execute', 'cancel']),  // User's choice
  steps: z.array(PlanStepSchema).optional()  // Modified steps (if action is 'execute')
})

export type PlanEditResponse = z.infer<typeof PlanEditResponseSchema>

// Pub-sub event types
export const PubSubEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    payload: MessageSchema
  }),
  z.object({
    type: z.literal('execution-status'),
    payload: ExecutionStatusSchema
  }),
  z.object({
    type: z.literal('human-input-request'),
    payload: HumanInputRequestSchema
  }),
  z.object({
    type: z.literal('human-input-response'),
    payload: HumanInputResponseSchema
  }),
  z.object({
    type: z.literal('plan-edit-request'),
    payload: PlanEditRequestSchema
  }),
  z.object({
    type: z.literal('plan-edit-response'),
    payload: PlanEditResponseSchema
  }),
])

export type PubSubEvent = z.infer<typeof PubSubEventSchema>

// Subscription callback
export type SubscriptionCallback = (event: PubSubEvent) => void

// Subscription handle for unsubscribing
export interface Subscription {
  unsubscribe: () => void
}
