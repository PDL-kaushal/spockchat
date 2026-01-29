const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const CONFIG_FILE = path.join(__dirname, 'spockchat-mcp-config.json');
const UI_SETTINGS_FILE = path.join(__dirname, 'ui-settings.json');

// Log level control via environment variable
const LOGLEVEL = process.env.LOGLEVEL || 'error'; // 'error', 'info', 'debug'
const logLevels = { error: 0, info: 1, debug: 2 };
const currentLogLevel = logLevels[LOGLEVEL.toLowerCase()] || 0;

// Create log file for debug mode
// Control file logging with env var: LOG_TO_FILE=true|1
// Optional: LOGFILE_DIR (directory) and LOGFILE_NAME (filename)
let debugLogStream = null;
const _envLogToFile = (process.env.LOG_TO_FILE || '').toLowerCase();
const _enableFileLog = (currentLogLevel >= logLevels.debug) && (_envLogToFile === 'true' || _envLogToFile === '1');
if (_enableFileLog) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, '_').split('.')[0];
  const defaultName = `spockchat-debug-${timestamp}.log`;
  const logDir = process.env.LOGFILE_DIR ? path.resolve(process.env.LOGFILE_DIR) : __dirname;
  const logFileName = process.env.LOGFILE_NAME || defaultName;
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  } catch (e) {
    // ignore mkdir errors, fallback to current dir
  }
  const logFilePath = path.join(logDir, logFileName);
  try {
    debugLogStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    console.log(`[DEBUG] Logging to file: ${logFilePath}`);
  } catch (e) {
    console.error('[DEBUG] Failed to open debug log file:', e.message);
    debugLogStream = null;
  }
} else if (currentLogLevel >= logLevels.debug) {
  // Informative note when debug level set but file logging disabled by env
  console.log('[DEBUG] Debug logging enabled; set LOG_TO_FILE=true to write to debug file.');
}

// Conditional logging helpers
function logDebug(...args) {
  if (currentLogLevel >= logLevels.debug) {
    const message = '[DEBUG] ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    console.log(message);
    if (debugLogStream) {
      debugLogStream.write(`${new Date().toISOString()} ${message}\n`);
    }
  }
}

function logInfo(...args) {
  if (currentLogLevel >= logLevels.info) console.log('[INFO]', ...args);
}

// Per-event logging flags (defaults to false if not present in env)
const LOG_TOOL_REQUEST = ((process.env.LOG_TOOL_REQUEST || '').toLowerCase() === 'true' || (process.env.LOG_TOOL_REQUEST || '') === '1');
const LOG_TOOL_RESPONSE = ((process.env.LOG_TOOL_RESPONSE || '').toLowerCase() === 'true' || (process.env.LOG_TOOL_RESPONSE || '') === '1');
const LOG_LLM_REQUEST = ((process.env.LOG_LLM_REQUEST || '').toLowerCase() === 'true' || (process.env.LOG_LLM_REQUEST || '') === '1');
const LOG_LLM_RESPONSE = ((process.env.LOG_LLM_RESPONSE || '').toLowerCase() === 'true' || (process.env.LOG_LLM_RESPONSE || '') === '1');

// Helper: conditional logging to console and optionally to debug file (if enabled)
function envLog(flag, ...args) {
  if (!flag) return;
  const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' ');
  try {
    console.log(message);
  } catch (e) {
    // ignore console failures
  }
  // Also write to debug file only if the file stream exists (i.e., LOG_TO_FILE + debug level enabled)
  if (debugLogStream) {
    try {
      debugLogStream.write(`${new Date().toISOString()} ${message}\n`);
    } catch (e) {
      // ignore file write errors
    }
  }
}

// Load config from file if it exists
let config = {
  model: { type: 'mock' },
  mcpServers: [] // Array of { name, httpUrl, stdioCmd }
};

// Store MCP initialization results
let mcpInitResults = [];

// Store tool-to-server mapping { toolName: { url, serverName } }
let toolServerMap = {};
// Store per-server session IDs for MCP HTTP servers
let mcpServerSessions = {};
// Store per-server cookies for session persistence
let mcpServerCookies = {};

let uiSettings = {
  theme: 'auto',
  sidebarCollapsed: true,
  fullWidth: false,
  inputExpanded: true
};

// First try to load from config file (fallback)
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    // Only use saved config, ignore any old mcp field
    if (saved.model) config.model = saved.model;
    if (saved.mcpServers) config.mcpServers = saved.mcpServers;
  }
} catch (e) {
  // Ignore errors loading config
}

