import { AgentClient } from "@21st-sdk/node";
const c = new AgentClient({ apiKey: process.env.API_KEY_21ST });

const sb = await c.sandboxes.create({
  agent: "hub-tester",
  timeoutMs: 3 * 60 * 1000,
  envs: { GH_TOKEN: "DUMMY_VAL", REPO_SLUG: "remoteworkhq/sandbox-test" },
  setup: ["env > /tmp/setup-env.txt", "echo SETUP_DONE > /tmp/marker"],
});
console.log("sandbox:", sb.id);
await new Promise(r => setTimeout(r, 4000));

const checks = [
  ["setup-env file size", "wc -l /tmp/setup-env.txt"],
  ["setup saw GH_TOKEN", "grep GH_TOKEN /tmp/setup-env.txt"],
  ["setup saw REPO_SLUG", "grep REPO_SLUG /tmp/setup-env.txt"],
  ["exec sees GH_TOKEN", "echo GH=$GH_TOKEN REPO=$REPO_SLUG"],
  ["exec env count", "env | wc -l"],
  ["exec env greps", "env | grep -i token; env | grep -i repo"],
  ["with envs param", "echo with-param GH=$GH_TOKEN REPO=$REPO_SLUG"],
];

for (const [name, cmd] of checks) {
  const params = { sandboxId: sb.id, command: cmd };
  if (name === "with envs param") params.envs = { GH_TOKEN: "FOO", REPO_SLUG: "BAR" };
  const r = await c.sandboxes.exec(params);
  console.log("\n>", name);
  console.log("  stdout:", r.stdout?.trim());
  if (r.stderr?.trim()) console.log("  stderr:", r.stderr.trim());
}

await c.sandboxes.delete(sb.id);
