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
    "ragflow-docs.test.js",
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
  assert.match(commands, /delete-system-token --token-stdin/);
  assert.match(commands, /delete-system-token --token-file/);
  assert.doesNotMatch(commands, /delete-system-token --token <ragflow-token>/);
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

test("SKILL.md constraints reference v0.25.5", () => {
  const skill = read(path.join("skill-for-ragflow", "SKILL.md"));

  // Assert Key Constraints section references v0.25.5
  assert.match(skill, /Use v0\.25\.5 route shapes/, "SKILL.md constraints should reference v0.25.5 route shapes");
  assert.match(skill, /v0\.25\.5 route/, "SKILL.md constraints should reference v0.25.5 routes");
});

test("SKILL.md Quick Command Reference includes new commands", () => {
  const skill = read(path.join("skill-for-ragflow", "SKILL.md"));

  // Assert Quick Command Reference table includes new agent tag commands
  assert.match(skill, /list-agent-tags/, "SKILL.md Quick Command Reference should include list-agent-tags");
  assert.match(skill, /update-agent-tags/, "SKILL.md Quick Command Reference should include update-agent-tags");

  // Assert Quick Command Reference table includes download-document
  assert.match(skill, /download-document/, "SKILL.md Quick Command Reference should include download-document");

  // Assert Quick Command Reference table includes connector commands
  assert.match(skill, /list-connectors/, "SKILL.md Quick Command Reference should include list-connectors");
  assert.match(skill, /create-connector/, "SKILL.md Quick Command Reference should include create-connector");
  assert.match(skill, /update-connector/, "SKILL.md Quick Command Reference should include update-connector");
  assert.match(skill, /delete-connector/, "SKILL.md Quick Command Reference should include delete-connector");

  // Assert Quick Command Reference table includes raptor commands
  assert.match(skill, /run-raptor/, "SKILL.md Quick Command Reference should include run-raptor");
  assert.match(skill, /trace-raptor/, "SKILL.md Quick Command Reference should include trace-raptor");
});

test("new API methods documented in API.md", () => {
  const api = read(path.join("skill-for-ragflow", "references", "API.md"));

  // Assert new agent tag methods are documented
  assert.match(api, /listAgentTags/, "API.md should document listAgentTags method");
  assert.match(api, /updateAgentTags/, "API.md should document updateAgentTags method");

  // Assert download document methods are documented
  assert.match(api, /downloadDocument/, "API.md should document downloadDocument method");
  assert.match(api, /downloadDocumentById/, "API.md should document downloadDocumentById method");

  // Assert connector methods are documented
  assert.match(api, /listConnectors/, "API.md should document listConnectors method");
  assert.match(api, /createConnector/, "API.md should document createConnector method");
  assert.match(api, /getConnector/, "API.md should document getConnector method");
  assert.match(api, /updateConnector/, "API.md should document updateConnector method");
  assert.match(api, /deleteConnector/, "API.md should document deleteConnector method");

  // Assert raptor methods are documented
  assert.match(api, /runRaptor/, "API.md should document runRaptor method");
  assert.match(api, /traceRaptor/, "API.md should document traceRaptor method");
});

test("new command names documented in COMMANDS.md", () => {
  const commands = read(path.join("skill-for-ragflow", "references", "COMMANDS.md"));

  // Assert new agent tag commands are documented
  assert.match(commands, /list-agent-tags/, "COMMANDS.md should document list-agent-tags command");
  assert.match(commands, /update-agent-tags/, "COMMANDS.md should document update-agent-tags command");

  // Assert download-document command is documented
  assert.match(commands, /download-document/, "COMMANDS.md should document download-document command");

  // Assert connector commands are documented
  assert.match(commands, /list-connectors/, "COMMANDS.md should document list-connectors command");
  assert.match(commands, /create-connector/, "COMMANDS.md should document create-connector command");
  assert.match(commands, /get-connector/, "COMMANDS.md should document get-connector command");
  assert.match(commands, /update-connector/, "COMMANDS.md should document update-connector command");
  assert.match(commands, /delete-connector/, "COMMANDS.md should document delete-connector command");

  // Assert raptor commands are documented
  assert.match(commands, /run-raptor/, "COMMANDS.md should document run-raptor command");
  assert.match(commands, /trace-raptor/, "COMMANDS.md should document trace-raptor command");
});

test("version string consistency: all docs reference v0.25.5, not v0.25.2", () => {
  const skill = read(path.join("skill-for-ragflow", "SKILL.md"));
  const commands = read(path.join("skill-for-ragflow", "references", "COMMANDS.md"));
  const api = read(path.join("skill-for-ragflow", "references", "API.md"));
  const agentGuide = read(path.join("skill-for-ragflow", "references", "AGENT_GUIDE.md"));
  const troubleshooting = read(path.join("skill-for-ragflow", "references", "TROUBLESHOOTING.md"));

  // Assert no file contains v0.25.2
  assert.doesNotMatch(skill, /v0\.25\.2/, "SKILL.md should not reference v0.25.2");
  assert.doesNotMatch(commands, /v0\.25\.2/, "COMMANDS.md should not reference v0.25.2");
  assert.doesNotMatch(api, /v0\.25\.2/, "API.md should not reference v0.25.2");
  assert.doesNotMatch(agentGuide, /v0\.25\.2/, "AGENT_GUIDE.md should not reference v0.25.2");
  assert.doesNotMatch(troubleshooting, /v0\.25\.2/, "TROUBLESHOOTING.md should not reference v0.25.2");

  // Assert SKILL.md references v0.25.5 in description
  assert.match(skill, /v0\.25\.5/, "SKILL.md description should reference v0.25.5");
});
