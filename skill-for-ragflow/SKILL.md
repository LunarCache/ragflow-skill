---
name: skill-for-ragflow
description: Operate RAGFlow v0.26.4 deployments through a bundled Node CLI for everyday knowledge-base setup, document ingestion, parsing, retrieval, chat assistants, agents, GraphRAG, connectors, models, and diagnostics. Use when a request explicitly involves a RAGFlow server, dataset, document pipeline, or RAGFlow agent.
metadata:
  version: 1.7.0
  compatibility: RAGFlow v0.26.4
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

Operate common RAGFlow v0.26.4 workflows through `node {baseDir}/scripts/ragflow.js <command> [options]`. Prefer `--json` when parsing or chaining results. This skill intentionally prioritizes daily operations over exhaustive API coverage.

## Requirements

- Set `RAGFLOW_URL` and `RAGFLOW_API_KEY` in the environment or this skill's `.env`.
- Use Node.js to run bundled scripts.
- Run `system-health --json` after first-time setup to verify connectivity and authentication.

## Security Notes

- **Use HTTPS in production.** Production deployments should use `https://` for `RAGFLOW_URL` to protect the API key in transit. Local development (`http://localhost`) is acceptable for testing.
- **Use a dedicated, rotatable API key for automation.** RAGFlow v0.26.4 API keys are tenant-scoped rather than permission-scoped.
- **Protect your API key.** Never share `RAGFLOW_API_KEY` in chat messages or commit it to version control. Use environment variables or the skill's `.env` file.

## Quick Command Reference

| Scenario | Commands |
|----------|----------|
| **Knowledge base setup** | `create-dataset`, `list-datasets`, `get-dataset`, `update-dataset`, `delete-datasets` |
| **Document ingestion** | `upload-documents`, `ingest-documents`, `list-documents`, `get-document`, `update-document`, `delete-documents`, `download-document`, `preview-document`, `metadata-summary`, `update-metadata` |
| **Parsing & chunking** | `start-parsing`, `stop-parsing`, `wait-parsing`, `list-chunks`, `get-chunk`, `add-chunk`, `update-chunk`, `delete-chunks`, `get-document-graph`, `delete-document-graph` |
| **Direct retrieval** | `retrieve` |
| **Chat assistant** | `create-chat`, `list-chats`, `get-chat`, `update-chat`, `patch-chat`, `delete-chats` |
| **Chat sessions** | `create-session`, `list-sessions`, `get-session`, `update-session`, `delete-sessions`, `chat`, `chat-session` |
| **Agent** | `create-agent`, `list-agents`, `get-agent`, `update-agent`, `delete-agents` |
| **Agent Tags** | `list-agent-tags`, `update-agent-tags` |
| **Agent sessions** | `create-agent-session`, `list-agent-sessions`, `delete-agent-sessions`, `agent-chat` |
| **Connector** | `list-connectors`, `create-connector`, `get-connector`, `update-connector`, `delete-connector` |
| **RAPTOR** | `run-raptor`, `trace-raptor` |
| **GraphRAG** | `get-knowledge-graph`, `delete-knowledge-graph`, `run-graphrag`, `trace-graphrag` |
| **Embedded website access** | `list-system-tokens`, `create-system-token`, `delete-system-token`, `embed-code`, `embed-info`, `embed-chat`, `embed-agent-chat` |
| **Model discovery** | `list-models`, `list-added-models`, `list-default-models`, `set-default-model` |
| **Model providers** | `list-providers`, `get-provider`, `add-provider`, `delete-provider`, `list-provider-models`, `list-provider-instances`, `get-provider-instance`, `create-provider-instance`, `delete-provider-instances`, `verify-provider`, `list-instance-models`, `add-instance-model`, `set-model-status` |
| **System** | `system-version`, `system-health`, `get-log-levels`, `set-log-level` |

## Common Workflows

### Full RAG pipeline (upload -> parse -> retrieve)

1. `create-dataset --name "My KB" --chunk-method naive`
2. `upload-documents --dataset <id> --files ./doc1.pdf ./doc2.txt`
3. `start-parsing --dataset <id> --doc-ids <doc_id1> <doc_id2>`
4. `wait-parsing --dataset <id> --doc-ids <doc_id1> <doc_id2>`
5. `retrieve --question "What is X?" --datasets <id>`

### Chat assistant with sessions

