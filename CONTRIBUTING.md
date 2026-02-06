# Contributing to SpockChat

Thank you for your interest in contributing to SpockChat! This document provides guidelines for contributing to the project.

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and considerate in all interactions.

## How to Contribute

### Reporting Bugs

- Check if the bug has already been reported in [Issues](https://github.com/PDL-kaushal/spockchat/issues)
- If not, create a new issue with:
  - Clear description of the problem
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment details (OS, Node version, etc.)

### Suggesting Features

- Open an issue with the `enhancement` label
- Describe the feature and its use case
- Explain why it would be valuable to users

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Set up your environment:**
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your credentials
   ```
3. **Make your changes:**
   - Write clear, documented code
   - Follow existing code style
   - Add tests if applicable
4. **Test your changes:**
   ```bash
   npm run dev
   ```
5. **Commit with clear messages:**
   ```bash
   git commit -m "Add feature: description"
   ```
6. **Push and create a Pull Request**

### Code Style

- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and concise
- Use `logDebug()`, `logInfo()` and `envLog()` for logging (respects `LOGLEVEL`)
- Prefer gated logging flags: `LOG_LLM_REQUEST`, `LOG_LLM_RESPONSE`, `LOG_TOOL_REQUEST`, `LOG_TOOL_RESPONSE`

### Commit Message Guidelines

- Use present tense ("Add feature" not "Added feature")
- Keep first line under 72 characters
- Reference issues when applicable (#123)

Examples:
```
Add support for Claude API
Fix SSE parsing for tool results
Update README with installation steps
```

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/PDL-kaushal/spockchat.git
   cd spockchat
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   cp spockchat-mcp-config.example.json ~/.spockchat/spockchat-mcp-config.json
   # Edit both files with your settings
   ```

   **Note:** Config files are stored in `~/.spockchat/` directory. The application will automatically create this directory on first run.

4. Run in development mode:
   ```bash
   npm run dev
   ```

5. Access at `http://localhost:5050`

## Project Structure

```
spockchat/
├── server.js              # Express backend with LLM & MCP integration
├── public/
│   ├── index.html        # Main UI
│   ├── app.js            # Frontend logic
│   ├── styles.css        # Styling
│   └── renderer.global.js # Markdown rendering
├── .env                  # Environment config (not in git)
└── package.json

~/.spockchat/              # User config directory (created automatically)
├── spockchat-mcp-config.json # MCP servers config
└── ui-settings.json      # UI preferences
```

## Testing

Before submitting a PR:
- Test with different LOGLEVEL settings (error, info, debug)
- Verify both Azure and OpenAI configurations work
- Test MCP tool execution if applicable
- Check console for errors

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to open an issue for questions or reach out to maintainers.

Thank you for contributing! 🎉
