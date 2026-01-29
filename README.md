# SpockChat

This repository contains a minimal chat UI and backend (Node.js + static frontend) that lets you configure an LLM model and MCP servers (JSON-RPC) using HTTP or stdio transports.

Features
- Configure model type (mock or OpenAI-compatible), API key, and model name.
- Configure MCP server via HTTP JSON-RPC URL or a stdio command.
- Send prompts and receive streamed responses (SSE) in the UI.

Quick start
1. Install dependencies:

```bash
cd /Users/nukxb24/Projects/spockchat
npm install
```

2. Start server:

```bash
npm start
```

3. Open `http://localhost:5050` in your browser.

Usage notes
- To test tool integration with the mock model: submit a prompt containing the text `call_tool:` and the mock model will return a JSON instructing a tool call. If you configured an MCP HTTP URL, the server will forward the JSON-RPC request and include the tool result when asking the model to continue.
- For real LLM usage, choose `openai` as model type and enter your API key and model name. The server posts to `/chat/completions` on the API base provided. This is a minimal adapter — for production you might want to add streaming via the model provider and robust error handling.

Files added
- `server.js` — backend with `/api/config` and `/api/chat` (SSE streaming)
- `public/index.html`, `public/app.js` — frontend UI
- `package.json` — project manifest

Security
- This prototype stores configuration in memory only. Do not run with sensitive keys exposed to others. For production, secure storage and HTTPS are required.

## License

SpockChat is released under the [MIT License](LICENSE). See the [Third-Party Licenses](THIRD-PARTY-LICENSES.md) for information about dependencies.

## Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request.

## Support

- 🐛 [Report a bug](https://github.com/PDL-kaushal/spockchat/issues)
- 💡 [Request a feature](https://github.com/PDL-kaushal/spockchat/issues)
- 📖 [Documentation](https://github.com/PDL-kaushal/spockchat)


## Hyper-Minimal Chat UI with configurable LLM Models and MCP Servers