1. `create-chat --name "Q&A" --datasets <id> --llm-id qwen-turbo@Tongyi-Qianwen`
2. `create-session --chat <chat_id>`
3. `chat-session --chat <chat_id> --session <session_id> --question "Hello"`

### Agent workflow

1. `create-agent --title "Assistant" --dsl @agent_dsl.json`
2. `create-agent-session --agent <agent_id>`
3. `agent-chat --agent <agent_id> --session <session_id> --question "Hello"`

`agent-chat` streams by default. Use `--stream false` for one final JSON response.

### Agent tags workflow

1. `list-agent-tags --agent <agent_id>`
2. `update-agent-tags --agent <agent_id> --tags "Tag1,Tag2"`

### Connector workflow

1. `create-connector --dataset <id> --config @connector.json`
2. `list-connectors --dataset <id>`
3. `get-connector --id <id>`

### Model provider workflow (v0.26.4)

1. `list-providers --available` to see configurable providers
2. `add-provider --name <provider>`
3. `create-provider-instance --name <provider> --instance <name> --api-key <key>` (credentials live on an instance; a provider can have several)
4. `add-instance-model --name <provider> --instance <name> --model-name <model> --model-type chat`
5. `set-default-model --model-type chat --model-provider <provider> --model-instance <name> --model-name <model>`

Use `verify-provider --name <provider> --api-key <key>` to test a key without persisting an instance.

### RAPTOR workflow

1. `run-raptor --dataset <id>`
2. `trace-raptor --dataset <id>`

### GraphRAG workflow

1. `run-graphrag --dataset <id>`
2. `trace-graphrag --dataset <id>`
3. `get-knowledge-graph --dataset <id>`

### Embedded website access

1. `embed-code --chat <chat_id> --type fullscreen` or `embed-code --agent <agent_id> --type widget`
2. `embed-info --chat <chat_id>` or `embed-info --agent <agent_id>`
3. `embed-chat --chat <chat_id> --question "Hello"` or `embed-agent-chat --agent <agent_id> --question "Hello"`

`embed-chat` automatically creates the embedded chatbot session when `--session` is omitted. RAGFlow's shared-site route only creates a session and returns the prologue on the first no-session request, so the CLI bootstraps `session_id` first and then sends the real question.

## Workflow Decision Guide

The first step in any RAGFlow operation is resolving the target resource ID. After that, choose the right path:

1. **Authoring or debugging a custom agent DSL?** -> Read [references/AGENT_GUIDE.md](references/AGENT_GUIDE.md) - it is a self-contained guide to the current RAGFlow agent DSL schema and includes minimal examples.
2. **Need CLI syntax or option details?** -> Read [references/COMMANDS.md](references/COMMANDS.md) - it's organized by workflow scenario with full option tables.
3. **Editing client code or checking request/response shapes?** -> Read [references/API.md](references/API.md) - it has code examples for every `RagflowClient` method.
4. **A command failed?** -> Read [references/TROUBLESHOOTING.md](references/TROUBLESHOOTING.md) - common errors with causes and fixes.
5. **Formatting output for the user?** -> Read [references/REFERENCE.md](references/REFERENCE.md) - consistent response templates and status labels.

## Key Constraints