// Load UI settings separately
try {
  if (fs.existsSync(UI_SETTINGS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(UI_SETTINGS_FILE, 'utf8'));
    uiSettings = { ...uiSettings, ...saved };
  }
} catch (e) {
  // Ignore errors loading UI settings
}

// Then load from .env file (highest priority - overrides config file)
if (process.env.MODEL_TYPE) {
  config.model.type = process.env.MODEL_TYPE;
}
if (process.env.MODEL_API_KEY) {
  config.model.apiKey = process.env.MODEL_API_KEY;
}
if (process.env.MODEL_NAME) {
  config.model.model = process.env.MODEL_NAME;
}
if (process.env.MODEL_API_BASE) {
  config.model.apiBase = process.env.MODEL_API_BASE;
}
if (process.env.MCP_HTTP_URL || process.env.MCP_STDIO_CMD) {
  // If env vars exist, create/update first server in array
  if (!config.mcpServers) config.mcpServers = [];
  if (config.mcpServers.length === 0) {
    config.mcpServers.push({
      name: 'Default MCP Server',
      httpUrl: process.env.MCP_HTTP_URL || '',
      stdioCmd: process.env.MCP_STDIO_CMD || ''
    });
  } else {
    if (process.env.MCP_HTTP_URL) config.mcpServers[0].httpUrl = process.env.MCP_HTTP_URL;
    if (process.env.MCP_STDIO_CMD) config.mcpServers[0].stdioCmd = process.env.MCP_STDIO_CMD;
  }
}

app.get('/api/config', (req, res) => {
  // Return full config including API key
  const safeConfig = {
    model: { 
      type: config.model.type,
      model: config.model.model,
      apiBase: config.model.apiBase,
      apiKey: config.model.apiKey || ''
    },
    mcpServers: config.mcpServers || [],
    ui: uiSettings
  };
  res.json(safeConfig);
});

// Get UI settings only
app.get('/ui-settings', (req, res) => {
  res.json(uiSettings);
});

