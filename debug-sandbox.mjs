import { AgentClient } from "@21st-sdk/node";
const c = new AgentClient({ apiKey: process.env.API_KEY_21ST });

// Spawn with same setup as live page; agent name same.
const sb = await c.sandboxes.create({
  agent: "hub-tester",
  timeoutMs: 5 * 60 * 1000,
  envs: { GH_TOKEN: "DUMMY_TOKEN_VALUE", REPO_SLUG: "remoteworkhq/sandbox-test" },
  setup: [
    "echo HELLO_FROM_SETUP > /tmp/setup-marker.txt",
    "env > /tmp/env-dump.txt",
    "ls / > /tmp/ls-root.txt",
    "git clone https://x-access-token:${GH_TOKEN}@github.com/remoteworkhq/sandbox-test.git /workspace 2>/tmp/clone-err.txt || echo CLONE_FAILED >> /tmp/clone-err.txt",
  ],
});
console.log("sandbox:", sb.id);

// Wait a bit for setup to settle
await new Promise(r => setTimeout(r, 5000));

const checks = [
  "cat /tmp/setup-marker.txt 2>&1",
  "grep -E ^GH_TOKEN /tmp/env-dump.txt 2>&1",
  "cat /tmp/ls-root.txt 2>&1",
  "cat /tmp/clone-err.txt 2>&1",
  "ls /workspace 2>&1",
];
for (const cmd of checks) {
  const r = await c.sandboxes.exec({ sandboxId: sb.id, command: cmd });
  console.log("\n>", cmd);
  console.log("  exit:", r.exitCode);
  console.log("  stdout:", r.stdout?.slice(0, 400));
  console.log("  stderr:", r.stderr?.slice(0, 200));
}

await c.sandboxes.delete(sb.id);
console.log("\ndeleted", sb.id);