- **Confirm destructive operations.** Confirm before any `delete-*` command or before `update-metadata` with `deletes` or an all-document selector, unless cleaning up temporary resources created in the same requested workflow.
- **Upload and parsing are separate steps.** RAGFlow does not auto-parse on upload because different documents may need different chunk methods. Upload first, adjust config if needed, then start parsing explicitly.
- **Use `ingest-documents` only for ingestion-pipeline datasets.** `start-parsing`/`stop-parsing` wrap the built-in chunking pipeline. RAGFlow v0.26.4 uses `POST /api/v1/documents/ingest` for datasets configured with an ingestion pipeline; pass `--run 1` to start/rerun and `--run 2` to cancel.
- **Preserve user-uploaded filenames.** RAGFlow stores the multipart `filename` as the document name. If a user attachment is materialized as a task ID or temporary path, pass the original filename inline: `upload-documents --files <original-name>=<path>`.
- **Use v0.26.4 route shapes from the references.** The reference docs match the current skill.
- **List endpoints cap `page_size` at 100.** RAGFlow v0.26.4 rejects `page_size > 100` on list endpoints. The CLI clamps `--page-size` (and `retrieve --top-n`) to 100 and prints a warning, so oversized requests succeed instead of erroring; page through results when you need more than 100 items.
- **Tenant model identifiers use the `model@provider` format.** When creating datasets with `--embedding-model` or chat assistants with `--llm-id`, the server expects the full identifier, for example `text-embedding-v4@Tongyi-Qianwen` or `qwen-turbo@Tongyi-Qianwen`, not a numeric model row ID. Use `list-models` to discover model names and providers.
- **Chat sessions use the v0.26.4 route.** `chat-session` posts to `/api/v1/chat/completions` with `chat_id` and `session_id` in the body.
- **Chat session history sends only the latest message by default.** `POST /api/v1/chat/completions` appends only the latest message to stored history. Use `--pass-all-history` or set `pass_all_history_messages: true` in the API payload to replace the entire history. `conversation_id` is accepted as an alias for `session_id`. Use `--legacy` only when a caller needs the old cumulative streaming format.
- **Embedded access uses beta tokens and embedded sessions.** `embed-code`, `embed-info`, `embed-chat`, and `embed-agent-chat` use the shared-site `/api/v1/chatbots/*` or `/api/v1/agentbots/*` routes. If `--beta` is not supplied, the CLI reuses the first `/api/v1/system/tokens` item with `beta` or creates one. For chatbot completions, the CLI auto-bootstraps `session_id` unless `--session` is supplied.
- **Treat embed auth material as sensitive output.** System tokens, `beta` values, and embed URLs or iframe HTML containing `auth=` are operational secrets. Use them when needed for the task, but do not print the full values back to the user unless the user explicitly asks for them.
- **Embed URL generation assumes a public RAGFlow origin.** `embed-code` uses `--origin` when supplied; otherwise it falls back to `RAGFLOW_URL`. When the API base URL and the public web origin differ, pass `--origin` explicitly so the generated iframe points at the actual shared-site page.
- **Prefer the current Agent DSL schema from `AGENT_GUIDE.md`.** In practice, hand-authored agents should include `components`, `history`, `path`, `retrieval`, `variables`, `globals`, and `graph`, plus `graph.nodes[].data.name` for every component-backed node.
- **Agent tags must be comma-separated strings.** When updating agent tags, pass them as a single string of comma-separated values.
- **Connectors require valid auth tokens.** Ensure the target service token is valid before creating a connector. `create-connector` passes `--config` through verbatim, so v0.26.4's new connector types (OneDrive, Outlook, Microsoft Teams, Slack, SharePoint, Salesforce, Azure Blob Storage) work by setting the type and auth fields in the config JSON.
- **Model-provider commands manage credentials.** Provider/model management (`list-providers`, `create-provider-instance`, `set-default-model`, etc.) uses the v0.26.4 `/api/v1/models` and `/api/v1/providers` routes with `RAGFLOW_API_KEY`. Credentials live on an instance, and a provider can hold multiple instances (multiple API keys). Treat any `--api-key` value as sensitive operational secret output - use it for the task but do not print it back to the user unless explicitly asked.
- **Agent chat uses the v0.26.4 route.** `agent-chat` posts to `/api/v1/agents/chat/completions` with `agent_id` in the body. Pass `--chat-template-kwargs '{"enable_thinking": false}'` to toggle thinking/reasoning modes on supported models.
- **Iteration agents should iterate over a real list output.** When an upstream `Agent` produces loop items, prefer an object-shaped structured output such as `{"items":[...]}` and point `Iteration.params.items_ref` at `agent:0@structured.items`. Start from `references/examples/agents/04-iteration-agent.json`.
- **Chunk deletion may need retries.** Some servers can return `rm_chunk deleted chunks 0, expect N` due to document-store refresh lag even when the chunk exists. The CLI handles this automatically - it retries after confirming the chunk is still visible via exact ID lookup. If retries still fail, run `scripts/repro-delete-chunks.js` for a clean diagnosis.

## Output Format

Use raw `--json` internally, then summarize the operational result. Preserve the server's parsing labels (`UNSTART`, `RUNNING`, `CANCEL`, `DONE`, `FAIL`) and similarity scores. Redact API keys, system tokens, beta values, and `auth=` query values unless the user explicitly requests copy-paste secret material. Read [references/REFERENCE.md](references/REFERENCE.md) only when a result needs a domain-specific response template.
