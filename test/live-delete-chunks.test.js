const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createClient } = require("../skill-for-ragflow/lib/api.js");

const skillDir = path.resolve(__dirname, "..", "skill-for-ragflow");
const cliPath = path.join(skillDir, "scripts", "ragflow.js");
const liveSkip = process.env.RAGFLOW_LIVE_TEST === "1"
  ? false
  : "Set RAGFLOW_LIVE_TEST=1 to run against a live RAGFlow deployment";

function firstDocumentId(upload) {
  if (Array.isArray(upload)) return upload[0]?.id || "";
  if (Array.isArray(upload?.docs)) return upload.docs[0]?.id || "";
  if (upload?.docs?.id) return upload.docs.id;
  if (upload?.document?.id) return upload.document.id;
  return upload?.id || "";
}

test("live delete-chunks emits JSON diagnostics for manual chunk deletion", { skip: liveSkip }, async () => {
  const client = createClient({ timeout: Number(process.env.RAGFLOW_LIVE_TIMEOUT_MS || 60000) });
  const marker = `RAGFLOW_DELETE_JSON_${Date.now()}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ragflow-live-delete-json-"));
  const filePath = path.join(tempDir, "delete-json.md");
  let datasetId = "";

  try {
    fs.writeFileSync(
      filePath,
      [
        `# ${marker}`,
        "",
        "Temporary document for ragflow-skill live delete-chunks JSON diagnostics.",
      ].join("\n"),
      "utf8"
    );

    const dataset = await client.createDataset({
      name: `ragflow-live-delete-json-${Date.now()}`,
      chunk_method: "naive",
      permission: "me",
      embedding_model: process.env.RAGFLOW_LIVE_EMBEDDING_MODEL || "text-embedding-v4@Tongyi-Qianwen",
      description: "Temporary dataset for ragflow-skill live delete-chunks JSON diagnostics",
    });
    datasetId = dataset.id;

    const upload = await client.uploadDocuments(datasetId, [filePath]);
    const documentId = firstDocumentId(upload);
    assert.ok(documentId, "upload should return a document id");

    await client.startParsing(datasetId, [documentId]);
    const parsed = await client.waitForParsing(datasetId, [documentId], {
      maxWait: Number(process.env.RAGFLOW_LIVE_PARSE_TIMEOUT_MS || 120000),
      interval: Number(process.env.RAGFLOW_LIVE_PARSE_INTERVAL_MS || 3000),
    });
    assert.ok(parsed.every((doc) => doc.run === "DONE"), "document parsing should finish before chunk deletion");

    const added = await client.addChunk(datasetId, documentId, {
      content: `Manual chunk for live delete-chunks JSON diagnostics. ${marker}`,
      important_keywords: ["delete", "json", "diagnostics"],
    });
    const chunkId = added?.chunk?.id || added?.id;
    assert.ok(chunkId, "addChunk should return a chunk id");

    const cli = spawnSync(
      process.execPath,
      [
        cliPath,
        "delete-chunks",
        "--dataset",
        datasetId,
        "--document",
        documentId,
        "--chunk-ids",
        chunkId,
        "--json",
      ],
      {
        cwd: skillDir,
        env: {
          ...process.env,
          RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS: process.env.RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS || "1000",
        },
        encoding: "utf8",
      }
    );

    assert.equal(cli.status, 0, `STDOUT:\n${cli.stdout}\nSTDERR:\n${cli.stderr}`);
    assert.equal(cli.stderr, "");

    const payload = JSON.parse(cli.stdout);
    assert.deepEqual(payload.result, {});
    assert.deepEqual(payload.requested_chunk_ids, [chunkId]);
    assert.deepEqual(payload.missing_chunk_ids, []);
    assert.equal(typeof payload.visibility_checked, "boolean");
    assert.equal(typeof payload.retry_count, "number");
    assert.ok(Array.isArray(payload.existing_chunk_ids));
    assert.ok(Array.isArray(payload.retries));

    if (payload.retry_count > 0) {
      assert.ok(payload.existing_chunk_ids.includes(chunkId));
      assert.ok(payload.retries.some((retry) => retry.existing_chunk_ids.includes(chunkId)));
    }
  } finally {
    if (datasetId) {
      await client.deleteDatasets([datasetId]);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
