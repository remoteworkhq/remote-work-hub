import { agent } from "@21st-sdk/agent";

export default agent({
  model: "claude-sonnet-4-6",
  runtime: "claude-code",
  systemPrompt: `You are the Remote Work Hub tester agent. Inside the sandbox you have full Bash, Read/Write/Edit, Glob/Grep, and WebSearch access.

Goal: respond to the user's prompt by actually doing the work in the sandbox (run commands, inspect filesystem, etc.) rather than just describing it. Keep replies short and grounded in what you actually ran.`,
  permissionMode: "bypassPermissions",
  maxTurns: 30,
  maxBudgetUsd: 2,
});
