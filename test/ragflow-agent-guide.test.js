const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const examplesDir = path.resolve(
  __dirname,
  "..",
  "skill-for-ragflow",
  "references",
  "examples",
  "agents",
);
const guidePath = path.resolve(
  __dirname,
  "..",
  "skill-for-ragflow",
  "references",
  "AGENT_GUIDE.md",
);

function loadExample(name) {
  const fullPath = path.join(examplesDir, name);
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

function loadGuide() {
  return fs.readFileSync(guidePath, "utf-8");
}

function loadAllExamples() {
  return fs
    .readdirSync(examplesDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ name, dsl: loadExample(name) }));
}

function assertPlainObject(value, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}

function validateDslShape(name, dsl) {
  assertPlainObject(dsl, `${name} DSL`);
  for (const key of ["components", "globals", "variables", "graph"]) {
    assert.ok(Object.hasOwn(dsl, key), `${name} is missing top-level key: ${key}`);
  }
  for (const key of ["history", "path", "retrieval"]) {
    assert.ok(Object.hasOwn(dsl, key), `${name} is missing top-level key: ${key}`);
    assert.ok(Array.isArray(dsl[key]), `${name} top-level ${key} must be an array`);
  }

  assertPlainObject(dsl.components, `${name} components`);
  assertPlainObject(dsl.globals, `${name} globals`);
  assertPlainObject(dsl.variables, `${name} variables`);
  assertPlainObject(dsl.graph, `${name} graph`);
  assert.ok(Array.isArray(dsl.graph.nodes), `${name} graph.nodes must be an array`);
  assert.ok(Array.isArray(dsl.graph.edges), `${name} graph.edges must be an array`);

  const componentIds = Object.keys(dsl.components);
  assert.ok(componentIds.includes("begin"), `${name} must define a begin component`);

  const nodeIds = new Set();
  for (const node of dsl.graph.nodes) {
    assertPlainObject(node, `${name} graph node`);
    assert.equal(typeof node.id, "string", `${name} graph node id must be a string`);
    nodeIds.add(node.id);
    assert.ok(componentIds.includes(node.id), `${name} graph node ${node.id} must have a matching component`);
    assertPlainObject(node.data, `${name} graph node ${node.id} data`);
    assert.equal(typeof node.data.name, "string", `${name} graph node ${node.id} must define data.name`);
    assert.ok(node.data.name.length > 0, `${name} graph node ${node.id} data.name must be non-empty`);
  }

  assert.ok(nodeIds.has("begin"), `${name} must define a begin graph node`);

  for (const [componentId, component] of Object.entries(dsl.components)) {
    assertPlainObject(component, `${name} component ${componentId}`);
    assert.ok(nodeIds.has(componentId), `${name} component ${componentId} must have a matching graph node`);
    assertPlainObject(component.obj, `${name} component ${componentId}.obj`);
    assert.equal(typeof component.obj.component_name, "string", `${name} component ${componentId} must define obj.component_name`);
    assert.ok(Array.isArray(component.downstream), `${name} component ${componentId}.downstream must be an array`);
    assert.ok(Array.isArray(component.upstream), `${name} component ${componentId}.upstream must be an array`);
    for (const targetId of component.downstream) {
      assert.ok(componentIds.includes(targetId), `${name} component ${componentId} downstream target ${targetId} is missing`);
    }
    for (const sourceId of component.upstream) {
      assert.ok(componentIds.includes(sourceId), `${name} component ${componentId} upstream source ${sourceId} is missing`);
    }
    if (component.parent_id !== undefined) {
      assert.equal(typeof component.parent_id, "string", `${name} component ${componentId}.parent_id must be a string`);
      assert.ok(componentIds.includes(component.parent_id), `${name} component ${componentId} parent ${component.parent_id} is missing`);
    }
  }

  for (const edge of dsl.graph.edges) {
    assertPlainObject(edge, `${name} graph edge`);
    assert.equal(typeof edge.source, "string", `${name} graph edge source must be a string`);
    assert.equal(typeof edge.target, "string", `${name} graph edge target must be a string`);
    assert.ok(componentIds.includes(edge.source), `${name} graph edge source ${edge.source} is missing`);
    assert.ok(componentIds.includes(edge.target), `${name} graph edge target ${edge.target} is missing`);
  }
}

test("agent guide examples are valid current-schema DSL fixtures", () => {
  const examples = loadAllExamples();
  assert.ok(examples.length >= 5, "expected at least five agent examples");

  for (const { name, dsl } of examples) {
    validateDslShape(name, dsl);
  }
});

test("tool, iteration, and webhook examples include their critical structures", () => {
  const toolDsl = loadExample("03-tool-agent.json");
  const toolAgent = toolDsl.components["agent:0"];
  assert.equal(toolAgent.obj.component_name, "Agent");
  assert.ok(Array.isArray(toolAgent.obj.params.tools));
  assert.ok(toolAgent.obj.params.tools.length > 0);
  assert.equal(typeof toolAgent.obj.params.tools[0].component_name, "string");

  const iterationDsl = loadExample("04-iteration-agent.json");
  assert.equal(iterationDsl.components["iteration:0"].obj.component_name, "Iteration");
  assert.equal(iterationDsl.components["iterationitem:0"].obj.component_name, "IterationItem");
  assert.equal(iterationDsl.components["iterationitem:0"].parent_id, "iteration:0");
  assert.equal(typeof iterationDsl.components["iteration:0"].obj.params.items_ref, "string");
  assert.equal(iterationDsl.components["iteration:0"].obj.params.items_ref, "agent:0@structured.items");
  assert.equal(iterationDsl.components["agent:0"].obj.params.outputs.structured.type, "object");
  assert.equal(iterationDsl.components["agent:0"].obj.params.outputs.structured.properties.items.type, "array");

  const webhookDsl = loadExample("05-webhook-message.json");
  const begin = webhookDsl.components.begin.obj.params;
  assert.equal(begin.mode, "Webhook");
  assert.equal(begin.schema.body.properties.message.type, "string");
  assert.equal(begin.response.status, 200);
});

test("agent guide is in English and points to canonical references", () => {
  const guide = loadGuide();

  for (const snippet of [
    "references/examples/agents/01-conversational-message.json",
    "references/examples/agents/02-retrieval-message.json",
    "references/examples/agents/03-tool-agent.json",
    "references/examples/agents/04-iteration-agent.json",
    "references/examples/agents/05-webhook-message.json",
    "[COMMANDS.md](COMMANDS.md)",
    "[API.md](API.md)",
    "[TROUBLESHOOTING.md](TROUBLESHOOTING.md)",
    "# RAGFlow Custom Agent Guide",
    "## Shortest path",
    "## Current schema checklist",
    "## Common failures",
  ]) {
    assert.match(guide, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const sourcePath of [
    "ragflow/api/apps/sdk/agents.py",
    "ragflow/api/apps/sdk/session.py",
    "ragflow/api/db/services/canvas_service.py",
    "ragflow/api/apps/services/canvas_replica_service.py",
    "ragflow/agent/canvas.py",
    "ragflow/agent/dsl_migration.py",
    "ragflow/web/src/pages/agent/utils.ts",
    "ragflow/web/src/constants/agent.tsx",
  ]) {
    assert.doesNotMatch(guide, new RegExp(sourcePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const chineseSnippet of [
    "自定义智能体指南",
    "最短路径",
    "当前 schema 检查清单",
    "常见故障",
    "源码副本",
  ]) {
    assert.doesNotMatch(guide, new RegExp(chineseSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
