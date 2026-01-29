# Security Best Practices for SpockChat

## Overview

SpockChat is designed with security in mind, but proper configuration is essential when deploying or using the application.

## Sensitive Files

The following files contain sensitive information and **MUST NOT** be committed to version control:

### 1. `.env` - Environment Variables
Contains:
- LLM API keys (`MODEL_API_KEY`)
- MCP server API keys (`MCP_*_API_KEY`)
- API endpoints

**Protection:** Already included in `.gitignore`

### 2. `spockchat-mcp-config.json` - MCP Server Configuration
May contain:
- Internal URLs
- Server endpoints
- Infrastructure details

**Protection:** Now included in `.gitignore` ✅

### 3. `ui-settings.json` - User Preferences
Contains:
- User-specific UI settings (theme, layout, accordion states, code wrap)
- Should not be shared across installations

**Protection:** Already included in `.gitignore`

## API Key Management

### LLM API Keys

Configure your LLM provider API key in `.env`:

```bash
MODEL_API_KEY=your-secret-key-here
MODEL_TYPE=azure  # or openai
```

### MCP Server API Keys

If your MCP servers require authentication, add API keys using the naming convention:

```bash
MCP_<SERVER_NAME>_API_KEY=your-mcp-api-key
```

**Convention:**
- Server name from `spockchat-mcp-config.json` is converted to uppercase
- Special characters (`-`, `.`, spaces) are replaced with underscores `_`
- Prefix with `MCP_` and suffix with `_API_KEY`

**Examples:**

| Server Name in Config | Environment Variable |
|----------------------|---------------------|
| `oms_mcp` | `MCP_OMS_MCP_API_KEY` |
| `my-server` | `MCP_MY_SERVER_API_KEY` |
| `inventory.api` | `MCP_INVENTORY_API_API_KEY` |

## How API Keys Are Used

### MCP Server Authentication

When calling MCP servers, SpockChat sends API keys via two headers:
- `Authorization: Bearer <api-key>`
- `X-API-Key: <api-key>`

This dual-header approach ensures compatibility with different authentication schemes.

## Deployment Security

### Development

1. Copy example files:
   ```bash
   cp .env.example .env
   cp spockchat-mcp-config.example.json spockchat-mcp-config.json
   ```

2. **Never commit the actual `.env` or `spockchat-mcp-config.json` files**

3. Use debug logging sparingly:
   ```bash
   LOGLEVEL=error npm start  # Production
   LOGLEVEL=info npm start   # Development
   LOGLEVEL=debug npm start  # Only when debugging
   ```
   Optional flags that can increase data exposure:
   - `LOG_LLM_REQUEST`, `LOG_LLM_RESPONSE`
   - `LOG_TOOL_REQUEST`, `LOG_TOOL_RESPONSE`
   - `LOG_TO_FILE` (writes debug logs to disk)

### Production

1. **HTTPS Required:** Always use HTTPS in production
2. **Environment Variables:** Use secure secret management (e.g., AWS Secrets Manager, Azure Key Vault)
3. **Network Security:** 
   - Restrict MCP server access to trusted networks
   - Use firewall rules
   - Consider VPN or private networking
4. **Logging:** 
   - Set `LOGLEVEL=error` to avoid logging sensitive data
   - Avoid enabling per-event log flags in production
   - Never log API keys or tokens
5. **Access Control:**
   - Add authentication to the Express server
   - Implement rate limiting
   - Consider using reverse proxy (nginx, Caddy)

## Git Security Check

Before committing, verify no secrets are exposed:

```bash
# Check what would be committed
git status

# Verify .gitignore is working
git check-ignore .env spockchat-mcp-config.json ui-settings.json

# Search for potential secrets (should return nothing)
git grep -i "api.key\|password\|secret" -- ':!SECURITY.md' ':!*.example'
```

## Secrets Detection

Consider using tools like:
- [git-secrets](https://github.com/awslabs/git-secrets)
- [truffleHog](https://github.com/trufflesecurity/trufflehog)
- [gitleaks](https://github.com/gitleaks/gitleaks)

## What's Safe to Share

✅ **Safe to commit:**
- `.env.example` - Template with placeholder values
- `spockchat-mcp-config.example.json` - Example configuration
- `SECURITY.md` - This file
- Source code (`server.js`, `public/*`)

❌ **Never commit:**
- `.env` - Contains real API keys
- `spockchat-mcp-config.json` - May contain internal URLs
- `ui-settings.json` - User-specific settings
- Any file with actual credentials

## Incident Response

If you accidentally commit secrets:

1. **Immediately rotate the compromised keys**
2. **Remove from Git history:**
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch .env" \
     --prune-empty --tag-name-filter cat -- --all
   ```
3. **Force push** (⚠️ coordinate with team)
4. **Verify on GitHub/GitLab** that secrets are removed

## Reporting Security Issues

If you discover a security vulnerability, please email the maintainers directly rather than opening a public issue.

## Additional Resources

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [12 Factor App: Config](https://12factor.net/config)

---

Last updated: January 28, 2026