// Update UI settings only
app.post('/ui-settings', (req, res) => {
  const body = req.body || {};
  uiSettings = { ...uiSettings, ...body };
  try {
    fs.writeFileSync(UI_SETTINGS_FILE, JSON.stringify(uiSettings, null, 2), 'utf8');
    res.json({ ok: true, settings: uiSettings });
  } catch (e) {
    console.error('Failed to save UI settings:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get MCP initialization results
app.get('/api/mcp/init-status', (req, res) => {
  res.json({ results: mcpInitResults });
});

app.post('/api/config', (req, res) => {
  const body = req.body || {};
  
  // Separate UI settings from API config
  if (body.ui) {
    uiSettings = { ...uiSettings, ...body.ui };
    try {
      fs.writeFileSync(UI_SETTINGS_FILE, JSON.stringify(uiSettings, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save UI settings:', e.message);
    }
    delete body.ui; // Remove from config object
  }
  
  // Save API config
  config = { ...config, ...body };
  // Remove old mcp field if it exists
  delete config.mcp;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save config:', e.message);
  }
  
  res.json({ ok: true, config, ui: uiSettings });
});

// Reload MCP tools endpoint
app.post('/api/mcp/reload', async (req, res) => {
  try {
    const results = await loadAllMcpTools();
    const totalTools = Object.keys(toolServerMap).length;
    const failedServers = results.filter(r => !r.success);
    const successfulServers = results.filter(r => r.success);
    
    if (failedServers.length > 0) {
      const failedNames = failedServers.map(r => r.serverName).join(', ');
      res.json({ 
        success: false, 
        toolCount: totalTools,
        message: `Loaded ${totalTools} tools, but ${failedServers.length} server(s) failed: ${failedNames}`,
        results,
        successfulServers,
        failedServers
      });
    } else {
      res.json({ 
        success: true, 
        toolCount: totalTools, 
        message: `Successfully loaded ${totalTools} tools from ${results.length} server(s)`,
        results,
        successfulServers,
        failedServers: []
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List MCP tools endpoint
app.get('/api/mcp/tools', async (req, res) => {
  try {
    if (!config.mcpServers || config.mcpServers.length === 0) {
      return res.json({ success: false, error: 'No MCP servers configured', tools: [] });
    }
    
    // Aggregate tools from all servers
    const allTools = [];
    const serverResults = [];
    
    for (const server of config.mcpServers) {
      if (!server.httpUrl) continue;
      
      try {
        const apiKey = getMcpServerApiKey(server.name);
        const mcpTools = await callMcpHttp(server.httpUrl, 'tools/list', {}, apiKey);
        if (mcpTools && mcpTools.tools && Array.isArray(mcpTools.tools)) {
          // Add server name to each tool for identification
          const toolsWithServer = mcpTools.tools.map(tool => ({
            ...tool,
            serverName: server.name
          }));
          allTools.push(...toolsWithServer);
          serverResults.push({ serverName: server.name, success: true, toolCount: mcpTools.tools.length });
        }
      } catch (err) {
        serverResults.push({ serverName: server.name, success: false, error: err.message });
      }
    }
    
    res.json({ success: true, tools: allTools, serverResults });
  } catch (err) {
    res.json({ success: false, error: err.message, tools: [] });
  }
});

// Test MCP endpoint
app.post('/api/mcp/test', async (req, res) => {
  const { method, params, serverName } = req.body || {};
  try {
    let serverUrl;
    if (serverName) {
      const server = config.mcpServers?.find(s => s.name === serverName);
      if (!server) {
        return res.status(400).json({ success: false, error: `Server '${serverName}' not found` });
      }
      serverUrl = server.httpUrl;
    } else if (config.mcpServers && config.mcpServers.length > 0) {
      serverUrl = config.mcpServers[0].httpUrl;
      serverName = config.mcpServers[0].name;
    }
    
    if (!serverUrl) {
      return res.status(400).json({ success: false, error: 'No MCP server URL available' });
    }
    
    const apiKey = getMcpServerApiKey(serverName);
    const result = await callMcpHttp(serverUrl, method || 'tools/list', params || {}, apiKey);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SSE chat endpoint: accepts { prompt, messages }
app.post('/api/chat', async (req, res) => {
  const { prompt, messages } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'missing prompt' });

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  try {
    // Stream directly from model API with conversation history
    console.log('New chat request received');
    console.log(req.body);
    await streamFromModel(prompt, res, messages || []);
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    res.end();
  }
});

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function streamFromModel(prompt, res, conversationHistory = []) {
  // Handle mock model
  if (!config.model || config.model.type === 'mock') {
    const mockResp = `Echo (mock model): ${prompt}`;
    res.write(`data: ${mockResp}\n\n`);
    res.write('event: done\ndata: {}\n\n');
    res.end();
    return;
  }

  if (config.model.type === 'openai' || config.model.type === 'azure') {
    const fetch = global.fetch || (await import('node-fetch')).default;
    const apiKey = config.model.apiKey;
    const modelName = config.model.model || 'gpt-4o';
    const apiBase = config.model.apiBase || 'https://api.openai.com/v1';

    if (!apiKey) throw new Error('API key not configured');

    // Get MCP tools if configured
    let tools = null;
    if (config.mcpServers && config.mcpServers.length > 0) {
      try {
        // Aggregate tools from all servers
        const allMcpTools = [];
        for (const server of config.mcpServers) {
          if (!server.httpUrl) continue;
          try {
            const apiKey = getMcpServerApiKey(server.name);
            const mcpTools = await callMcpHttp(server.httpUrl, 'tools/list', {}, apiKey);
            if (mcpTools && mcpTools.tools && Array.isArray(mcpTools.tools)) {
              allMcpTools.push(...mcpTools.tools);
            }
          } catch (e) {
            console.log(e);
            // Continue with other servers if one fails
          }
        }
        
        if (allMcpTools.length > 0) {
          // Convert MCP tool format to OpenAI/Azure format
          tools = allMcpTools.map(tool => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description || '',
              parameters: tool.inputSchema || { type: 'object', properties: {} }
            }
          }));
        }
      } catch (e) {
        // MCP tool loading failed silently
      }
    }

    const headers = {
      'Content-Type': 'application/json'
    };
    
    // System message with formatting instructions
    const systemMessage = { 
      role: 'system', 
      content: 'You are a helpful assistant. When you receive tool results, format them in a clear, human-readable way using proper markdown.\n\nIMPORTANT - For tabular data, you MUST use this exact markdown table format:\n\n| Column1 | Column2 | Column3 |\n|---------|---------|----------|\n| Value1  | Value2  | Value3  |\n\nEach cell must be separated by pipes (|) with spaces, and the header row must be followed by a separator row with dashes.\n\nOther formatting rules:\n- Use bullet points (- or *) for lists\n- Use ```language code blocks for code or JSON\n- Use # ## ### for headers\n- Always explain what the tool did before showing results\n- Present data in an organized, visually appealing manner'
    };
    
    // Build messages array - always include system message and the current prompt
    let messages;
    if (conversationHistory.length > 0) {
      // Ensure a single system message is at the start
      if (conversationHistory[0]?.role === 'system') {
        messages = [...conversationHistory];
      } else {
        messages = [systemMessage, ...conversationHistory];
      }
      // Append the current user prompt if it's not already the last user message
      const last = messages[messages.length - 1];
      if (!(last && last.role === 'user' && last.content === prompt)) {
        messages.push({ role: 'user', content: prompt });
      }
    } else {
      messages = [systemMessage, { role: 'user', content: prompt }];
    }
    
    let endpoint, requestBody;
    
    if (config.model.type === 'azure') {
      headers['api-key'] = apiKey;
      endpoint = apiBase;
      requestBody = { 
        messages: messages, 
        max_tokens: 4096,
        stream: true
      };
      if (tools && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto';
      }
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
      endpoint = `${apiBase}/chat/completions`;
      requestBody = { 
        model: modelName, 
        messages: messages, 
        max_tokens: 4096,
        stream: true
      };
      if (tools && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto';
      }
    }

    envLog(LOG_LLM_REQUEST, '\n🤖 LLM Request:');
    envLog(LOG_LLM_REQUEST, 'Messages:', JSON.stringify(messages.slice(-3), null, 2));
    if (tools) envLog(LOG_LLM_REQUEST, 'Tools available:', tools.length);
    // Log the full request body to debug log so we can inspect parameters and tools
    try {
      envLog(LOG_LLM_REQUEST, 'Request body:', JSON.stringify(requestBody, null, 2));
    } catch (e) {
      envLog(LOG_LLM_REQUEST, 'Request body: <unserializable>');
    }
    envLog(LOG_LLM_REQUEST, '─'.repeat(80));

    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!apiRes.ok) {
      const txt = await apiRes.text();
      console.error('API Error:', apiRes.status, txt);
      throw new Error(`Model API error: ${apiRes.status} ${txt}`);
    }

    // Stream the response and collect tool calls
    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let toolCalls = [];
    let currentToolCall = null;
    let assistantMessage = '';
    envLog(LOG_LLM_RESPONSE, '\n📨 LLM Streaming Response:');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            
            // Handle content (collect for final logging; do NOT print per-delta to server console)
            if (delta?.content) {
              assistantMessage += delta.content;
              res.write(`data: ${JSON.stringify(delta.content)}\n\n`);
            }
            
            // Handle tool calls
            if (delta?.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                const index = toolCall.index;
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    id: toolCall.id || `call_${index}`,
                    type: 'function',
                    function: { name: '', arguments: '' }
                  };
                }
                
                if (toolCall.function?.name) {
                  toolCalls[index].function.name += toolCall.function.name;
                }
                if (toolCall.function?.arguments) {
                  toolCalls[index].function.arguments += toolCall.function.arguments;
                }
              }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    // If there are tool calls, execute them and continue conversation
    if (toolCalls.length > 0) {
      envLog(LOG_TOOL_REQUEST, '\n\n🔧 Tool Calls Detected:', toolCalls.length);
      envLog(LOG_TOOL_REQUEST, '─'.repeat(80));
      
      // Build new conversation history
      const newMessages = [...messages];
      newMessages.push({
        role: 'assistant',
        content: assistantMessage || null,
        tool_calls: toolCalls
      });
      
      // Execute each tool call
      for (const toolCall of toolCalls) {
        try {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments || '{}');
          
          envLog(LOG_TOOL_REQUEST, `\n🔧 Tool Call: ${functionName}`);
          envLog(LOG_TOOL_REQUEST, '📥 Arguments:', JSON.stringify(functionArgs, null, 2));
          
          // Send tool call event as a special event type
          res.write(`event: toolcall\ndata: ${JSON.stringify({ 
            name: functionName, 
            arguments: functionArgs,
            id: toolCall.id,
            timestamp: Date.now()
          })}\n\n`);
          
          // Find which server has this tool
          const serverInfo = toolServerMap[functionName];
          if (!serverInfo) {
            throw new Error(`No server found for tool: ${functionName}`);
          }
          
          const apiKey = getMcpServerApiKey(serverInfo.serverName);
          
          // Call MCP server
          const toolResult = await callMcpHttp(serverInfo.url, 'tools/call', {
            name: functionName,
            arguments: functionArgs
          }, apiKey);
          
          envLog(LOG_TOOL_RESPONSE, '📤 Tool Result:', JSON.stringify(toolResult, null, 2));
          envLog(LOG_TOOL_RESPONSE, '─'.repeat(80));
          
          // Truncate large tool results to prevent transport failures
          const MAX_TOOL_RESULT_SIZE = 50000; // 50KB limit
          let toolResultForLLM = toolResult;
          let toolResultForUI = toolResult;
          const resultString = JSON.stringify(toolResult);
          
          if (resultString.length > MAX_TOOL_RESULT_SIZE) {
            const truncated = resultString.substring(0, MAX_TOOL_RESULT_SIZE);
            const truncatedObj = {
              _truncated: true,
              _originalSize: resultString.length,
              _truncatedSize: MAX_TOOL_RESULT_SIZE,
              _message: "Result was truncated due to size. Showing first 50KB.",
              data: truncated + "... [TRUNCATED]"
            };
            toolResultForLLM = truncatedObj;
            toolResultForUI = {
              _truncated: true,
              _originalSize: resultString.length,
              _message: "Result too large to display. Check debug logs for full output."
            };
            envLog(LOG_TOOL_RESPONSE, `⚠️  Tool result truncated: ${resultString.length} bytes -> ${MAX_TOOL_RESULT_SIZE} bytes`);
          }
          
          // Send tool result event back to UI
          res.write(`event: toolresult\ndata: ${JSON.stringify({ 
            name: functionName,
            result: toolResultForUI,
            id: toolCall.id,
            timestamp: Date.now()
          })}\n\n`);
          
          // Add tool response to conversation
          newMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResultForLLM)
          });
        } catch (e) {
          console.error('Tool call error:', e);
          const serverInfo = toolServerMap[toolCall.function.name];
          const errorMsg = serverInfo 
            ? `Error calling tool on MCP server "${serverInfo.serverName}": ${e.message}`
            : `Error calling tool: ${e.message}`;
          newMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: errorMsg })
          });
        }
      }
      
      // Make another request with tool results (non-streaming for simplicity)
      res.write(`data: ${JSON.stringify('\n\n')}\n\n`);
      
      const followUpBody = {
        messages: newMessages,
        max_tokens: 4096,
        stream: true
      };
      if (config.model.type === 'azure') {
        // Don't include tools in follow-up to avoid infinite loops
      } else {
        followUpBody.model = modelName;
      }
      
      const followUpRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(followUpBody)
      });
      
      if (followUpRes.ok) {
        logInfo('\n📨 LLM Follow-up Response (after tool execution):');
        const followReader = followUpRes.body.getReader();
        let followBuffer = '';
        // collect follow-up assistant content for logging
        let followUpAssistantContent = '';
        
        while (true) {
          const { done, value } = await followReader.read();
          if (done) break;
          
          followBuffer += decoder.decode(value, { stream: true });
          const followLines = followBuffer.split('\n');
          followBuffer = followLines.pop();
          
          for (const line of followLines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  // append to both streaming output and follow-up content collector
                  followUpAssistantContent += content;
                  assistantMessage += content;
                  res.write(`data: ${JSON.stringify(content)}\n\n`);
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
        envLog(LOG_LLM_RESPONSE, '\n' + '─'.repeat(80));
        // Log the follow-up assistant content and any tool results
        try {
          envLog(LOG_LLM_RESPONSE, 'LLM Follow-up assistant content:', JSON.stringify(followUpAssistantContent, null, 2));
        } catch (e) {
          envLog(LOG_LLM_RESPONSE, 'LLM Follow-up assistant content: <unserializable>');
        }
      }
    } else {
      envLog(LOG_LLM_RESPONSE, '\n' + '─'.repeat(80));
    }

    // // Log the final assistant message and tool calls to debug log
    // try {
    //   envLog(LOG_LLM_RESPONSE, 'LLM Assistant full message:', JSON.stringify(assistantMessage, null, 2));
    // } catch (e) {
    //   envLog(LOG_LLM_RESPONSE, 'LLM Assistant full message: <unserializable>');
    // }
    // try {
    //   envLog(LOG_TOOL_RESPONSE, 'LLM Tool calls (raw):', JSON.stringify(toolCalls || [], null, 2));
    // } catch (e) {
    //   envLog(LOG_TOOL_RESPONSE, 'LLM Tool calls: <unserializable>');
    // }

    res.write('event: done\ndata: {}\n\n');
    res.end();
  }
}

