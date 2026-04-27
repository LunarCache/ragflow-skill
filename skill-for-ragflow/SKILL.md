---
name: skill-for-ragflow
description: Operate RAGFlow v0.25.x deployments through the bundled Node CLI and API client. Use when user needs to manage RAGFlow datasets, documents, uploads, parsing, chunks, retrieval, chat assistants, chat sessions, agents, agent sessions, metadata filters, model discovery, system settings, or API diagnostics. Also use when the user asks about knowledge bases, document chunking, vector retrieval, or RAG workflows and the current context explicitly involves a RAGFlow server or deployment.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - node
      env:
        - RAGFLOW_URL
        - RAGFLOW_API_KEY
    primaryEnv: RAGFLOW_API_KEY
    homepage: https://github.com/LunarCache/ragflow-skill
---

# RAGFlow Skill

Use this skill to operate RAGFlow through `scripts/ragflow.js`. The CLI wraps the full v0.25.x REST API - every action goes through `node {baseDir}/scripts/ragflow.js <command> [options]`. Prefer `--json` on any command when the output will be parsed or chained into another step.

## Requirements

- Set `RAGFLOW_URL` and `RAGFLOW_API_KEY` in the environment or this skill's `.env`.
- Use Node.js to run bundled scripts.
- Set `RAGFLOW_WEB_TOKEN` only when `list-models` needs a web-session token for `/v1/llm/my_llms`.
- Tune chunk deletion retries only when needed with `RAGFLOW_DELETE_CHUNK_RETRIES` and `RAGFLOW_DELETE_CHUNK_RETRY_DELAY_MS`.
- Tune the chunk deletion diagnostic script only when needed with `RAGFLOW_REPRO_TIMEOUT_MS`, `RAGFLOW_REPRO_DELETE_RETRIES`, `RAGFLOW_REPRO_DELETE_RETRY_DELAY_MS`, and `RAGFLOW_REPRO_EMBEDDING_MODEL`.

## Quick Command Reference

| Scenario | Commands |
|----------|----------|
| **Knowledge base setup** | `create-dataset`, `list-datasets`, `get-dataset`, `update-dataset`, `delete-datasets` |
| **Document ingestion** | `upload-documents`, `list-documents`, `get-document`, `update-document`, `delete-documents`, `metadata-summary` |
| **Parsing & chunking** | `start-parsing`, `stop-parsing`, `wait-parsing`, `list-chunks`, `add-chunk`, `update-chunk`, `delete-chunks` |
| **Direct retrieval** | `retrieve` |
| **Chat assistant** | `create-chat`, `list-chats`, `get-chat`, `update-chat`, `patch-chat`, `delete-chats` |
| **Chat sessions** | `create-session`, `list-sessions`, `delete-sessions`, `chat`, `chat-session` |
| **Agent** | `create-agent`, `list-agents`, `get-agent`, `update-agent`, `delete-agents` |
| **Agent sessions** | `create-agent-session`, `list-agent-sessions`, `delete-agent-sessions`, `agent-chat` |
| **Model discovery** | `list-models` |
| **System** | `system-version`, `get-log-levels`, `set-log-level` |

## Common Workflows

### Full RAG pipeline (upload -> parse -> retrieve)

1. `create-dataset --name "My KB" --chunk-method naive`
2. `upload-documents --dataset <id> --files ./doc1.pdf ./doc2.txt`
3. `start-parsing --dataset <id> --doc-ids <doc_id1> <doc_id2>`
4. `wait-parsing --dataset <id> --doc-ids <doc_id1> <doc_id2>`
5. `retrieve --question "What is X?" --datasets <id>`

### Chat assistant with sessions

1. `create-chat --name "Q&A" --datasets <id> --llm-id <model>`
2. `create-session --chat <chat_id>`
3. `chat-session --chat <chat_id> --session <session_id> --question "Hello"`

### Agent workflow

1. `create-agent --title "Assistant" --dsl @agent_dsl.json`
2. `create-agent-session --agent <agent_id>`
3. `agent-chat --agent <agent_id> --session <session_id> --question "Hello"`

## Workflow Decision Guide

The first step in any RAGFlow operation is resolving the target resource ID. After that, choose the right path:

1. **Need CLI syntax or option details?** -> Read [references/COMMANDS.md](references/COMMANDS.md) - it's organized by workflow scenario with full option tables.
2. **Editing client code or checking request/response shapes?** -> Read [references/API.md](references/API.md) - it has code examples for every `RagflowClient` method.
3. **A command failed?** -> Read [references/TROUBLESHOOTING.md](references/TROUBLESHOOTING.md) - common errors with causes and fixes.
4. **Formatting output for the user?** -> Read [references/REFERENCE.md](references/REFERENCE.md) - consistent response templates and status labels.

## Key Constraints

- **Destructive deletes need confirmation.** RAGFlow deletes are immediate and irreversible. Confirm before running `delete-datasets`, `delete-documents`, `delete-chunks`, `delete-chats`, `delete-sessions`, or `delete-agents` - unless the resource is a temporary artifact you created in the same workflow and the user asked you to clean up.
- **Upload and parsing are separate steps.** RAGFlow does not auto-parse on upload because different documents may need different chunk methods. Upload first, adjust config if needed, then start parsing explicitly.
- **Use v0.25.x route shapes from the references.** The RAGFlow API has changed between versions. The routes and payloads in the reference docs match v0.25.x - inventing fallback payloads will produce errors on real servers.
- **Tenant model identifiers use the `model@provider` format.** When creating datasets with `--embedding-model`, the server expects the full identifier, for example `text-embedding-v4@Tongyi-Qianwen`, not just the model name. Use `list-models` to discover the correct identifiers.
- **Chat sessions use the API-key SDK route.** `chat-session` posts to `/api/v1/chats/{chat_id}/completions` with `session_id` in the body. This is the v0.25.x API-key route - the login-session frontend route is intentionally avoided.
- **Agent DSL requires specific top-level fields.** RAGFlow agents need `components`, `history`, `path`, `retrieval`, `globals`, and `graph` in the DSL. Missing fields cause `KeyError` at creation time.
- **Chunk deletion may need retries.** The v0.25.0 server can return `rm_chunk deleted chunks 0, expect N` due to document-store refresh lag even when the chunk exists. The CLI handles this automatically - it retries after confirming the chunk is still visible via exact ID lookup. If retries still fail, run `scripts/repro-delete-chunks.js` for a clean diagnosis.

## Output Format

When presenting results to the user, follow the templates in [references/REFERENCE.md](references/REFERENCE.md). Key conventions:

- **3+ items with attributes** -> Table, abbreviating long IDs
- **Sequential steps** -> Numbered list
- **Parsing status** -> Use labels: `UNSTART`, `RUNNING`, `CANCEL`, `DONE`, `FAIL`
- **Search results** -> Table with similarity scores, content as quote blocks
- **Errors** -> Show code and human-readable message
