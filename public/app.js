document.addEventListener('DOMContentLoaded', () => {
  const modelType = document.getElementById('modelType');
  const openaiFields = document.getElementById('openaiFields');
  const apiKey = document.getElementById('apiKey');
  const modelName = document.getElementById('modelName');
  const apiBase = document.getElementById('apiBase');
  const saveConfig = document.getElementById('saveConfig');
  const clearChat = document.getElementById('clearChat');
  const chat = document.getElementById('chat');
  const prompt = document.getElementById('prompt');
  const send = document.getElementById('send');
  const themeSelect = document.getElementById('themeSelect');
  const themeSegment = document.getElementById('themeSegment');
  const mcpServersList = document.getElementById('mcpServersList');
  const addMcpServer = document.getElementById('addMcpServer');
  const toggleWidth = document.getElementById('toggleWidth');
  const expandIcon = document.getElementById('expandIcon');
  const collapseIcon = document.getElementById('collapseIcon');
  let _segIndicatorInit = false;
  let _isSending = false;
  let _codeWrapEnabled = false; // Default to no wrap

  // Load code wrap preference from UI settings
  async function loadCodeWrapPreference() {
    try {
      const resp = await fetch('/ui-settings');
      if (resp.ok) {
        const settings = await resp.json();
        _codeWrapEnabled = settings.codeWrapEnabled || false;
      }
    } catch (e) {
      console.warn('Failed to load code wrap preference:', e);
    }
  }

  // Save code wrap preference to UI settings
  async function saveCodeWrapPreference(enabled) {
    try {
      const resp = await fetch('/ui-settings');
      const settings = resp.ok ? await resp.json() : {};
      settings.codeWrapEnabled = enabled;
      await fetch('/ui-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      _codeWrapEnabled = enabled;
    } catch (e) {
      console.error('Failed to save code wrap preference:', e);
    }
  }

  // Save chat history to localStorage
  function saveChatHistory() {
    try {
      const history = {
        messages: conversationMessages,
        timestamp: Date.now()
      };
      localStorage.setItem('chatHistory', JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save chat history:', e);
    }
  }

  // Load chat history from localStorage
  function loadChatHistory() {
    try {
      const stored = localStorage.getItem('chatHistory');
      if (!stored) return;
      
      const history = JSON.parse(stored);
      if (!history.messages || !Array.isArray(history.messages)) return;
      
      // Restore conversation messages
      conversationMessages = history.messages;
      
      // Restore chat UI
      chat.innerHTML = '';
      history.messages.forEach(msg => {
        if (msg.role === 'user') {
          appendUserMessage(msg.content);
        } else if (msg.role === 'assistant') {
          const botBubble = createBotMessageContainer();
          renderMarkdownContent(botBubble, msg.content);
        }
      });
      
      console.log('Chat history restored:', history.messages.length, 'messages');
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    }
  }

  // Add wrap toggle buttons to code blocks
  window.addWrapToggleButtons = function(container) {
    const codeBlocks = container.querySelectorAll('pre[data-has-long-lines="true"]');
    codeBlocks.forEach(pre => {
      // Don't add button if already exists
      if (pre.querySelector('.wrap-toggle-btn')) return;
      
      const btn = document.createElement('button');
      btn.className = 'wrap-toggle-btn';
      btn.setAttribute('aria-label', 'Toggle line wrapping');
      btn.title = 'Toggle line wrapping';
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-2m0 0l2-2m-2 2l2 2M4 18h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
      
      // Apply current wrap state
      if (_codeWrapEnabled) {
        pre.classList.add('wrap-enabled');
        btn.classList.add('active');
      }
      
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isWrapped = pre.classList.toggle('wrap-enabled');
        btn.classList.toggle('active', isWrapped);
        
        // Save preference
        await saveCodeWrapPreference(isWrapped);
        
        // Update all code blocks in the chat
        document.querySelectorAll('pre[data-has-long-lines="true"]').forEach(p => {
          if (isWrapped) {
            p.classList.add('wrap-enabled');
            const b = p.querySelector('.wrap-toggle-btn');
            if (b) b.classList.add('active');
          } else {
            p.classList.remove('wrap-enabled');
            const b = p.querySelector('.wrap-toggle-btn');
            if (b) b.classList.remove('active');
          }
        });
      });
      
      pre.appendChild(btn);
    });
  };

  // Lightweight toast notifications
  function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = 'position:fixed; bottom:12px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; gap:8px; align-items:center; z-index:9999';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = 'padding:20px 24px; border-radius:16px; border:1px solid var(--border); background:var(--surface); color:var(--text); box-shadow:0 8px 20px rgba(0,0,0,0.12); font-size:20px; width:640px;';
    if (type === 'success') {
      toast.style.background = 'var(--success-bg, #eafff3)';
      toast.style.color = 'var(--success-fg, #065f46)';
      toast.style.borderColor = 'rgba(6,95,70,0.25)';
    } else if (type === 'error') {
      toast.style.background = 'var(--error-bg, #fee2e2)';
      toast.style.color = 'var(--error-fg, #7f1d1d)';
      toast.style.borderColor = 'rgba(127,29,29,0.25)';
    } else {
      toast.style.background = 'var(--surface)';
    }
    toast.textContent = message;
    container.appendChild(toast);
    // Auto-dismiss after 4s
    setTimeout(() => {
      toast.style.transition = 'opacity .2s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 220);
    }, 4000);
  }
  
  // Conversation history for context
  let conversationMessages = [];
  
  // MCP servers array
  let mcpServers = [];

  // Normalize markdown tables to avoid list-wrapping issues
  const normalizeMarkdownTables = (text) => {
    const lines = text.split('\n');
    const cleaned = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1] || '';

      const isTableHeader = /^\s*(?:[-*+]\s+|\d+\.\s+)?\|/.test(line);
      const isSeparator = /^\s*(?:[-*+]\s+|\d+\.\s+)?\|?\s*[-:| ]{3,}\|?\s*$/.test(nextLine);

      if (isTableHeader && isSeparator) {
        const prev = cleaned[cleaned.length - 1] || '';
        const prevIsList = /^\s*(?:[-*+]|\d+\.)\s+/.test(prev);
        if (prevIsList && prev.trim() !== '') {
          cleaned.push('');
        }

        while (i < lines.length) {
          const tableLine = lines[i];
          if (!/^\s*(?:[-*+]\s+|\d+\.\s+)?\|/.test(tableLine)) break;
          let normalized = tableLine.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)?\|/, '|');
          normalized = normalized.replace(/^\s+/, '');
          cleaned.push(normalized);
          i++;
        }
        i -= 1;
        continue;
      }

      cleaned.push(line);
    }

    return cleaned.join('\n');
  };

  // Render MCP servers list
  function renderMcpServers() {
    mcpServersList.innerHTML = '';
    if (mcpServers.length === 0) {
      mcpServersList.innerHTML = '<div style="color:var(--muted); font-size:13px; padding:8px; text-align:center">No MCP servers configured</div>';
      return;
    }
    
    mcpServers.forEach((server, index) => {
      const serverDiv = document.createElement('div');
      serverDiv.style.cssText = 'border:1px solid var(--border); border-radius:8px; padding:10px; background:var(--surface)';
      serverDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:start; gap:8px; margin-bottom:8px">
          <input type="text" value="${server.name || ''}" placeholder="Server name" 
                 style="flex:1; font-weight:500" data-index="${index}" data-field="name" class="mcp-server-input"/>
          <button class="btn-icon remove-mcp-server" data-index="${index}" title="Remove server" style="color:var(--error)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px">
          <input type="text" value="${server.httpUrl || ''}" placeholder="HTTP URL" 
                 style="font-size:12px" data-index="${index}" data-field="httpUrl" class="mcp-server-input"/>
        </div>
      `;
      mcpServersList.appendChild(serverDiv);
    });
    
    // Add event listeners for inputs
    document.querySelectorAll('.mcp-server-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        mcpServers[index][field] = e.target.value;
        saveCurrentConfig();
      });
    });
    
    // Add event listeners for remove buttons
    document.querySelectorAll('.remove-mcp-server').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        mcpServers.splice(index, 1);
        renderMcpServers();
        saveCurrentConfig();
      });
    });
  }
  
  // Add MCP server
  if (addMcpServer) {
    addMcpServer.addEventListener('click', () => {
      mcpServers.push({ name: 'MCP Server ' + (mcpServers.length + 1), httpUrl: '', stdioCmd: '' });
      renderMcpServers();
      saveCurrentConfig();
    });
  }

  // Load saved config from server
  async function loadConfig() {
    try {
      const res = await fetch('/api/config?t=' + Date.now());
      const data = await res.json();
      
      if (data.model) {
        modelType.value = data.model.type || 'mock';
        if (data.model.model) modelName.value = data.model.model;
        if (data.model.apiBase) apiBase.value = data.model.apiBase;
        // Set API key value after ensuring input is ready
        if (data.model.apiKey) {
          apiKey.value = data.model.apiKey;
        }
      }
      
      // Load MCP servers
      if (data.mcpServers && Array.isArray(data.mcpServers)) {
        mcpServers = data.mcpServers;
      } else {
        mcpServers = [];
      }
      renderMcpServers();
      
      // Load UI settings
      if (data.ui) {
        if (data.ui.theme) {
          applyThemePreference(data.ui.theme, false);
        } else {
          applyThemePreference('auto', false);
        }
        if (data.ui.sidebarCollapsed !== undefined) {
          if (data.ui.sidebarCollapsed) {
            appContainer.classList.add('sidebar-collapsed');
          }
        }
        if (data.ui.fullWidth !== undefined) {
          if (data.ui.fullWidth) {
            appContainer.classList.add('full-width');
          } else {
            appContainer.classList.remove('full-width');
          }
          // Update toggle icons
          if (expandIcon && collapseIcon) {
            const isFull = appContainer.classList.contains('full-width');
            expandIcon.style.display = isFull ? 'none' : 'block';
            collapseIcon.style.display = isFull ? 'block' : 'none';
          }
        }
        if (data.ui.inputExpanded !== undefined) {
          if (data.ui.inputExpanded) {
            prompt.classList.add('expanded');
            prompt.style.height = '200px';
          } else {
            prompt.classList.remove('expanded');
            prompt.style.height = 'auto';
            prompt.style.height = Math.min(prompt.scrollHeight, 200) + 'px';
          }
        }
      }
      // Update UI visibility
      openaiFields.style.display = (modelType.value === 'openai' || modelType.value === 'azure') ? 'block' : 'none';

      // Enable transitions after initial layout is set
      setTimeout(() => {
        appContainer.classList.add('transitions-enabled');
      }, 50);

    } catch (e) {
      console.log('Could not load saved config:', e);
      // Enable transitions even on error
      setTimeout(() => {
        appContainer.classList.add('transitions-enabled');
      }, 50);
    }
    
    // Load MCP initialization status and display in chat
    try {
      const res = await fetch('/api/mcp/init-status');
      const data = await res.json();
      
      if (data.results && data.results.length > 0) {
        const failedServers = data.results.filter(r => !r.success);
        if (failedServers.length > 0) {
          const b = createBotMessageContainer();
          let message = '⚠️ **MCP Server Initialization Issues**\n\n';
          failedServers.forEach(result => {
            message += `❌ **${result.serverName}**\n`;
            message += `   URL: \`${result.url || 'N/A'}\`\n`;
            message += `   Error: ${result.error}\n\n`;
          });
          
          const successServers = data.results.filter(r => r.success);
          if (successServers.length > 0) {
            message += `✅ Successfully connected to ${successServers.length} server(s):\n`;
            successServers.forEach(result => {
              message += `   - ${result.serverName} (${result.toolCount} tools)\n`;
            });
          }
          
          // Render as markdown
          if (typeof marked !== 'undefined') {
            marked.setOptions({ breaks: true, gfm: true });
            b.innerHTML = marked.parse(message);
          } else {
            b.textContent = message;
            b.style.whiteSpace = 'pre-wrap';
          }
        } else if (data.results.length > 0) {
          // All successful
          const b = createBotMessageContainer();
          let message = '✅ **MCP Servers Ready**\n\n';
          data.results.forEach(result => {
            message += `   - ${result.serverName}: ${result.toolCount} tools loaded\n`;
          });
          
          if (typeof marked !== 'undefined') {
            marked.setOptions({ breaks: true, gfm: true });
            b.innerHTML = marked.parse(message);
          } else {
            b.textContent = message;
            b.style.whiteSpace = 'pre-wrap';
          }
        }
      } else {
        // No MCP servers configured or no initialization results
        const b = createBotMessageContainer();
        const message = '👋 Welcome to SpockChat! Your model is ready.\n\nNo MCP servers are currently configured. To give your model access to tools, add MCP servers in the Settings panel.';
        
        if (typeof marked !== 'undefined') {
          marked.setOptions({ breaks: true, gfm: true });
          b.innerHTML = marked.parse(message);
        } else {
          b.textContent = message;
          b.style.whiteSpace = 'pre-wrap';
        }
      }
    } catch (e) {
      console.log('Could not load MCP init status:', e);
    }
  }

  // Load config on startup
  loadConfig();
  
  // Load code wrap preference on startup
  loadCodeWrapPreference();
  
  // Load chat history after a brief delay to ensure renderer is ready
  setTimeout(() => {
    loadChatHistory();
  }, 100);

  // Helper to save current config
  async function saveCurrentConfig() {
    const cfg = {
      model: { type: modelType.value },
      mcpServers: mcpServers,
      ui: {
        sidebarCollapsed: appContainer?.classList.contains('sidebar-collapsed'),
        fullWidth: appContainer?.classList.contains('full-width'),
        inputExpanded: prompt?.classList.contains('expanded')
      }
    };
    // Remove undefined values from ui
    Object.keys(cfg.ui).forEach(key => {
      if (cfg.ui[key] === undefined || cfg.ui[key] === null) {
        delete cfg.ui[key];
      }
    });
    
    if (modelType.value === 'openai' || modelType.value === 'azure') {
      cfg.model.apiKey = apiKey.value;
      cfg.model.model = modelName.value;
      cfg.model.apiBase = apiBase.value;
    }
    try {
      await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }

  // Sidebar collapse toggle
  const toggleConfig = document.getElementById('toggleConfig');
  const showConfig = document.getElementById('showConfig');
  const appContainer = document.querySelector('.app');
  
  // Load collapse state from localStorage
  try {
    const collapsed = appContainer.classList.contains('sidebar-collapsed');
    if (collapsed) {
      appContainer.classList.add('sidebar-collapsed');
    }
  } catch (e) {}
  
  async function toggleSidebar() {
    appContainer.classList.toggle('sidebar-collapsed');
    try {
      const collapsed = appContainer.classList.contains('sidebar-collapsed');
      await fetch('/api/config', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ ui: { sidebarCollapsed: collapsed } })
      });
    } catch (e) {
      console.error('Failed to save sidebar state:', e);
    }
  }
  
  if (toggleConfig) {
    toggleConfig.addEventListener('click', toggleSidebar);
  }
  
  if (showConfig) {
    showConfig.addEventListener('click', toggleSidebar);
  }

  // Toggle full-width layout and persist
  async function toggleAppWidth() {
    appContainer.classList.toggle('full-width');
    const isFull = appContainer.classList.contains('full-width');
    if (expandIcon && collapseIcon) {
      expandIcon.style.display = isFull ? 'none' : 'block';
      collapseIcon.style.display = isFull ? 'block' : 'none';
    }
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui: { fullWidth: isFull } })
      });
    } catch (e) {
      console.error('Failed to save full-width state:', e);
    }
    // State is already in classList
  }
  if (toggleWidth) {
    toggleWidth.addEventListener('click', toggleAppWidth);
  }

  // Export chat functionality
  const exportChat = document.getElementById('exportChat');
  if (exportChat) {
    exportChat.addEventListener('click', () => {
      const chatContent = chat.innerHTML;
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SpockChat Chat Export</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; background: #f6f8fb; }
    .msg { display: flex; margin-bottom: 16px; max-width: 80%; }
    .msg.user { margin-left: auto; }
    .msg .bubble { padding: 12px 16px; border-radius: 14px; line-height: 1.6; }
    .msg.user .bubble { background: #e0f2fe; color: #0c4a6e; }
    .msg.bot .bubble { background: #f1f5f9; color: #1e293b; }
    .msg.bot .bubble h3 { margin: 1em 0 0.5em 0; font-size: 1.1em; }
    .msg.bot .bubble p { margin: 0.5em 0; }
    .msg.bot .bubble p code,
    .msg.bot .bubble li code,
    .msg.bot .bubble td code,
    .msg.bot .bubble th code { 
      background: linear-gradient(135deg, #4b5563 0%, #374151 100%);
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 13px;
      letter-spacing: 0.02em;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
      white-space: nowrap;
    }
    .msg.bot .bubble pre { 
      background: #f3f4f6; 
      padding: 12px; 
      border-radius: 8px; 
      overflow-x: auto;
      position: relative;
    }
    .msg.bot .bubble pre::before {
      content: attr(data-language);
      position: absolute;
      top: 8px;
      right: 12px;
      background: linear-gradient(135deg, #4b5563 0%, #374151 100%);
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.9;
    }
    .msg.bot .bubble pre:not([data-language])::before {
      content: 'CODE';
    }
    .msg.bot .bubble blockquote {
      margin: 16px 0;
      padding: 16px 20px;
      border-left: 4px solid #6b7280;
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
      border-radius: 0 8px 8px 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      color: #4a5568;
      font-style: italic;
    }
    .hljs-keyword { color: #0000ff; font-weight: 600; }
    .hljs-string { color: #a31515; }
    .hljs-number { color: #098658; }
    .hljs-comment { color: #008000; font-style: italic; }
    .hljs-function { color: #795e26; }
    .hljs-title { color: #795e26; font-weight: 600; }
    .hljs-params { color: #001080; }
    .hljs-attr { color: #e50000; }
    .hljs-variable { color: #001080; }
    .hljs-built_in { color: #267f99; }
    .hljs-type { color: #267f99; }
    .hljs-literal { color: #0000ff; }
    .hljs-meta { color: #808080; }
    .hljs-tag { color: #800000; }
    .hljs-name { color: #800000; }
    .hljs-property { color: #001080; }
    .hljs-operator { color: #000000; }
    .hljs-class { color: #267f99; font-weight: 600; }
  </style>
</head>
<body>
  <h1>SpockChat Chat Export</h1>
  <p style="color: #64748b; margin-bottom: 30px;">Exported on ${new Date().toLocaleString()}</p>
  ${chatContent}
</body>
</html>`;
      
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spockchat-chat-${Date.now()}.html`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // API Key reveal functionality
  const toggleKey = document.getElementById('toggleKey');
  const copyKey = document.getElementById('copyKey');
  const eyeOpen = document.getElementById('eyeOpen');
  const eyeClosed = document.getElementById('eyeClosed');
  let revealTimeout = null;
  if (toggleKey) {
    toggleKey.addEventListener('click', () => {
      if (apiKey.type === 'password') {
        apiKey.type = 'text';
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
        // Auto-hide after 5 seconds
        if (revealTimeout) clearTimeout(revealTimeout);
        revealTimeout = setTimeout(() => {
          apiKey.type = 'password';
          eyeOpen.style.display = 'none';
          eyeClosed.style.display = 'block';
        }, 5000);
      } else {
        apiKey.type = 'password';
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
        if (revealTimeout) clearTimeout(revealTimeout);
      }
    });
  }

  // Copy API Key functionality
  if (copyKey) {
    copyKey.addEventListener('click', async () => {
      if (apiKey.value) {
        try {
          await navigator.clipboard.writeText(apiKey.value);
          // Visual feedback
          const originalColor = copyKey.style.color;
          copyKey.style.color = 'var(--accent-2)';
          setTimeout(() => {
            copyKey.style.color = originalColor;
          }, 1000);
        } catch (e) {
          console.error('Failed to copy:', e);
        }
      }
    });
  }

  // Enter key handling for chat input
  if (prompt) {
    // Auto-focus on input
    prompt.focus();
    
    prompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        // Enter alone: send message
        e.preventDefault();
        send.click();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+Enter or Cmd+Enter: insert newline (default behavior, but ensure it works)
        // Let default behavior happen
      }
    });

    // Auto-resize textarea as user types
    prompt.addEventListener('input', () => {
      if (!prompt.classList.contains('expanded')) {
        prompt.style.height = 'auto';
        prompt.style.height = Math.min(prompt.scrollHeight, 200) + 'px';
      }
    });
  }

  // Expand/collapse textarea
  const expandTextarea = document.getElementById('expandTextarea');
  if (expandTextarea) {
    expandTextarea.addEventListener('click', async () => {
      prompt.classList.toggle('expanded');
      if (prompt.classList.contains('expanded')) {
        prompt.style.height = '200px';
      } else {
        prompt.style.height = 'auto';
        prompt.style.height = Math.min(prompt.scrollHeight, 200) + 'px';
      }
      const isExpanded = prompt.classList.contains('expanded');
      try {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ui: { inputExpanded: isExpanded } })
        });
      } catch (e) {
        console.error('Failed to save input expanded state:', e);
      }
      // State is already in classList
      prompt.focus();
    });
  }

  function updateSegmentIndicator() {
    if (!themeSegment) return;
    const indicator = themeSegment.querySelector('.indicator');
    if (!indicator) return;
    const active = themeSegment.querySelector('button[aria-pressed="true"]');
    if (!active) return;
    const segRect = themeSegment.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    const left = rect.left - segRect.left;
    const width = rect.width;
    indicator.style.width = `${width}px`;
    indicator.style.transform = `translateX(${left}px)`;
  }

  function appendUserMessage(text) {
    const wrapper = document.createElement('div');
    wrapper.className = 'msg user';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.style.whiteSpace = 'pre-wrap';
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);
    chat.scrollTop = chat.scrollHeight;
  }

  function createBotMessageContainer() {
    const wrapper = document.createElement('div');
    wrapper.className = 'msg bot';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.setAttribute('data-is-markdown', 'true');
    bubble.textContent = '';
    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);
    chat.scrollTop = chat.scrollHeight;
    return bubble;
  }

  // Helper function to render markdown content in a bubble
  function renderMarkdownContent(bubble, content) {
    if (window.createMarkdownRenderer) {
      try {
        const renderer = window.createMarkdownRenderer();
        // Clear the bubble first
        bubble.innerHTML = '';
        renderer.render(content, bubble);
      } catch (e) {
        console.error('Renderer error:', e);
        bubble.innerHTML = '';
        bubble.textContent = content;
        bubble.style.whiteSpace = 'pre-wrap';
      }
    } else {
      console.warn('Renderer not available, using fallback');
      bubble.innerHTML = '';
      bubble.textContent = content;
      bubble.style.whiteSpace = 'pre-wrap';
    }
  }

  // Theme handling: apply stored theme or system preference
  async function applyThemePreference(pref, saveToServer = true) {
    // remove any existing listener
    if (window._chatter_mm && window._chatter_mm_listener) {
      try { window._chatter_mm.removeEventListener('change', window._chatter_mm_listener); } catch (e) {}
      window._chatter_mm_listener = null;
      window._chatter_mm = null;
    }

    if (pref === 'auto') {
      if (window.matchMedia) {
        const mm = window.matchMedia('(prefers-color-scheme: dark)');
        const setFromMedia = (e) => {
          const dark = e.matches === undefined ? mm.matches : e.matches;
          document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        };
        // set initial
        setFromMedia(mm);
        // listen
        window._chatter_mm = mm;
        window._chatter_mm_listener = setFromMedia;
        mm.addEventListener('change', setFromMedia);
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    } else if (pref === 'dark' || pref === 'light') {
      document.documentElement.setAttribute('data-theme', pref);
    }
    
    // Only save if explicitly requested (user changed theme, not initial load)
    if (saveToServer) {
      try { 
        await fetch('/api/config', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ ui: { theme: pref } })
        });
      } catch (e) {
        console.error('Failed to save theme:', e);
      }
    }
    if (themeSelect) themeSelect.value = pref;
    if (themeSegment) {
      const btns = themeSegment.querySelectorAll('button[data-theme]');
      btns.forEach(b => {
        const active = b.getAttribute('data-theme') === pref;
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      // reposition indicator after setting active button
      updateSegmentIndicator();
    }
  }

  // Theme initialization happens in loadConfig()

  if (themeSelect) {
    themeSelect.addEventListener('change', (evt) => {
      applyThemePreference(evt.target.value);
    });
  }

  if (themeSegment) {
    const btns = themeSegment.querySelectorAll('button[data-theme]');
    
    // Create hover bubble
    const hoverBubble = document.createElement('div');
    hoverBubble.className = 'hover-bubble';
    themeSegment.appendChild(hoverBubble);
    
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        applyThemePreference(btn.getAttribute('data-theme'));
      });
      
      // Add hover effect
      btn.addEventListener('mouseenter', () => {
        const segRect = themeSegment.getBoundingClientRect();
        const rect = btn.getBoundingClientRect();
        const left = rect.left - segRect.left;
        const width = rect.width;
        hoverBubble.style.width = `${width}px`;
        hoverBubble.style.transform = `translateX(${left}px)`;
        hoverBubble.style.opacity = '1';
      });
      
      btn.addEventListener('mouseleave', () => {
        hoverBubble.style.opacity = '0';
      });
    });
    
    // Also hide on segment leave
    themeSegment.addEventListener('mouseleave', () => {
      hoverBubble.style.opacity = '0';
    });
    
    // Initial indicator position after layout
    window.addEventListener('resize', () => updateSegmentIndicator());
    // Defer initial update to next frame for accurate sizes
    requestAnimationFrame(() => updateSegmentIndicator());
  }

  modelType.addEventListener('change', async () => {
    openaiFields.style.display = (modelType.value === 'openai' || modelType.value === 'azure') ? 'block' : 'none';
    
    // Save the model type change immediately
    await saveCurrentConfig();
  });

  saveConfig.addEventListener('click', async () => {
    const cfg = {
      model: { type: modelType.value },
      mcpServers: mcpServers
    };
    if (modelType.value === 'openai' || modelType.value === 'azure') {
      cfg.model.apiKey = apiKey.value;
      cfg.model.model = modelName.value;
      cfg.model.apiBase = apiBase.value;
    }
    
    const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
    const data = await res.json();
    const b = createBotMessageContainer();
    b.textContent = 'Configuration saved to spockchat-config.json';
  });

  const reloadMcp = document.getElementById('reloadMcp');
  if (reloadMcp) {
    reloadMcp.addEventListener('click', async () => {
      const originalText = reloadMcp.textContent;
      reloadMcp.disabled = true;
      reloadMcp.textContent = 'Reloading...';
      showToast('Reloading MCP tools…', 'info');
      
      try {
        const res = await fetch('/api/mcp/reload', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        
        const b = createBotMessageContainer();
        if (data.success) {
          b.textContent = data.message || 'MCP tools reloaded successfully';
          showToast(data.message || 'MCP tools reloaded successfully', 'success');
        } else {
          b.textContent = 'Error reloading MCP tools: ' + (data.error || 'Unknown error');
          showToast('Error reloading MCP tools: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (e) {
        const b = createBotMessageContainer();
        b.textContent = 'Failed to reload MCP tools: ' + e.message;
         showToast('Failed to reload MCP tools: ' + e.message, 'error');
      } finally {
        reloadMcp.disabled = false;
        reloadMcp.textContent = originalText;
      }
    });
  }

  const showTools = document.getElementById('showTools');
  const toolsModal = document.getElementById('toolsModal');
  const closeModal = document.getElementById('closeModal');
  const toolsList = document.getElementById('toolsList');

  if (showTools && toolsModal) {
    showTools.addEventListener('click', async () => {
      toolsList.innerHTML = '<div style="text-align:center; color:var(--muted)">Loading tools...</div>';
      toolsModal.classList.add('show');
      
      try {
        const res = await fetch('/api/mcp/tools');
        const data = await res.json();
        
        if (data.success && data.tools && data.tools.length > 0) {
          toolsList.innerHTML = data.tools.map(tool => `
            <div class="tool-item">
              <div class="tool-name">${tool.name}${tool.serverName ? ` <span style="color:var(--muted); font-size:12px; font-weight:normal">(${tool.serverName})</span>` : ''}</div>
              ${tool.description ? `<div class="tool-description">${tool.description}</div>` : ''}
            </div>
          `).join('');
        } else {
          toolsList.innerHTML = `<div style="text-align:center; color:var(--muted)">${data.error || 'No tools available'}</div>`;
        }
      } catch (e) {
        toolsList.innerHTML = `<div style="text-align:center; color:var(--muted)">Error loading tools: ${e.message}</div>`;
      }
    });
  }

  if (closeModal && toolsModal) {
    closeModal.addEventListener('click', () => {
      toolsModal.classList.remove('show');
    });
    
    // Close modal when clicking outside
    toolsModal.addEventListener('click', (e) => {
      if (e.target === toolsModal) {
        toolsModal.classList.remove('show');
      }
    });
  }

  clearChat && clearChat.addEventListener('click', () => {
    chat.innerHTML = '';
    conversationMessages = [];
    localStorage.removeItem('chatHistory');
  });

  send.addEventListener('click', async () => {
    if (_isSending) return;
    const p = prompt.value.trim();
    if (!p) return;
    _isSending = true;
    appendUserMessage(p);

    // Start SSE - send history WITHOUT the current message
    send.disabled = true;
    prompt.disabled = true;
    const resp = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: p, messages: conversationMessages }) });
    
    // Add user message to conversation history AFTER sending
    conversationMessages.push({ role: 'user', content: p });
    saveChatHistory();
    if (!resp.ok) {
      const err = await resp.json();
      const b = createBotMessageContainer();
      b.textContent = 'Error: ' + (err.error || JSON.stringify(err));
      send.disabled = false;
      prompt.disabled = false;
      return;
    }

    // Read as text stream and parse SSE-style 'data: ' lines
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const botBubble = createBotMessageContainer();
    
    // Add thinking indicator
    const thinkingSpan = document.createElement('span');
    thinkingSpan.className = 'thinking';
    thinkingSpan.textContent = '💭 Thinking...';
    botBubble.appendChild(thinkingSpan);
    
    let fullText = '';
    let chunkCount = 0;
    const appendChunk = (chunk) => {
      if (!chunk) return;
      const needsSpace = fullText && !/[\s]/.test(fullText.slice(-1)) && !/^[\s.,;:!?)/\]]/.test(chunk);
      if (needsSpace) fullText += ' ';
      fullText += chunk;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        
        break;
      }
      chunkCount++;
      const decoded = decoder.decode(value, { stream: true });
      buf += decoded;
      
      // Split by double newline to separate SSE events
      let parts = buf.split('\n\n');
      buf = parts.pop(); // Keep incomplete event in buffer
      
      for (const part of parts) {
        // Check if this is a data event
        if (part.startsWith('data:')) {
          // Extract everything after "data: " and parse JSON
          const jsonStr = part.replace(/^data:\s*/, '');
          try {
            const text = JSON.parse(jsonStr);
            if (text && text.trim()) {
              appendChunk(text);
              // Keep thinking bubble visible, don't update text yet
            }
          } catch (e) {
            // If not JSON, use as-is
            if (jsonStr && jsonStr.trim()) {
              appendChunk(jsonStr);
              // Keep thinking bubble visible, don't update text yet
            }
          }
          chat.scrollTop = chat.scrollHeight;
        }
      }
    }

    if (buf.trim()) {
      if (buf.startsWith('data:')) {
        const jsonStr = buf.replace(/^data:\s*/, '');
        try {
          const text = JSON.parse(jsonStr);
          appendChunk(text);
        } catch (e) {
          appendChunk(jsonStr);
        }
      }
    }

    // Clean up trailing artifacts (like {} braces from formatting)
    fullText = fullText.replace(/\{\}\s*$/, '').trim();
    
    // Remove thinking indicator now that we're ready to show formatted content
    thinkingSpan.remove();
    
    // Clear the bubble before rendering
    botBubble.innerHTML = '';

    // Render markdown using the new renderer
    if (window.createMarkdownRenderer) {
      try {
        const renderer = window.createMarkdownRenderer();
        renderer.render(fullText, botBubble);
      } catch (e) {
        console.error('Renderer error:', e);
        botBubble.textContent = fullText;
        botBubble.style.whiteSpace = 'pre-wrap';
      }
    } else {
      // Fallback to old marked rendering
      if (typeof marked !== 'undefined') {
        try {
          // Protect LaTeX from markdown processing by replacing with placeholders
          const latexBlocks = [];
          let processed = fullText;
          // Ensure headings start on a new line even if model omitted a newline
          processed = processed.replace(/([^\n])(#{1,6}\s)/g, '$1\n\n$2');
          // Ensure a blank line before headings for consistent spacing
          processed = processed.replace(/\n(#{1,6}\s)/g, '\n\n$1');
          // Ensure lists start on a new line if the model forgot a break
          processed = processed.replace(/([^\n])(\s*[\-*+]\s)/g, '$1\n$2');
          // Ensure ordered lists start on a new line
          processed = processed.replace(/([^\n])(\s*\d+\.\s)/g, '$1\n$2');
          // Normalize tables so they render correctly outside list contexts
          processed = normalizeMarkdownTables(processed);
          
          // Replace display math \[ ... \]
          processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
            const placeholder = `LATEX_DISPLAY_${latexBlocks.length}`;
            latexBlocks.push({ type: 'display', content: match });
            return placeholder;
          });
          
          // Replace inline math \( ... \)
          processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => {
            const placeholder = `LATEX_INLINE_${latexBlocks.length}`;
            latexBlocks.push({ type: 'inline', content: match });
            return placeholder;
          });
          
          // Process markdown
          marked.setOptions({
            breaks: true,
            gfm: true
          });
          
          let htmlOutput = marked.parse(processed);
          
          // Restore LaTeX placeholders
          latexBlocks.forEach((block, i) => {
            if (block.type === 'display') {
              htmlOutput = htmlOutput.replace(`LATEX_DISPLAY_${i}`, block.content);
            } else {
              htmlOutput = htmlOutput.replace(`LATEX_INLINE_${i}`, block.content);
            }
          });
          
          botBubble.innerHTML = htmlOutput;
          
          // Render LaTeX math with KaTeX
          if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(botBubble, {
              delimiters: [
                {left: '\\[', right: '\\]', display: true},
                {left: '\\(', right: '\\)', display: false}
              ],
              throwOnError: false
            });
          }
        } catch (e) {
          console.error('Rendering error:', e);
          botBubble.textContent = fullText;
          botBubble.style.whiteSpace = 'pre-wrap';
        }
      } else {
        botBubble.textContent = fullText;
        botBubble.style.whiteSpace = 'pre-wrap';
      }
    }
    
    // Add assistant response to conversation history
    conversationMessages.push({ role: 'assistant', content: fullText });
    saveChatHistory();

    // done streaming
    send.disabled = false;
    prompt.disabled = false;
    prompt.value = '';
    prompt.style.height = 'auto';
    prompt.classList.remove('expanded');
    prompt.focus();
    _isSending = false;
  });
  
  // Load code wrap preference on startup
  loadCodeWrapPreference();
});