// Helper to get API key for MCP server from environment
function getMcpServerApiKey(serverName) {
  if (!serverName) return null;
  // Convert server name to env var format: "my_server" -> "MCP_MY_SERVER_API_KEY"
  const envVarName = `MCP_${serverName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
  return process.env[envVarName] || null;
}

async function callModel(prompt) {
  // Minimal adapter: supports `mock` and an OpenAI-compatible API (via config.model)
  if (!config.model || config.model.type === 'mock') {
    // Simple mock behaviour: if prompt contains `call_tool:` phrase, return JSON instructing a tool call
    if (prompt.includes('call_tool:')) {
      // Example instructing a tool
      return JSON.stringify({ tool_call: { method: 'example.echo', params: { echo: 'Hello from tool' } } });
    }
    return `Echo (mock model): ${prompt}`;
  }

  if (config.model.type === 'openai' || config.model.type === 'azure') {
    const fetch = global.fetch || (await import('node-fetch')).default;
    const apiKey = config.model.apiKey;
    const modelName = config.model.model || 'gpt-4o';
    const apiBase = config.model.apiBase || 'https://api.openai.com/v1';

    if (!apiKey) throw new Error('API key not configured');

    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Determine endpoint and request body based on API type
    let endpoint, requestBody;
    
    if (config.model.type === 'azure') {
      // Azure OpenAI uses api-key header
      headers['api-key'] = apiKey;
      // For Azure, apiBase should be the full URL including deployment and api-version
      // e.g., https://xxx.cognitiveservices.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-05-01-preview
      endpoint = apiBase;
      requestBody = { messages: [{ role: 'user', content: prompt }], max_tokens: 4096 };
    } else {
      // OpenAI uses standard chat completions
      headers['Authorization'] = `Bearer ${apiKey}`;
      endpoint = `${apiBase}/chat/completions`;
      requestBody = { model: modelName, messages: [{ role: 'user', content: prompt }], max_tokens: 4096 };
    }

    try {
      envLog(LOG_LLM_REQUEST, 'callModel - endpoint:', endpoint);
      envLog(LOG_LLM_REQUEST, 'callModel - request body:', JSON.stringify(requestBody, null, 2));
    } catch (e) {
      envLog(LOG_LLM_REQUEST, 'callModel - request body: <unserializable>');
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    

    if (!res.ok) {
      const txt = await res.text();
      console.error('API Error:', res.status, txt);
      throw new Error(`Model API error: ${res.status} ${txt}`);
    }
    const data = await res.json();
    
    // Both Azure and OpenAI use same response format for chat completions
    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || 
                  JSON.stringify(data);
    try {
      envLog(LOG_LLM_RESPONSE, 'callModel - raw response:', JSON.stringify(data, null, 2));
      envLog(LOG_LLM_RESPONSE, 'callModel - reply extracted:', JSON.stringify(reply, null, 2));
    } catch (e) {
      envLog(LOG_LLM_RESPONSE, 'callModel - response: <unserializable>');
    }
    
    // Note: This non-streaming path is deprecated
    
    return reply;
  }

  // Unknown model type
  throw new Error('Unsupported model type');
}

async function callMcpHttp(serverUrl, method, params, apiKey = null) {
  const fetch = global.fetch || (await import('node-fetch')).default;
  if (!serverUrl) throw new Error('MCP HTTP URL not provided');
  const req = { jsonrpc: '2.0', id: 1, method, params: params || {} };
  // Ensure we have a session for methods other than session creation
  if (!mcpServerSessions[serverUrl] && !/^session\/(create|start)$/i.test(method)) {
    await ensureMcpSession(fetch, serverUrl, apiKey);
  }

  // If a session exists, attach it via header and request params
  const sid = mcpServerSessions[serverUrl];
  if (sid && !/^session\/(create|start)$/i.test(method)) {
    req.params = {
      ...(params || {}),
      sessionId: (params && params.sessionId) ? params.sessionId : sid,
      session_id: (params && params.session_id) ? params.session_id : sid
    };
  }

  const headers = {
    'Content-Type': 'application/json',
    // Some MCP servers require clients to advertise support for both JSON and SSE
    'Accept': 'application/json; charset=utf-8, text/event-stream',
    ...(sid ? {
      'Mcp-Session-Id': sid,
      'X-Session-Id': sid,
      'X-Session': sid,
      'X-MCP-Session-Id': sid,
      'Cookie': mcpServerCookies[serverUrl] || `sessionId=${sid}`
    } : {})
  };

  // Add API key header if provided
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }

  let res = await fetch(serverUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(req)
  });
  // Retry with broader Accept header if server enforces negotiation (406)
  if (res.status === 406) {
    const retryHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json; q=0.9, text/event-stream; q=0.8, */*; q=0.1',
      ...(sid ? {
        'Mcp-Session-Id': sid,
        'X-Session-Id': sid,
        'X-Session': sid,
        'X-MCP-Session-Id': sid,
        'Cookie': mcpServerCookies[serverUrl] || `sessionId=${sid}`
      } : {})
    };
    if (apiKey) {
      retryHeaders['Authorization'] = `Bearer ${apiKey}`;
      retryHeaders['X-API-Key'] = apiKey;
    }
    res = await fetch(serverUrl, {
      method: 'POST',
      headers: retryHeaders,
      body: JSON.stringify(req)
    });
  }
  // If server complains about missing session, create one and retry once
  if (res.status === 400) {
    const text = await res.text();
    if (/Missing\s+session\s+ID/i.test(text)) {
      await ensureMcpSession(fetch, serverUrl, apiKey);
      const newSid = mcpServerSessions[serverUrl];
      const retryReq = { jsonrpc: '2.0', id: 1, method, params: { ...(params || {}), sessionId: newSid } };
      const retryHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json; charset=utf-8, text/event-stream',
        'Mcp-Session-Id': newSid,
        'X-Session-Id': newSid,
        'X-Session': newSid,
        'X-MCP-Session-Id': newSid,
        'Cookie': mcpServerCookies[serverUrl] || `sessionId=${newSid}`
      };
      if (apiKey) {
        retryHeaders['Authorization'] = `Bearer ${apiKey}`;
        retryHeaders['X-API-Key'] = apiKey;
      }
      res = await fetch(serverUrl, {
        method: 'POST',
        headers: retryHeaders,
        body: JSON.stringify(retryReq)
      });
    } else {
      // put the body back for standard error path below
      return Promise.reject(new Error(`MCP HTTP error: ${res.status} ${text}`));
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MCP HTTP error: ${res.status} ${text}`);
  }
  const contentType = res.headers?.get?.('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    const text = await res.text();
    const dataLine = text.split('\n').find(line => line.startsWith('data: '));
    if (!dataLine) {
      throw new Error(`MCP HTTP error: ${res.status} ${text}`);
    }
    const jsonData = dataLine.slice(6);
    const data = JSON.parse(jsonData);
    return data.result || data.error || data;
  }
  try {
    const data = await res.json();
    return data.result || data.error || data;
  } catch (e) {
    const text = await res.text();
    const dataLine = text.split('\n').find(line => line.startsWith('data: '));
    if (!dataLine) throw e;
    const jsonData = dataLine.slice(6);
    const data = JSON.parse(jsonData);
    return data.result || data.error || data;
  }
}

