import { AgentClient } from "@21st-sdk/node";
const c = new AgentClient({ apiKey: process.env.API_KEY_21ST });

const sb = await c.sandboxes.create({
  agent: "hub-tester",
  timeoutMs: 5 * 60 * 1000,
  envs: { GH_TOKEN: "DUMMY_VAL", REPO_SLUG: "remoteworkhq/sandbox-test" },
  setup: ["env | sort > /tmp/setup-env.txt"],
});
console.log("sandbox:", sb.id);

await new Promise(r => setTimeout(r, 3000));

const setup_env = await c.sandboxes.exec({ sandboxId: sb.id, command: "grep -E ^(GH_TOKEN|REPO_SLUG) /tmp/setup-env.txt 2>&1" });
console.log("\nSETUP saw envs:\n", setup_env.stdout);

const exec_env = await c.sandboxes.exec({ sandboxId: sb.id, command: "env | grep -E ^(GH_TOKEN|REPO_SLUG) 2>&1" });
console.log("\nEXEC sees envs:\n", exec_env.stdout);

const exec_with_envs = await c.sandboxes.exec({
  sandboxId: sb.id,
  command: "env | grep -E ^(GH_TOKEN|REPO_SLUG)",
  envs: { GH_TOKEN: "DUMMY_VAL", REPO_SLUG: "remoteworkhq/sandbox-test" },
});
console.log("\nEXEC with envs param sees:\n", exec_with_envs.stdout);

await c.sandboxes.delete(sb.id);
