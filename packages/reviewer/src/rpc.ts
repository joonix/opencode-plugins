import { Rpc } from "@opencode/plugin/rpc"

// Decisions reach the TUI only through this event: an auto-allowed request
// never produces a permission request, so permission.asked is not emitted.
export const Reviewer = Rpc.define({
  id: "joonix.reviewer",
  methods: {},
  events: {
    reviewing: {
      schema: {
        type: "object",
        properties: {
          reviewID: { type: "string" },
          sessionID: { type: "string" },
          action: { type: "string" },
        },
        required: ["reviewID", "sessionID", "action"],
        additionalProperties: false,
      },
    },
    reviewed: {
      schema: {
        type: "object",
        properties: {
          reviewID: { type: "string" },
          sessionID: { type: "string" },
          rootSessionID: { type: "string" },
          action: { type: "string" },
          resource: { type: "string" },
          decision: { type: "string" },
          reason: { type: "string" },
          durationMs: { type: "number" },
        },
        required: ["reviewID", "sessionID", "rootSessionID", "action", "resource", "decision", "reason", "durationMs"],
        additionalProperties: false,
      },
    },
  },
})