// Ensure a session exists for the given server; tries common method names
async function ensureMcpSession(fetch, serverUrl, apiKey = null) {
  if (mcpServerSessions[serverUrl]) return mcpServerSessions[serverUrl];
  const methodsToTry = ['session/create', 'session/start', 'sessions/create'];
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json; charset=utf-8, text/event-stream'
  };
  
  // Add API key header if provided
  if (apiKey) {
    baseHeaders['Authorization'] = `Bearer ${apiKey}`;
    baseHeaders['X-API-Key'] = apiKey;
  }
  
  // First try MCP initialize -> notifications/initialized (FastMCP streamable-http)
  try {
    const initReq = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'SpockChat', version: '0.1.0' }
      }
    };
    const initRes = await fetch(serverUrl, { method: 'POST', headers: baseHeaders, body: JSON.stringify(initReq) });
    const headerSid = initRes.headers?.get?.('mcp-session-id') || initRes.headers?.get?.('Mcp-Session-Id');
    const setCookie = initRes.headers?.get?.('set-cookie');
    if (setCookie) {
      mcpServerCookies[serverUrl] = setCookie.split(';')[0];
    }
    let bodySid;
    try {
      const data = await initRes.json();
      const result = data?.result || data;
      bodySid = result?.sessionId || result?.session_id || result?.id || result?.sessionID;
    } catch (e) {
      bodySid = undefined;
    }
    const sid = headerSid || bodySid;
    if (sid) {
      mcpServerSessions[serverUrl] = sid;
      const notifyReq = { jsonrpc: '2.0', method: 'notifications/initialized' };
      await fetch(serverUrl, {
        method: 'POST',
        headers: {
          ...baseHeaders,
          'Mcp-Session-Id': sid,
          'X-Session-Id': sid,
          'X-MCP-Session-Id': sid,
          ...(mcpServerCookies[serverUrl] ? { 'Cookie': mcpServerCookies[serverUrl] } : {})
        },
        body: JSON.stringify(notifyReq)
      });
      return sid;
    }
  } catch (e) {
    // fall through to other strategies
  }
  for (const m of methodsToTry) {
    try {
      const req = { jsonrpc: '2.0', id: 1, method: m, params: { clientInfo: { name: 'SpockChat', version: '0.1.0' } } };
      const res = await fetch(serverUrl, { method: 'POST', headers: baseHeaders, body: JSON.stringify(req) });
      if (!res.ok) continue;
      const data = await res.json();
      const result = data.result || data;
      const sid = result.sessionId || result.session_id || result.id || result.sessionID;
      if (sid) {
        mcpServerSessions[serverUrl] = sid;
        return sid;
      }
    } catch (e) {
      // try next method name
    }
  }
  // Fallback: generate a client-side session ID if server expects one from client
  try {
    const { randomUUID } = require('crypto');
    const sid = randomUUID();
    mcpServerSessions[serverUrl] = sid;
    return sid;
  } catch (e) {
    // If crypto not available, a timestamp-based ID
    const sid = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    mcpServerSessions[serverUrl] = sid;
    return sid;
  }
}

