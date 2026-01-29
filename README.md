# SpockChat

Minimal, configurable LLM + MCP UI (Node.js + static frontend) with Markdown/LaTeX rendering, tool support, and streaming responses.

Features
- Configure model type: mock, OpenAI, Azure AI Foundry, or Local LMStudio.
- MCP servers via HTTP JSON-RPC or stdio.
- Streaming responses (SSE) with unified Markdown + LaTeX rendering.
- Message details modal with request/response, copy buttons, and LMStudio response IDs.
- About modal listing open-source packages and versions.

Quick start
1. Install dependencies:

```bash
cd /path/to/spockchat
npm install
```

2. Configure environment (optional):

```bash
cp .env.example .env
cp spockchat-mcp-config.example.json spockchat-mcp-config.json
```

3. Start server:

```bash
npm start
```

4. Open `http://localhost:5050` in your browser.

Usage notes
- LMStudio uses `previous_response_id` for context; the client persists the latest response ID and sends it on subsequent prompts.
- Render test page: `http://localhost:5050/render-test.html` (uses the same renderer as the chat UI).
- UI preferences are saved in `ui-settings.json` (theme, sidebar, accordions, code wrap).
- Logging is controlled by `LOGLEVEL` and optional flags: `LOG_LLM_REQUEST`, `LOG_LLM_RESPONSE`, `LOG_TOOL_REQUEST`, `LOG_TOOL_RESPONSE`, `LOG_TO_FILE`.

Security
- This prototype stores configuration in memory and UI settings in `ui-settings.json`. Do not expose sensitive keys; use secure storage and HTTPS in production.

## License

SpockChat is released under the [MIT License](LICENSE). See the [Third-Party Licenses](THIRD-PARTY-LICENSES.md) for information about dependencies.

## Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request.

## Support

- 🐛 [Report a bug](https://github.com/PDL-kaushal/spockchat/issues)
- 💡 [Request a feature](https://github.com/PDL-kaushal/spockchat/issues)
- 📖 [Documentation](https://github.com/PDL-kaushal/spockchat)


## Hyper-Minimal Chat UI with configurable LLM Models and MCP Servers

