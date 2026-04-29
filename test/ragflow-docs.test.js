const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf-8");
}

test("README reflects the current local and live test layout", () => {
  const readme = read("README.md");

  for (const snippet of [
    "ragflow-agent-guide.test.js",
    "ragflow-api.test.js",
    "ragflow-cli.test.js",
    "ragflow-e2e.test.js",
    "live-agent-create.test.js",
    "live-delete-chunks.test.js",
    "Most tests use an in-memory mock HTTP server",
    "opt-in integration tests against a real RAGFlow deployment",
  ]) {
    assert.match(readme, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("agent docs align on current iteration and non-stream agent-chat behavior", () => {
  const skill = read(path.join("skill-for-ragflow", "SKILL.md"));
  const commands = read(path.join("skill-for-ragflow", "references", "COMMANDS.md"));
  const api = read(path.join("skill-for-ragflow", "references", "API.md"));
  const troubleshooting = read(path.join("skill-for-ragflow", "references", "TROUBLESHOOTING.md"));

  assert.match(skill, /agent:0@structured\.items/);
  assert.match(commands, /agent-chat --agent <agent_id> --session <session_id> --question "Hello" --stream false/);
  assert.match(commands, /workflow_finished/);
  assert.doesNotMatch(commands, /source-backed/i);
  assert.match(api, /stream: false/);
  assert.match(api, /workflow_finished/);
  assert.match(troubleshooting, /agent:0@structured\.items/);
});

test("repo docs do not keep stale branding or unreadable publishing guidance", () => {
  const readme = read("README.md");
  const publishing = read("PUBLISHING.md");

  assert.doesNotMatch(readme, /OpenClaw/);
  assert.match(readme, /Codex\/OpenCode skill/);
  assert.match(publishing, /# Publishing to ClawHub/);
  assert.match(publishing, /test\/ragflow-docs\.test\.js/);
  assert.doesNotMatch(publishing, /鍙|鏈|ClawHub slug锛/);
});
