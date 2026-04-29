const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createClient } = require("../skill-for-ragflow/lib/api.js");

const skillDir = path.resolve(__dirname, "..", "skill-for-ragflow");
const examplesDir = path.join(skillDir, "references", "examples", "agents");
const liveSkip = process.env.RAGFLOW_LIVE_TEST === "1"
  ? false
  : "Set RAGFLOW_LIVE_TEST=1 to run against a live RAGFlow deployment";

function loadExample(name) {
  return JSON.parse(fs.readFileSync(path.join(examplesDir, name), "utf-8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function firstDocumentId(upload) {
  if (Array.isArray(upload)) return upload[0]?.id || "";
  if (Array.isArray(upload?.docs)) return upload.docs[0]?.id || "";
  if (upload?.docs?.id) return upload.docs.id;
  if (upload?.document?.id) return upload.document.id;
  return upload?.id || "";
}

function setRetrievalKbIds(dsl, datasetId) {
  if (dsl.components["retrieval:0"]) {
    dsl.components["retrieval:0"].obj.params.kb_ids = [datasetId];
  }
  const graphNode = dsl.graph?.nodes?.find((node) => node.id === "retrieval:0");
  if (graphNode?.data?.form) {
    graphNode.data.form.kb_ids = [datasetId];
  }
}

function setAgentToolKbIds(dsl, datasetId) {
  const componentTool = dsl.components["agent:0"]?.obj?.params?.tools?.[0];
  if (componentTool?.params) {
    componentTool.params.kb_ids = [datasetId];
  }
  const graphNode = dsl.graph?.nodes?.find((node) => node.id === "agent:0");
  const graphTool = graphNode?.data?.form?.tools?.[0];
  if (graphTool?.params) {
    graphTool.params.kb_ids = [datasetId];
  }
}

function setAgentLlm(dsl, componentId, llmId) {
  if (dsl.components[componentId]?.obj?.params) {
    dsl.components[componentId].obj.params.llm_id = llmId;
  }
  const graphNode = dsl.graph?.nodes?.find((node) => node.id === componentId);
  if (graphNode?.data?.form) {
    graphNode.data.form.llm_id = llmId;
  }
}

test("live common agent creation flow creates visible agents and supports minimal runtime checks", { skip: liveSkip }, async () => {
  const client = createClient({ timeout: Number(process.env.RAGFLOW_LIVE_TIMEOUT_MS || 120000) });
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const embeddingModel = process.env.RAGFLOW_LIVE_EMBEDDING_MODEL || "text-embedding-v4@Tongyi-Qianwen";
  const chatModel = process.env.RAGFLOW_LIVE_CHAT_MODEL || "qwen-turbo@Tongyi-Qianwen";
  const keepArtifacts = process.env.RAGFLOW_LIVE_KEEP_ARTIFACTS === "1";

  const datasetName = `skill-live-agent-kb-${stamp}`;
  const marker = `AGENT_LIVE_${stamp}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ragflow-live-agent-create-"));
  const docPath = path.join(tmpDir, "agent-live-kb.md");
  const createdAgentIds = [];
  let datasetId = "";

  fs.writeFileSync(
    docPath,
    [
      "# Live Agent Verification KB",
      "",
      `Marker: ${marker}`,
      "",
      "This document exists so retrieval-based agents can answer a real question.",
      "The expected answer should include the marker string above.",
      "It also mentions testing, deployment, and monitoring as sample iteration topics.",
    ].join("\n"),
    "utf8"
  );

  try {
    const dataset = await client.createDataset({
      name: datasetName,
      chunk_method: "naive",
      permission: "me",
      embedding_model: embeddingModel,
      description: `Live agent verification dataset ${stamp}`,
    });
    datasetId = dataset.id;

    const upload = await client.uploadDocuments(datasetId, [docPath]);
    const documentId = firstDocumentId(upload);
    assert.ok(documentId, "upload should return a document id");

    await client.startParsing(datasetId, [documentId]);
    const parsedDocs = await client.waitForParsing(datasetId, [documentId], {
      maxWait: Number(process.env.RAGFLOW_LIVE_PARSE_TIMEOUT_MS || 180000),
      interval: Number(process.env.RAGFLOW_LIVE_PARSE_INTERVAL_MS || 3000),
    });
    assert.ok(parsedDocs.every((doc) => doc.run === "DONE"), "document parsing should finish");

    const specs = [
      {
        key: "conversational",
        title: `skill-live-conversational-${stamp}`,
        description: "Live-created minimal conversational agent",
        dsl: (() => {
          const dsl = clone(loadExample("01-conversational-message.json"));
          dsl.components.begin.obj.params.prologue = "Live conversational agent ready.";
          dsl.graph.nodes.find((node) => node.id === "begin").data.form.prologue = "Live conversational agent ready.";
          dsl.components["message:0"].obj.params.content = ["Live conversational agent is working."];
          dsl.graph.nodes.find((node) => node.id === "message:0").data.form.content = ["Live conversational agent is working."];
          return dsl;
        })(),
        question: "Say hello.",
        checkRuntime: true,
      },
      {
        key: "retrieval",
        title: `skill-live-retrieval-${stamp}`,
        description: "Live-created retrieval-first agent",
        dsl: (() => {
          const dsl = clone(loadExample("02-retrieval-message.json"));
          setRetrievalKbIds(dsl, datasetId);
          return dsl;
        })(),
        question: "What marker is stored in the test knowledge base?",
        checkRuntime: true,
      },
      {
        key: "tool-agent",
        title: `skill-live-tool-agent-${stamp}`,
        description: "Live-created tool-enabled agent",
        dsl: (() => {
          const dsl = clone(loadExample("03-tool-agent.json"));
          setAgentLlm(dsl, "agent:0", chatModel);
          setAgentToolKbIds(dsl, datasetId);
          return dsl;
        })(),
        question: "Use the private knowledge base and tell me the marker string.",
        checkRuntime: true,
      },
      {
        key: "iteration",
        title: `skill-live-iteration-${stamp}`,
        description: "Live-created iteration agent",
        dsl: (() => {
          const dsl = clone(loadExample("04-iteration-agent.json"));
          setAgentLlm(dsl, "agent:0", chatModel);
          setAgentLlm(dsl, "agent:1", chatModel);
          return dsl;
        })(),
        question: "Break testing, deployment, and monitoring into short subtopics.",
        checkRuntime: true,
      },
      {
        key: "webhook",
        title: `skill-live-webhook-${stamp}`,
        description: "Live-created webhook agent",
        dsl: clone(loadExample("05-webhook-message.json")),
        question: null,
        checkRuntime: false,
      },
    ];

    for (const spec of specs) {
      const created = await client.createAgent({
        title: spec.title,
        description: spec.description,
        dsl: spec.dsl,
      });
      assert.equal(created, true, `${spec.key} creation should return true`);

      const listed = await client.listAgents({ title: spec.title, page: 1, page_size: 20 });
      const agent = Array.isArray(listed)
        ? listed.find((item) => item.title === spec.title) || listed[0]
        : null;
      assert.ok(agent?.id, `${spec.key} agent should be visible via listAgents`);
      createdAgentIds.push(agent.id);

      const fetched = await client.getAgent(agent.id);
      assert.equal(fetched.title, spec.title, `${spec.key} title should round-trip through getAgent`);

      const mode = fetched.dsl?.components?.begin?.obj?.params?.mode;
      if (spec.key === "webhook") {
        assert.equal(mode, "Webhook");
        continue;
      }
      assert.equal(mode, "conversational");

      const session = await client.createAgentSession(agent.id, { name: `${spec.key}-session-${stamp}` });
      assert.ok(session.id, `${spec.key} should create a session`);

      if (!spec.checkRuntime) {
        continue;
      }

      const answer = spec.key === "conversational"
        ? await client.agentChat(agent.id, session.id, spec.question)
        : await client.agentChat(agent.id, session.id, spec.question, { stream: false });
      assert.equal(typeof answer.answer, "string", `${spec.key} should return a normalized answer string`);
      assert.ok(answer.answer.length > 0, `${spec.key} should not return an empty answer`);

      if (spec.key === "retrieval") {
        assert.match(answer.answer, new RegExp(marker));
      }
      if (spec.key === "iteration") {
        assert.match(answer.answer, /\[/);
      }
    }

    const finalAgents = await client.listAgents({ page: 1, page_size: 200 });
    for (const id of createdAgentIds) {
      assert.ok(finalAgents.some((agent) => agent.id === id), `final list should include agent ${id}`);
    }
  } finally {
    if (!keepArtifacts) {
      if (createdAgentIds.length) {
        await client.deleteAgents(createdAgentIds).catch(() => {});
      }
      if (datasetId) {
        await client.deleteDatasets([datasetId]).catch(() => {});
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
