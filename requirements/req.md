Build an autonomous AI agent (Node.js/TypeScript) with a polished UI that:
Takes a natural-language task
Autonomously plans steps and executes them
Chooses tools dynamically (web search, web scraping, Google Drive retrieval, vector search)
Iterates by feeding tool outputs back into the LLM
Stops when finished or when a step limit is reached
Returns a structured result with citations/sources
Also required:
Google Drive OAuth connection
One-time + incremental ingestion of Drive files (Docs/PDFs/text) into a vector database via embeddings
Similarity search over ingested Drive content during agent execution
Constraints:
No agent frameworks (e.g., LangChain, Vercel AI SDK)
You may use an LLM provider SDK (OpenAI/Anthropic/etc.)
Agent loop, planning logic, tool orchestration, and execution must be implemented from scratch
Grading criteria:
UI/UX quality
Code structure
Readability and maintainability
You're free to use coding agents.
There is no fixed timeframe; however, your ability to ship quickly will be measured and benchmarked against other candidates given a similar assignment.

