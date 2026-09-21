# Optional capability recipe

Read only for this requested capability. The examples below come from the original imported skill; package versions, service plans, CLI flags, and provider APIs must be checked against the installed version and current official documentation before use. Preserve existing app configuration instead of replacing whole files. Environment, deployment, DNS, and paid operations must be within the user's authorized scope; use the repository backend-operations guide.

# Add an AI agent / RAG backend

Install @convex-dev/agent for durable threads, message history, tool-calls, and vector search/RAG — the backend for an in-app AI agent. Select the model provider according to the application requirements, installed packages, and available plan. A supported gateway can centralize provider credentials; verify its current capabilities and cost before choosing it.

## Workflow

1. Install @convex-dev/agent + @convex-dev/ai-sdk-provider; add the agent component to convex.config.ts.
2. Define the agent (tools, instructions) with `languageModel: convexGateway("provider/model")` — no API key needed (needs convex 1.45+ on a Convex Cloud deployment, paid plan).
3. Create threads + stream messages; persist history in Convex.
4. For RAG: embed docs into a vector index and retrieve in the tool. The gateway does not serve embeddings yet, so store the embedding provider's key through the selected deployment environment.
5. Only if the gateway is unavailable (free plan, self-hosted, local backend): call the provider SDK with a key stored through the selected deployment environment.

## Rules

- The gateway example uses `convexGateway` from @convex-dev/ai-sdk-provider. Confirm availability and the selected provider before installing or changing an integration.
- Never expose a provider API key client-side; when one is needed (embeddings, gateway fallback), keep it in Convex env through the selected deployment environment.
- Run model calls in actions ('use node' if the SDK needs it).
- Persist threads/messages in Convex for durability + reactivity.