// Load all MCP tools and build tool-to-server mapping
async function loadAllMcpTools() {
  toolServerMap = {};
  const results = [];
  
  if (!config.mcpServers || config.mcpServers.length === 0) {
    return results;
  }
  
  for (const server of config.mcpServers) {
    if (!server.httpUrl) {
      results.push({
        serverName: server.name,
        success: false,
        error: 'No HTTP URL configured'
      });
      continue;
    }
    
    try {
      const apiKey = getMcpServerApiKey(server.name);
      const mcpTools = await callMcpHttp(server.httpUrl, 'tools/list', {}, apiKey);
      if (mcpTools && mcpTools.tools && Array.isArray(mcpTools.tools)) {
        // Map each tool to its server URL and name
        for (const tool of mcpTools.tools) {
          toolServerMap[tool.name] = { url: server.httpUrl, serverName: server.name };
        }
        results.push({
          serverName: server.name,
          success: true,
          toolCount: mcpTools.tools.length,
          url: server.httpUrl
        });
      } else {
        results.push({
          serverName: server.name,
          success: false,
          error: 'Invalid response from server',
          url: server.httpUrl
        });
      }
    } catch (err) {
      results.push({
        serverName: server.name,
        success: false,
        error: err.message,
        url: server.httpUrl
      });
    }
  }
  
  return results;
}

function callMcpStdio(method, params) {
  return new Promise((resolve, reject) => {
    const cmdline = config.mcp.stdioCmd;
    if (!cmdline) return reject(new Error('MCP stdio command not configured'));
    const parts = cmdline.split(' ').filter(Boolean);
    const cmd = parts[0];
    const args = parts.slice(1);
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });

    const req = { jsonrpc: '2.0', id: 1, method, params: params || {} };
    let out = '';
    child.stdout.on('data', (b) => {
      out += b.toString();
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      try {
        const parsed = JSON.parse(out);
        resolve(parsed.result || parsed.error || parsed);
      } catch (e) {
        resolve(out);
      }
    });

    child.stdin.write(JSON.stringify(req) + '\n');
    child.stdin.end();
  });
}

const port = process.env.PORT || 5050;
app.listen(port, async () => {
  logInfo('');
  logInfo('--------------------------------------------------------');
  logInfo(`SpockChat server listening on http://localhost:${port}`);

  
  // Initialize MCP tools on startup only if servers are configured
  if (config.mcpServers && config.mcpServers.length > 0) {
    // Check if any server has a valid URL
    const hasValidServer = config.mcpServers.some(s => s.httpUrl || s.stdioCmd);
    
    if (hasValidServer) {
      logInfo('Loading MCP tools from configured servers...');
      mcpInitResults = await loadAllMcpTools();
      
      const successCount = mcpInitResults.filter(r => r.success).length;
      const failCount = mcpInitResults.filter(r => !r.success).length;
      const totalTools = Object.keys(toolServerMap).length;
      
      logInfo(`MCP Initialization: ${successCount} succeeded, ${failCount} failed, ${totalTools} tools loaded`);
      
      if (failCount > 0) {
        logInfo('Failed servers:');
        mcpInitResults.filter(r => !r.success).forEach(r => {
          logInfo(`  - ${r.serverName}: ${r.error}`);
        });
      }
    } else {
      logInfo('No MCP servers with valid URLs configured. Skipping MCP initialization.');
    }
  } else {
    logInfo('No MCP servers configured. Skipping MCP initialization.');
  }
});
