document.addEventListener("DOMContentLoaded", () => {
  const modelType = document.getElementById("modelType");
  const openaiFields = document.getElementById("openaiFields");
  const apiKey = document.getElementById("apiKey");
  const modelName = document.getElementById("modelName");
  const apiBase = document.getElementById("apiBase");
  const saveConfig = document.getElementById("saveConfig");
  const clearChat = document.getElementById("clearChat");
  const chat = document.getElementById("chat");
  const prompt = document.getElementById("prompt");
  const send = document.getElementById("send");
  const themeSelect = document.getElementById("themeSelect");
  const themeSegment = document.getElementById("themeSegment");
  const mcpServersList = document.getElementById("mcpServersList");
  const addMcpServer = document.getElementById("addMcpServer");
  const modelAccordion = document.getElementById("modelAccordion");
  const mcpAccordion = document.getElementById("mcpAccordion");
  const toggleWidth = document.getElementById("toggleWidth");
  const expandIcon = document.getElementById("expandIcon");
  const collapseIcon = document.getElementById("collapseIcon");
  let _segIndicatorInit = false;
  let _isSending = false;
  let _codeWrapEnabled = false; // Default to no wrap
  let lastLmstudioResponseId = null;

  // Load code wrap preference from UI settings
  async function loadCodeWrapPreference() {
    try {
      const resp = await fetch("/ui-settings");
      if (resp.ok) {
        const settings = await resp.json();
        _codeWrapEnabled = settings.codeWrapEnabled || false;
      }
    } catch (e) {
      console.warn("Failed to load code wrap preference:", e);
    }
  }

  // Save code wrap preference to UI settings
  async function saveCodeWrapPreference(enabled) {
    try {
      const resp = await fetch("/ui-settings");
      const settings = resp.ok ? await resp.json() : {};
      settings.codeWrapEnabled = enabled;
      await fetch("/ui-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      _codeWrapEnabled = enabled;
    } catch (e) {
      console.error("Failed to save code wrap preference:", e);
    }
  }

  // Load accordion expand/collapse preferences from UI settings
  async function loadAccordionPreferences() {
    try {
      const resp = await fetch("/ui-settings");
      if (!resp.ok) return;
      const settings = await resp.json();
      if (modelAccordion) {
        modelAccordion.open = settings.modelAccordionOpen !== false;
      }
      if (mcpAccordion) {
        mcpAccordion.open = settings.mcpAccordionOpen !== false;
      }
    } catch (e) {
      console.warn("Failed to load accordion preferences:", e);
    }
  }

  // Save accordion expand/collapse preference to UI settings
  async function saveAccordionPreference(key, value) {
    try {
      const resp = await fetch("/ui-settings");
      const settings = resp.ok ? await resp.json() : {};
      settings[key] = value;
      await fetch("/ui-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
    } catch (e) {
      console.error("Failed to save accordion preference:", e);
    }
  }

  // Save chat history to localStorage
  function saveChatHistory() {
    try {
      const history = {
        messages: conversationMessages,
        timestamp: Date.now(),
      };
      localStorage.setItem("chatHistory", JSON.stringify(history));
    } catch (e) {
      console.warn("Failed to save chat history:", e);
    }
  }

  // Load chat history from localStorage
  function loadChatHistory() {
    try {
      const stored = localStorage.getItem("chatHistory");
      if (!stored) return;

      const history = JSON.parse(stored);
      if (!history.messages || !Array.isArray(history.messages)) return;

      // Restore conversation messages
      conversationMessages = history.messages;

      // Restore last LMStudio response id for continuity
      lastLmstudioResponseId = null;
      for (let i = conversationMessages.length - 1; i >= 0; i--) {
        const msg = conversationMessages[i];
        if (msg.role === "assistant" && msg.response_id) {
          lastLmstudioResponseId = msg.response_id;
          break;
        }
      }

      // Restore chat UI
      chat.innerHTML = "";
      const baseTimestamp = history.timestamp || Date.now() - history.messages.length * 1000;
      history.messages.forEach((msg, index) => {
        const messageTimestamp = Number.isFinite(msg.createdAt) ? msg.createdAt : baseTimestamp + index;
        if (msg.role === "user") {
          appendUserMessage(msg.content, messageTimestamp);
        } else if (msg.role === "assistant") {
          const botBubble = createBotMessageContainer(messageTimestamp);
          renderMarkdownContent(botBubble, msg.content);

          // Store basic metadata for historical messages
          // Find the previous user message for context
          let userMessage = null;
          for (let i = index - 1; i >= 0; i--) {
            if (history.messages[i].role === "user") {
              userMessage = history.messages[i].content;
              break;
            }
          }

          messageMetadata.set(botBubble, {
            type: "assistant",
            request: { prompt: userMessage, messages: [] },
            response: {
              content: msg.content,
              formatted: msg.content,
              response_id: msg.response_id || null,
            },
          });

          // Add click listener
          botBubble.addEventListener("click", () => {
            showMessageDetails(botBubble);
          });
        }
      });

      sortChatByTimestamp();
    } catch (e) {
      console.warn("Failed to load chat history:", e);
    }
  }

  // Add wrap toggle buttons to code blocks
  window.addWrapToggleButtons = function (container) {
    const codeBlocks = container.querySelectorAll('pre[data-has-long-lines="true"]');
    codeBlocks.forEach((pre) => {
      // Don't add button if already exists
      if (pre.querySelector(".wrap-toggle-btn")) return;

      const btn = document.createElement("button");
      btn.className = "wrap-toggle-btn";
      btn.setAttribute("aria-label", "Toggle line wrapping");
      btn.title = "Toggle line wrapping";
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-2m0 0l2-2m-2 2l2 2M4 18h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

      // Position the button to the left of the language badge with proper spacing
      // Calculate badge width dynamically to avoid overlap
      const updateButtonPosition = () => {
        // The language badge is created via ::before pseudo-element
        // We need to measure it by temporarily creating a test element with exact badge styles
        const language = pre.getAttribute("data-language") || "CODE";
        const testBadge = document.createElement("span");
        testBadge.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: nowrap;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-family: inherit;
        `;
        testBadge.textContent = language;
        document.body.appendChild(testBadge);
        const badgeWidth = testBadge.offsetWidth;
        document.body.removeChild(testBadge);

        // Position button: badge is at right: 12px, so button should be at:
        // right: 12px (badge position) + badge width + spacing (8px)
        const spacing = 8; // Space between button and badge
        const badgeRightOffset = 12; // Badge is positioned at right: 12px
        const buttonRight = badgeRightOffset + badgeWidth + spacing;

        btn.style.right = `${buttonRight}px`;
      };

      // Apply current wrap state
      if (_codeWrapEnabled) {
        pre.classList.add("wrap-enabled");
        btn.classList.add("active");
      }

      // Position the button after adding it to DOM
      pre.appendChild(btn);

      // Use multiple timing strategies to ensure badge is rendered before measuring
      // The badge is created via ::before pseudo-element, so we need to wait for it
      const positionButton = () => {
        updateButtonPosition();
        // Double-check after a short delay in case rendering wasn't complete
        setTimeout(updateButtonPosition, 50);
      };

      // Try positioning immediately, then after animation frame, then after a short delay
      requestAnimationFrame(() => {
        requestAnimationFrame(positionButton);
      });

      // Update position if language changes or on resize
      const observer = new MutationObserver(() => {
        requestAnimationFrame(positionButton);
      });
      observer.observe(pre, { attributes: true, attributeFilter: ["data-language"] });

      // Store cleanup function
      const resizeHandler = () => requestAnimationFrame(positionButton);
      window.addEventListener("resize", resizeHandler);

      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const isWrapped = pre.classList.toggle("wrap-enabled");
        btn.classList.toggle("active", isWrapped);

        // Save preference
        await saveCodeWrapPreference(isWrapped);

        // Update all code blocks in the chat
        document.querySelectorAll('pre[data-has-long-lines="true"]').forEach((p) => {
          if (isWrapped) {
            p.classList.add("wrap-enabled");
            const b = p.querySelector(".wrap-toggle-btn");
            if (b) b.classList.add("active");
          } else {
            p.classList.remove("wrap-enabled");
            const b = p.querySelector(".wrap-toggle-btn");
            if (b) b.classList.remove("active");
          }
        });
      });

      pre.appendChild(btn);
    });
  };

  // Lightweight toast notifications
  function showToast(message, type = "info") {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.style.cssText =
        "position:fixed; bottom:12px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; gap:8px; align-items:center; z-index:9999";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.style.cssText =
      "padding:20px 24px; border-radius:16px; border:1px solid var(--border); background:var(--surface); color:var(--text); box-shadow:0 8px 20px rgba(0,0,0,0.12); font-size:20px; width:640px;";
    if (type === "success") {
      toast.style.background = "var(--success-bg, #eafff3)";
      toast.style.color = "var(--success-fg, #065f46)";
      toast.style.borderColor = "rgba(6,95,70,0.25)";
    } else if (type === "error") {
      toast.style.background = "var(--error-bg, #fee2e2)";
      toast.style.color = "var(--error-fg, #7f1d1d)";
      toast.style.borderColor = "rgba(127,29,29,0.25)";
    } else {
      toast.style.background = "var(--surface)";
    }
    toast.textContent = message;
    container.appendChild(toast);
    // Auto-dismiss after 4s
    setTimeout(() => {
      toast.style.transition = "opacity .2s ease";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 220);
    }, 4000);
  }

  // Conversation history for context
  let conversationMessages = [];

  // Store message metadata (request/response pairs) for each message
  const messageMetadata = new Map();

  // MCP servers array
  let mcpServers = [];

  // Normalize markdown tables to avoid list-wrapping issues
  const normalizeMarkdownTables = (text) => {
    const lines = text.split("\n");
    const cleaned = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1] || "";

      const isTableHeader = /^\s*(?:[-*+]\s+|\d+\.\s+)?\|/.test(line);
      const isSeparator = /^\s*(?:[-*+]\s+|\d+\.\s+)?\|?\s*[-:| ]{3,}\|?\s*$/.test(nextLine);

      if (isTableHeader && isSeparator) {
        const prev = cleaned[cleaned.length - 1] || "";
        const prevIsList = /^\s*(?:[-*+]|\d+\.)\s+/.test(prev);
        if (prevIsList && prev.trim() !== "") {
          cleaned.push("");
        }

        while (i < lines.length) {
          const tableLine = lines[i];
          if (!/^\s*(?:[-*+]\s+|\d+\.\s+)?\|/.test(tableLine)) break;
          let normalized = tableLine.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)?\|/, "|");
          normalized = normalized.replace(/^\s+/, "");
          cleaned.push(normalized);
          i++;
        }
        i -= 1;
        continue;
      }

      cleaned.push(line);
    }

    return cleaned.join("\n");
  };

  // Render MCP servers list
  function renderMcpServers() {
    mcpServersList.innerHTML = "";
    if (mcpServers.length === 0) {
      mcpServersList.innerHTML =
        '<div style="color:var(--muted); font-size:13px; padding:8px; text-align:center">No MCP servers configured</div>';
      return;
    }

    mcpServers.forEach((server, index) => {
      const serverDiv = document.createElement("div");
      serverDiv.style.cssText =
        "border:1px solid var(--border); border-radius:8px; padding:10px; background:var(--surface)";
      serverDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:start; gap:8px; margin-bottom:8px">
          <input type="text" value="${server.name || ""}" placeholder="Server name" 
                 style="flex:1; font-weight:500" data-index="${index}" data-field="name" class="mcp-server-input"/>
          <button class="btn-icon remove-mcp-server" data-index="${index}" title="Remove server" style="color:var(--error)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px">
          <input type="text" value="${server.httpUrl || ""}" placeholder="HTTP URL" 
                 style="font-size:12px" data-index="${index}" data-field="httpUrl" class="mcp-server-input"/>
        </div>
      `;
      mcpServersList.appendChild(serverDiv);
    });

    // Add event listeners for inputs
    document.querySelectorAll(".mcp-server-input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const index = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        mcpServers[index][field] = e.target.value;
        saveCurrentConfig();
      });
    });

    // Add event listeners for remove buttons
    document.querySelectorAll(".remove-mcp-server").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        mcpServers.splice(index, 1);
        renderMcpServers();
        saveCurrentConfig();
      });
    });
  }

  // Add MCP server
  if (addMcpServer) {
    addMcpServer.addEventListener("click", () => {
      mcpServers.push({ name: "MCP Server " + (mcpServers.length + 1), httpUrl: "", stdioCmd: "" });
      renderMcpServers();
      saveCurrentConfig();
    });
  }

  // Load saved config from server
  async function loadConfig() {
    try {
      const res = await fetch("/api/config?t=" + Date.now());
      const data = await res.json();

      if (data.model) {
        modelType.value = data.model.type || "mock";
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
          applyThemePreference("auto", false);
        }
        if (data.ui.sidebarCollapsed !== undefined) {
          if (data.ui.sidebarCollapsed) {
            appContainer.classList.add("sidebar-collapsed");
          }
        }
        if (data.ui.fullWidth !== undefined) {
          if (data.ui.fullWidth) {
            appContainer.classList.add("full-width");
          } else {
            appContainer.classList.remove("full-width");
          }
          // Update toggle icons
          if (expandIcon && collapseIcon) {
            const isFull = appContainer.classList.contains("full-width");
            expandIcon.style.display = isFull ? "none" : "block";
            collapseIcon.style.display = isFull ? "block" : "none";
          }
        }
        if (data.ui.inputExpanded !== undefined) {
          const inputWrapper = document.querySelector(".inputWrapper");
          if (data.ui.inputExpanded) {
            prompt.classList.add("expanded");
            if (inputWrapper) inputWrapper.classList.add("expanded");
          } else {
            prompt.classList.remove("expanded");
            if (inputWrapper) inputWrapper.classList.remove("expanded");
          }
        }
      }
      // Update UI visibility
      openaiFields.style.display =
        modelType.value === "openai" || modelType.value === "azure" || modelType.value === "lmstudio"
          ? "block"
          : "none";

      // Enable transitions after initial layout is set
      setTimeout(() => {
        appContainer.classList.add("transitions-enabled");
      }, 50);
    } catch (e) {
      console.log("Could not load saved config:", e);
      // Enable transitions even on error
      setTimeout(() => {
        appContainer.classList.add("transitions-enabled");
      }, 50);
    }

    // Load MCP initialization status and display in chat
    try {
      const res = await fetch("/api/mcp/init-status");
      const data = await res.json();

      if (data.results && data.results.length > 0) {
        const failedServers = data.results.filter((r) => !r.success);
        if (failedServers.length > 0) {
          const b = createBotMessageContainer();
          let message = "⚠️ **MCP Server Initialization Issues**\n\n";
          failedServers.forEach((result) => {
            message += `❌ **${result.serverName}**\n`;
            message += `   URL: \`${result.url || "N/A"}\`\n`;
            message += `   Error: ${result.error}\n\n`;
          });

          const successServers = data.results.filter((r) => r.success);
          if (successServers.length > 0) {
            message += `✅ Successfully connected to ${successServers.length} server(s):\n`;
            successServers.forEach((result) => {
              message += `   - ${result.serverName} (${result.toolCount} tools)\n`;
            });
          }

          // Render as markdown
          if (typeof marked !== "undefined") {
            marked.setOptions({ breaks: true, gfm: true });
            b.innerHTML = marked.parse(message);
          } else {
            b.textContent = message;
            b.style.whiteSpace = "pre-wrap";
          }
        } else if (data.results.length > 0) {
          // All successful
          const b = createBotMessageContainer();
          let message = "✅ **MCP Servers Ready**\n\n";
          data.results.forEach((result) => {
            message += `   - ${result.serverName}: ${result.toolCount} tools loaded\n`;
          });

          if (typeof marked !== "undefined") {
            marked.setOptions({ breaks: true, gfm: true });
            b.innerHTML = marked.parse(message);
          } else {
            b.textContent = message;
            b.style.whiteSpace = "pre-wrap";
          }
        }
      } else {
        // No MCP servers configured or no initialization results
        const b = createBotMessageContainer();
        const message =
          "👋 Welcome to SpockChat! Your model is ready.\n\nNo MCP servers are currently configured. To give your model access to tools, add MCP servers in the Settings panel.";

        if (typeof marked !== "undefined") {
          marked.setOptions({ breaks: true, gfm: true });
          b.innerHTML = marked.parse(message);
        } else {
          b.textContent = message;
          b.style.whiteSpace = "pre-wrap";
        }
      }
    } catch (e) {
      console.log("Could not load MCP init status:", e);
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
        sidebarCollapsed: appContainer?.classList.contains("sidebar-collapsed"),
        fullWidth: appContainer?.classList.contains("full-width"),
        inputExpanded: prompt?.classList.contains("expanded"),
      },
    };
    // Remove undefined values from ui
    Object.keys(cfg.ui).forEach((key) => {
      if (cfg.ui[key] === undefined || cfg.ui[key] === null) {
        delete cfg.ui[key];
      }
    });

    if (modelType.value === "openai" || modelType.value === "azure" || modelType.value === "lmstudio") {
      cfg.model.apiKey = apiKey.value;
      cfg.model.model = modelName.value;
      cfg.model.apiBase = apiBase.value;
    }
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  }

  // Sidebar collapse toggle
  const toggleConfig = document.getElementById("toggleConfig");
  const showConfig = document.getElementById("showConfig");
  const appContainer = document.querySelector(".app");

  // Load collapse state from localStorage
  try {
    const collapsed = appContainer.classList.contains("sidebar-collapsed");
    if (collapsed) {
      appContainer.classList.add("sidebar-collapsed");
    }
  } catch (e) {}

  async function toggleSidebar() {
    appContainer.classList.toggle("sidebar-collapsed");
    try {
      const collapsed = appContainer.classList.contains("sidebar-collapsed");
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ui: { sidebarCollapsed: collapsed } }),
      });
    } catch (e) {
      console.error("Failed to save sidebar state:", e);
    }
  }

  if (toggleConfig) {
    toggleConfig.addEventListener("click", toggleSidebar);
  }

  if (showConfig) {
    showConfig.addEventListener("click", toggleSidebar);
  }

  if (modelAccordion) {
    modelAccordion.addEventListener("toggle", () => {
      saveAccordionPreference("modelAccordionOpen", modelAccordion.open);
    });
  }

  if (mcpAccordion) {
    mcpAccordion.addEventListener("toggle", () => {
      saveAccordionPreference("mcpAccordionOpen", mcpAccordion.open);
    });
  }

  // Toggle full-width layout and persist
  async function toggleAppWidth() {
    appContainer.classList.toggle("full-width");
    const isFull = appContainer.classList.contains("full-width");
    if (expandIcon && collapseIcon) {
      expandIcon.style.display = isFull ? "none" : "block";
      collapseIcon.style.display = isFull ? "block" : "none";
    }
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ui: { fullWidth: isFull } }),
      });
    } catch (e) {
      console.error("Failed to save full-width state:", e);
    }
    // State is already in classList
  }
  if (toggleWidth) {
    toggleWidth.addEventListener("click", toggleAppWidth);
  }

  // Export chat functionality
  const exportChat = document.getElementById("exportChat");
  if (exportChat) {
    exportChat.addEventListener("click", () => {
      const chatContent = chat.innerHTML;
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SpockChat Chat Export</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body, {delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}]});"></script>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 100%; margin: 0; padding: 40px 60px; background: #f6f8fb; }
    .msg { display: flex; flex-direction: column; margin-bottom: 16px; max-width: 80%; }
    .msg.user { margin-left: auto; align-items: flex-end; }
    .msg.user .timestamp { text-align: right; }
    .msg.bot .timestamp { text-align: left; }
    .timestamp { font-size: 12px; color: #94a3b8; margin-top: 4px; }
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

      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `spockchat-chat-${Date.now()}.html`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // API Key reveal functionality
  const toggleKey = document.getElementById("toggleKey");
  const copyKey = document.getElementById("copyKey");
  const eyeOpen = document.getElementById("eyeOpen");
  const eyeClosed = document.getElementById("eyeClosed");
  let revealTimeout = null;
  if (toggleKey) {
    toggleKey.addEventListener("click", () => {
      if (apiKey.type === "password") {
        apiKey.type = "text";
        eyeOpen.style.display = "block";
        eyeClosed.style.display = "none";
        // Auto-hide after 5 seconds
        if (revealTimeout) clearTimeout(revealTimeout);
        revealTimeout = setTimeout(() => {
          apiKey.type = "password";
          eyeOpen.style.display = "none";
          eyeClosed.style.display = "block";
        }, 5000);
      } else {
        apiKey.type = "password";
        eyeOpen.style.display = "none";
        eyeClosed.style.display = "block";
        if (revealTimeout) clearTimeout(revealTimeout);
      }
    });
  }

  // Copy API Key functionality
  if (copyKey) {
    copyKey.addEventListener("click", async () => {
      if (apiKey.value) {
        try {
          await navigator.clipboard.writeText(apiKey.value);
          // Visual feedback
          const originalColor = copyKey.style.color;
          copyKey.style.color = "var(--accent-2)";
          setTimeout(() => {
            copyKey.style.color = originalColor;
          }, 1000);
        } catch (e) {
          console.error("Failed to copy:", e);
        }
      }
    });
  }

  // Enter key handling for chat input
  if (prompt) {
    // Auto-focus on input
    prompt.focus();

    prompt.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        // Enter alone: send message
        e.preventDefault();
        send.click();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        // Ctrl+Enter or Cmd+Enter: insert newline (default behavior, but ensure it works)
        // Let default behavior happen
      }
    });

    // Input handler removed - expand/collapse handles sizing
  }

  // Expand/collapse textarea
  const expandTextarea = document.getElementById("expandTextarea");
  const inputWrapper = document.querySelector(".inputWrapper");
  if (expandTextarea && inputWrapper) {
    expandTextarea.addEventListener("click", async () => {
      // Toggle both classes
      inputWrapper.classList.toggle("expanded");
      prompt.classList.toggle("expanded");

      const isExpanded = prompt.classList.contains("expanded");

      // Save state
      try {
        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ui: { inputExpanded: isExpanded } }),
        });
      } catch (e) {
        console.error("Failed to save input expanded state:", e);
      }

      prompt.focus();
    });
  }

  function updateSegmentIndicator() {
    if (!themeSegment) return;
    const indicator = themeSegment.querySelector(".indicator");
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

  function insertMessageWrapper(wrapper, timestamp) {
    const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
    wrapper.dataset.ts = String(ts);
    const children = Array.from(chat.children);
    const insertBefore = children.find((child) => Number(child.dataset.ts || 0) > ts);
    if (insertBefore) {
      chat.insertBefore(wrapper, insertBefore);
    } else {
      chat.appendChild(wrapper);
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function sortChatByTimestamp() {
    const items = Array.from(chat.children);
    items.sort((a, b) => {
      const ta = Number(a.dataset.ts || 0);
      const tb = Number(b.dataset.ts || 0);
      if (ta === tb) return 0;
      return ta - tb;
    });
    items.forEach((item) => chat.appendChild(item));
  }

  function appendUserMessage(text, timestamp) {
    const wrapper = document.createElement("div");
    wrapper.className = "msg user";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.style.whiteSpace = "pre-wrap";
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
    const tsElement = document.createElement("div");
    tsElement.className = "timestamp";
    tsElement.textContent = new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    wrapper.appendChild(tsElement);
    insertMessageWrapper(wrapper, timestamp);
  }

  function createBotMessageContainer(timestamp) {
    const wrapper = document.createElement("div");
    wrapper.className = "msg bot";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.setAttribute("data-is-markdown", "true");
    bubble.textContent = "";
    bubble.style.cursor = "pointer";
    bubble.title = "Click to view request/response details";
    wrapper.appendChild(bubble);
    const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
    const tsElement = document.createElement("div");
    tsElement.className = "timestamp";
    tsElement.textContent = new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    wrapper.appendChild(tsElement);
    insertMessageWrapper(wrapper, timestamp);
    return bubble;
  }

  // Helper function to render markdown content in a bubble
  function renderMarkdownContent(bubble, content) {
    if (window.createMarkdownRenderer) {
      try {
        const renderer = window.createMarkdownRenderer();
        // Clear the bubble first
        bubble.innerHTML = "";
        renderer.render(content, bubble);
      } catch (e) {
        console.error("Renderer error:", e);
        bubble.innerHTML = "";
        bubble.textContent = content;
        bubble.style.whiteSpace = "pre-wrap";
      }
    } else {
      console.warn("Renderer not available, using fallback");
      bubble.innerHTML = "";
      bubble.textContent = content;
      bubble.style.whiteSpace = "pre-wrap";
    }
  }

  // Theme handling: apply stored theme or system preference
  async function applyThemePreference(pref, saveToServer = true) {
    // remove any existing listener
    if (window._chatter_mm && window._chatter_mm_listener) {
      try {
        window._chatter_mm.removeEventListener("change", window._chatter_mm_listener);
      } catch (e) {}
      window._chatter_mm_listener = null;
      window._chatter_mm = null;
    }

    if (pref === "auto") {
      if (window.matchMedia) {
        const mm = window.matchMedia("(prefers-color-scheme: dark)");
        const setFromMedia = (e) => {
          const dark = e.matches === undefined ? mm.matches : e.matches;
          document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
        };
        // set initial
        setFromMedia(mm);
        // listen
        window._chatter_mm = mm;
        window._chatter_mm_listener = setFromMedia;
        mm.addEventListener("change", setFromMedia);
      } else {
        document.documentElement.setAttribute("data-theme", "light");
      }
    } else if (pref === "dark" || pref === "light") {
      document.documentElement.setAttribute("data-theme", pref);
    }

    // Only save if explicitly requested (user changed theme, not initial load)
    if (saveToServer) {
      try {
        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ui: { theme: pref } }),
        });
      } catch (e) {
        console.error("Failed to save theme:", e);
      }
    }
    if (themeSelect) themeSelect.value = pref;
    if (themeSegment) {
      const btns = themeSegment.querySelectorAll("button[data-theme]");
      btns.forEach((b) => {
        const active = b.getAttribute("data-theme") === pref;
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      // reposition indicator after setting active button
      updateSegmentIndicator();
    }
  }

  // Theme initialization happens in loadConfig()

  if (themeSelect) {
    themeSelect.addEventListener("change", (evt) => {
      applyThemePreference(evt.target.value);
    });
  }

  if (themeSegment) {
    const btns = themeSegment.querySelectorAll("button[data-theme]");

    // Create hover bubble
    const hoverBubble = document.createElement("div");
    hoverBubble.className = "hover-bubble";
    themeSegment.appendChild(hoverBubble);

    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        applyThemePreference(btn.getAttribute("data-theme"));
      });

      // Add hover effect
      btn.addEventListener("mouseenter", () => {
        const segRect = themeSegment.getBoundingClientRect();
        const rect = btn.getBoundingClientRect();
        const left = rect.left - segRect.left;
        const width = rect.width;
        hoverBubble.style.width = `${width}px`;
        hoverBubble.style.transform = `translateX(${left}px)`;
        hoverBubble.style.opacity = "1";
      });

      btn.addEventListener("mouseleave", () => {
        hoverBubble.style.opacity = "0";
      });
    });

    // Also hide on segment leave
    themeSegment.addEventListener("mouseleave", () => {
      hoverBubble.style.opacity = "0";
    });

    // Initial indicator position after layout
    window.addEventListener("resize", () => updateSegmentIndicator());
    // Defer initial update to next frame for accurate sizes
    requestAnimationFrame(() => updateSegmentIndicator());
  }

  modelType.addEventListener("change", async () => {
    openaiFields.style.display =
      modelType.value === "openai" || modelType.value === "azure" || modelType.value === "lmstudio" ? "block" : "none";

    // Save the model type change immediately
    await saveCurrentConfig();
  });

  saveConfig.addEventListener("click", async () => {
    const cfg = {
      model: { type: modelType.value },
      mcpServers: mcpServers,
    };
    if (modelType.value === "openai" || modelType.value === "azure" || modelType.value === "lmstudio") {
      cfg.model.apiKey = apiKey.value;
      cfg.model.model = modelName.value;
      cfg.model.apiBase = apiBase.value;
    }

    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    const data = await res.json();
    const b = createBotMessageContainer();
    b.textContent = "Configuration saved to spockchat-config.json";
  });

  const reloadMcp = document.getElementById("reloadMcp");
  if (reloadMcp) {
    reloadMcp.addEventListener("click", async () => {
      const originalText = reloadMcp.textContent;
      reloadMcp.disabled = true;
      reloadMcp.textContent = "Reloading...";
      showToast("Reloading MCP tools…", "info");

      try {
        const res = await fetch("/api/mcp/reload", { method: "POST", headers: { "Content-Type": "application/json" } });
        const data = await res.json();

        const b = createBotMessageContainer();
        if (data.success) {
          // Build detailed message with individual server info
          let detailedMessage = data.message || "MCP tools reloaded successfully";
          if (data.successfulServers && data.successfulServers.length > 0) {
            detailedMessage += "\n\nLoaded tools by server:";
            data.successfulServers.forEach((server) => {
              detailedMessage += `\n• ${server.serverName}: ${server.toolCount} tool(s)`;
            });
          }
          b.textContent = detailedMessage;

          // Show toast for overall success
          showToast(data.message || "MCP tools reloaded successfully", "success");

          // Show individual toasts for each MCP server
          if (data.successfulServers && data.successfulServers.length > 0) {
            data.successfulServers.forEach((server, index) => {
              setTimeout(
                () => {
                  showToast(`${server.serverName}: ${server.toolCount} tool(s) loaded`, "success");
                },
                (index + 1) * 300,
              );
            });
          }
        } else {
          // Build detailed error message
          let detailedMessage = "Error reloading MCP tools: " + (data.error || "Unknown error");
          if (data.successfulServers && data.successfulServers.length > 0) {
            detailedMessage += "\n\nSuccessfully loaded:";
            data.successfulServers.forEach((server) => {
              detailedMessage += `\n• ${server.serverName}: ${server.toolCount} tool(s)`;
            });
          }
          if (data.failedServers && data.failedServers.length > 0) {
            detailedMessage += "\n\nFailed servers:";
            data.failedServers.forEach((server) => {
              detailedMessage += `\n• ${server.serverName}: ${server.error}`;
            });
          }
          b.textContent = detailedMessage;
          showToast("Error reloading MCP tools: " + (data.error || "Unknown error"), "error");

          // Show individual toasts for successful servers
          if (data.successfulServers && data.successfulServers.length > 0) {
            data.successfulServers.forEach((server, index) => {
              setTimeout(
                () => {
                  showToast(`${server.serverName}: ${server.toolCount} tool(s) loaded`, "success");
                },
                (index + 1) * 300,
              );
            });
          }

          // Show individual toasts for failed servers
          if (data.failedServers && data.failedServers.length > 0) {
            data.failedServers.forEach((server, index) => {
              const offset = (data.successfulServers?.length || 0) + index + 1;
              setTimeout(() => {
                showToast(`${server.serverName}: Failed - ${server.error}`, "error");
              }, offset * 300);
            });
          }
        }
      } catch (e) {
        const b = createBotMessageContainer();
        b.textContent = "Failed to reload MCP tools: " + e.message;
        showToast("Failed to reload MCP tools: " + e.message, "error");
      } finally {
        reloadMcp.disabled = false;
        reloadMcp.textContent = originalText;
      }
    });
  }

  const showTools = document.getElementById("showTools");
  const toolsModal = document.getElementById("toolsModal");
  const closeModal = document.getElementById("closeModal");
  const toolsList = document.getElementById("toolsList");
  const toolsSearch = document.getElementById("toolsSearch");
  const aboutBtn = document.getElementById("aboutBtn");
  const aboutModal = document.getElementById("aboutModal");
  const closeAboutModal = document.getElementById("closeAboutModal");
  // Store fetched tools so we can filter and group client-side
  let mcpTools = [];

  // Helper to group tools by server name
  function groupToolsByServer(tools) {
    const map = new Map();
    tools.forEach((t) => {
      const key = t.serverName || "(unknown server)";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return map;
  }

  // Escape regex special chars in query tokens
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Highlight matched substrings in `text` according to `query` (tokens).
  // Uses escapeHtml for safety and returns HTML string with <span class="search-match">wrapped</span> matches.
  function highlightMatches(text, query) {
    if (!text) return "";
    if (!query) return escapeHtml(text);

    const tokens = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeRegExp);
    if (tokens.length === 0) return escapeHtml(text);

    const re = new RegExp(`(${tokens.join("|")})`, "gi");
    let out = "";
    let lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = re.lastIndex;
      if (start > lastIndex) {
        out += escapeHtml(text.slice(lastIndex, start));
      }
      out += `<span class=\"search-match\">${escapeHtml(text.slice(start, end))}</span>`;
      lastIndex = end;
    }
    if (lastIndex < text.length) out += escapeHtml(text.slice(lastIndex));
    return out || escapeHtml(text);
  }

  // Render tools grouped by server, optional filter string
  function renderTools(filter) {
    filter = (filter || "").trim().toLowerCase();

    if (!mcpTools || mcpTools.length === 0) {
      toolsList.innerHTML = '<div style="text-align:center; color:var(--muted)">No tools available</div>';
      return;
    }

    const grouped = groupToolsByServer(mcpTools);
    const serverNames = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

    let out = "";
    serverNames.forEach((server) => {
      const tools = grouped.get(server).filter((t) => {
        if (!filter) return true;
        const hay = `${t.name || ""} ${t.description || ""} ${t.serverName || ""}`.toLowerCase();
        return hay.indexOf(filter) !== -1;
      });

      if (tools.length === 0) return; // skip empty groups

      out += `
        <div class="tool-server-group">
          <div class="tool-server-name" style="font-weight:600; margin:10px 0 8px">${escapeHtml(server)}</div>
          <div class="tool-server-list">
      `;

      tools.forEach((tool) => {
        const nameHtml = filter ? highlightMatches(tool.name || "", filter) : escapeHtml(tool.name || "");
        const descHtml = tool.description ? (filter ? highlightMatches(tool.description, filter) : escapeHtml(tool.description)) : "";
        const serverLabel = tool.serverName ? ` <span style="color:var(--muted); font-size:12px; font-weight:normal">(${escapeHtml(tool.serverName)})</span>` : "";
        const toolIdx = mcpTools.indexOf(tool);

        out += `
            <div class="tool-item" data-tool-idx="${toolIdx}">
              <div class="tool-name">${nameHtml}${serverLabel}</div>
              ${descHtml ? `<div class="tool-description">${descHtml}</div>` : ""}
              <div class="tool-details" style="display:none; margin-top:8px"></div>
            </div>
          `;
      });

      out += `</div></div>`;
    });

    if (!out) {
      toolsList.innerHTML = '<div style="text-align:center; color:var(--muted)">No tools match your search</div>';
    } else {
      toolsList.innerHTML = out;
      // Attach click handlers after rendering
      attachToolClickHandlers();
    }
    return;

  }

    // Attach click handlers for showing tool details
  function attachToolClickHandlers() {
    const items = toolsList.querySelectorAll(".tool-item");
    items.forEach((el) => {
      // Make clickable
      el.style.cursor = "pointer";
      // Ensure a single attached handler
      el.removeEventListener("click", onToolClickSafe);
      el.addEventListener("click", onToolClickSafe);
    });
  }

  // Event handler factory - safe lookup of tool by data-tool-idx
  function onToolClickSafe(e) {
    // Walk up to .tool-item in case inner element was clicked
    try {
      console.debug && console.debug('tool click', e && e.type);
    } catch (err) {}
    let el = e.currentTarget || e.target;
    while (el && !el.classList.contains("tool-item")) el = el.parentElement;
    if (!el) return;
    const idx = el.getAttribute("data-tool-idx") || (el.dataset && el.dataset.toolIdx);
    const i = Number.isFinite(Number(idx)) ? Number(idx) : null;
    const tool = i !== null && mcpTools[i] ? mcpTools[i] : null;
    if (!tool) {
      // try to match by name + server
      const nameEl = el.querySelector(".tool-name");
      const nameText = nameEl ? nameEl.textContent : null;
      const found = mcpTools.find((t) => nameText && nameText.indexOf(t.name) !== -1);
      if (found) {
        try {
          showToolDetailsInline(el, found);
        } catch (err) {
          console.error('Error showing tool details inline (found)', err);
          showToast('Error displaying tool details');
        }
      }
      return;
    }
    try {
      showToolDetailsInline(el, tool);
    } catch (err) {
      console.error('Error showing tool details inline', err);
      showToast('Error displaying tool details');
    }
  }

  // Show tool details inline under the clicked .tool-item (toggle)
  function showToolDetailsInline(itemEl, tool) {
    if (!itemEl) return;
    const detailsEl = itemEl.querySelector(".tool-details");
    if (!detailsEl) return;

    // Collapse any other open details
    document.querySelectorAll('.tool-details').forEach((d) => {
      if (d !== detailsEl) d.style.display = 'none';
    });

    const isOpen = detailsEl.style.display === '' || detailsEl.style.display === 'block';
    if (isOpen) {
      detailsEl.style.display = 'none';
      return;
    }

    // Build details HTML
    let html = "";
    if (tool.serverName) {
      html += `<div style=\"margin-bottom:6px;color:var(--muted)\">Server: <strong>${escapeHtml(tool.serverName)}</strong></div>`;
    }
    if (tool.description) {
      html += `<div style=\"margin-bottom:8px\">${highlightMatches(tool.description, toolsSearch ? toolsSearch.value || "" : "")}</div>`;
    }

    const params = tool.parameters || tool.params || tool.arguments || tool.input || null;
    if (params && Array.isArray(params) && params.length > 0) {
      html += `<div style=\"margin-bottom:8px\"><strong>Parameters</strong></div>`;
      html += `<div style=\"margin-bottom:8px; overflow:auto; max-height:260px; border:1px solid var(--border); padding:8px; border-radius:8px; background:var(--surface)\">`;
      html += `<table style=\"width:100%; border-collapse:collapse; font-size:13px\">`;
      html += `<thead><tr><th style=\"text-align:left; padding:6px 8px; color:var(--muted)\">Name</th><th style=\"text-align:left; padding:6px 8px; color:var(--muted)\">Type</th><th style=\"text-align:left; padding:6px 8px; color:var(--muted)\">Required</th><th style=\"text-align:left; padding:6px 8px; color:var(--muted)\">Description</th></tr></thead>`;
      html += `<tbody>`;
      params.forEach((p) => {
        const pname = p.name || p.key || p.id || "";
        const ptype = p.type || (p.schema && p.schema.type) || "";
        const preq = p.required ? "Yes" : "No";
        const pdesc = p.description || p.help || p.doc || "";
        html += `<tr><td style=\"padding:6px 8px; vertical-align:top; width:18%\">${escapeHtml(pname)}</td><td style=\"padding:6px 8px; vertical-align:top; width:12%\">${escapeHtml(ptype)}</td><td style=\"padding:6px 8px; vertical-align:top; width:8%\">${escapeHtml(preq)}</td><td style=\"padding:6px 8px; vertical-align:top\">${highlightMatches(pdesc, toolsSearch ? toolsSearch.value || "" : "")}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    html += `<div style=\"display:flex; gap:8px; align-items:center; margin-top:6px; margin-bottom:6px\">`;
    html += `<button class=\"btn secondary copy-tool-json\">Copy JSON</button>`;
    html += `</div>`;

    html += `<pre style=\"max-height:260px; overflow:auto; border:1px solid var(--border); padding:12px; border-radius:8px; background:var(--surface)\"><code>${escapeHtml(JSON.stringify(tool, null, 2))}</code></pre>`;

    try {
      detailsEl.innerHTML = html;

      // wire copy button
      const copyBtn = detailsEl.querySelector('.copy-tool-json');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify(tool, null, 2));
            const old = copyBtn.textContent;
            copyBtn.textContent = 'Copied';
            setTimeout(() => (copyBtn.textContent = old), 1200);
          } catch (err) {
            console.error('Copy failed', err);
          }
        });
      }

      detailsEl.style.display = 'block';
    } catch (err) {
      console.error('Error rendering inline tool details', err);
      showToast('Error rendering tool details');
    }
  }

  // Show a tool details modal
  const toolDetailModal = document.getElementById("toolDetailModal");
  const toolDetailBody = document.getElementById("toolDetailBody");
  const toolDetailTitle = document.getElementById("toolDetailTitle");
  const closeToolDetailModal = document.getElementById("closeToolDetailModal");

  function showToolDetails(tool) {
    if (!toolDetailBody) return;
    // Title
    if (toolDetailTitle) {
      toolDetailTitle.textContent = tool.name || "Tool Details";
    }

    let html = "";
    if (tool.serverName) {
      html += `<div style=\"margin-bottom:8px;color:var(--muted)\">Server: <strong>${escapeHtml(tool.serverName)}</strong></div>`;
    }
    if (tool.description) {
      html += `<div style=\"margin-bottom:12px\">${highlightMatches(tool.description, toolsSearch ? toolsSearch.value || "" : "")}</div>`;
    }

    // Parameters: try multiple possible keys
    const params = tool.parameters || tool.params || tool.arguments || tool.input || null;
    if (params && Array.isArray(params) && params.length > 0) {
      html += `<h4 style=\"margin-top:6px\">Parameters</h4>`;
      html += `<div style=\"margin-bottom:12px; overflow:auto; max-height:320px; border:1px solid var(--border); padding:8px; border-radius:8px; background:var(--surface)\">`;
      html += `<table style=\"width:100%; border-collapse:collapse; font-size:13px\">`;
      html += `<thead><tr><th style=\"text-align:left; padding:6px 8px; color:var(--muted)\">Name</th><th style=\"text-align:left; padding:6px 8px; color:var(--muted)\">Type</th><th style=\"text-align:left; padding:6px 8px; color:var(--muted)\">Required</th><th style=\"text-align:left; padding:6px 8px; color:var(--muted)\">Description</th></tr></thead>`;
      html += `<tbody>`;
      params.forEach((p) => {
        const pname = p.name || p.key || p.id || "";
        const ptype = p.type || (p.schema && p.schema.type) || "";
        const preq = p.required ? "Yes" : "No";
        const pdesc = p.description || p.help || p.doc || "";
        html += `<tr><td style=\"padding:6px 8px; vertical-align:top; width:18%\">${escapeHtml(pname)}</td><td style=\"padding:6px 8px; vertical-align:top; width:12%\">${escapeHtml(ptype)}</td><td style=\"padding:6px 8px; vertical-align:top; width:8%\">${escapeHtml(preq)}</td><td style=\"padding:6px 8px; vertical-align:top\">${highlightMatches(pdesc, toolsSearch ? toolsSearch.value || "" : "")}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // Show full JSON for advanced details
    html += `
      <div style=\"display:flex; gap:8px; align-items:center; margin-top:8px; margin-bottom:8px\">
        <button id=\"copyToolJsonBtn\" class=\"btn secondary\">Copy JSON</button>
      </div>
    `;

    html += `<pre style=\"max-height:360px; overflow:auto; border:1px solid var(--border); padding:12px; border-radius:8px; background:var(--surface)\"><code>${escapeHtml(JSON.stringify(tool, null, 2))}</code></pre>`;

    toolDetailBody.innerHTML = html;

    // wire copy button
    const copyBtn = document.getElementById("copyToolJsonBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(tool, null, 2));
          copyBtn.textContent = "Copied";
          setTimeout(() => (copyBtn.textContent = "Copy JSON"), 1200);
        } catch (e) {
          console.error("Copy failed", e);
        }
      });
    }

    if (toolDetailModal) toolDetailModal.classList.add("show");
  }

  if (closeToolDetailModal && toolDetailModal) {
    closeToolDetailModal.addEventListener("click", () => {
      toolDetailModal.classList.remove("show");
    });
    toolDetailModal.addEventListener("click", (e) => {
      if (e.target === toolDetailModal) toolDetailModal.classList.remove("show");
    });
  }

  // Simple debounce utility for input handling
  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  if (showTools && toolsModal) {
    showTools.addEventListener("click", async () => {
      toolsList.innerHTML = '<div style="text-align:center; color:var(--muted)">Loading tools...</div>';
      // clear any previous search
      if (toolsSearch) toolsSearch.value = "";
      toolsModal.classList.add("show");

      try {
        const res = await fetch("/api/mcp/tools");
        const data = await res.json();

        if (data.success && data.tools && data.tools.length > 0) {
          mcpTools = data.tools;
          renderTools("");
        } else {
          mcpTools = [];
          toolsList.innerHTML = `<div style="text-align:center; color:var(--muted)">${escapeHtml(data.error || "No tools available")}</div>`;
        }
      } catch (e) {
        mcpTools = [];
        toolsList.innerHTML = `<div style="text-align:center; color:var(--muted)">Error loading tools: ${escapeHtml(e.message)}</div>`;
      }
    });

    // Wire up search input for live filtering (debounced)
    if (toolsSearch) {
      const debounced = debounce((q) => renderTools(q), 150);
      toolsSearch.addEventListener("input", (e) => {
        debounced(e.target.value || "");
      });
    }
  }

  if (closeModal && toolsModal) {
    closeModal.addEventListener("click", () => {
      toolsModal.classList.remove("show");
      if (toolsSearch) toolsSearch.value = "";
    });

    // Close modal when clicking outside
    toolsModal.addEventListener("click", (e) => {
      if (e.target === toolsModal) {
        toolsModal.classList.remove("show");
        if (toolsSearch) toolsSearch.value = "";
      }
    });
  }

  function closeAllModals() {
    document.querySelectorAll(".modal.show").forEach((modalEl) => {
      modalEl.classList.remove("show");
    });
    if (toolsSearch) toolsSearch.value = "";
  }

  if (aboutBtn && aboutModal) {
    aboutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      aboutModal.classList.add("show");
    });
  }

  if (closeAboutModal && aboutModal) {
    closeAboutModal.addEventListener("click", () => {
      aboutModal.classList.remove("show");
    });

    aboutModal.addEventListener("click", (e) => {
      if (e.target === aboutModal) {
        aboutModal.classList.remove("show");
      }
    });
  }

  // Message details modal handlers
  const messageModal = document.getElementById("messageModal");
  const closeMessageModal = document.getElementById("closeMessageModal");
  const messageDetails = document.getElementById("messageDetails");

  if (closeMessageModal && messageModal) {
    closeMessageModal.addEventListener("click", () => {
      messageModal.classList.remove("show");
    });

    // Close modal when clicking outside
    messageModal.addEventListener("click", (e) => {
      if (e.target === messageModal) {
        messageModal.classList.remove("show");
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
    }
  });

  // Function to show message details
  function showMessageDetails(bubble) {
    const metadata = messageMetadata.get(bubble);
    if (!metadata || !messageDetails) return;

    const isAssistant = metadata.type === "assistant";

    let html = "";

    if (metadata.request) {
      html += `
        <section class="message-section" data-section="request">
          <div class="message-section-header">
            <h4>Request</h4>
            <button type="button" class="btn-icon copy-section-btn" data-target="request" title="Copy request JSON">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.85"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.85"/>
              </svg>
            </button>
          </div>
          <pre data-section="request"><code>${escapeHtml(JSON.stringify(metadata.request, null, 2))}</code></pre>
        </section>
      `;
    }

    if (metadata.response !== undefined && metadata.response !== null) {
      if (isAssistant) {
        const resp = metadata.response;
        const formattedText = typeof resp === "string" ? resp : resp.formatted || resp.content || "";
        const rawTextBase =
          typeof resp === "string" ? resp : resp.raw !== undefined && resp.raw !== null ? resp.raw : formattedText;
        const rawTextDisplay = rawTextBase.includes("\\n") ? rawTextBase : JSON.stringify(rawTextBase).slice(1, -1);

        html += `
          <section class="message-section" data-section="response">
            <div class="message-section-header">
              <div class="response-header-left">
                <h4>Response</h4>
                ${resp.response_id ? `<span class="response-id">ID: ${escapeHtml(resp.response_id)}</span>` : ""}
              </div>
              <div class="llm-output-controls">
                <div class="llm-toggle-labels">
                  <span class="llm-toggle-label llm-toggle-label--raw">Raw</span>
                </div>
                <button
                  type="button"
                  class="llm-output-toggle"
                  data-mode="formatted"
                  role="switch"
                  aria-checked="true"
                  title="Toggle raw vs formatted LLM output"
                >
                  <span class="llm-output-thumb"></span>
                </button>
                <div class="llm-toggle-labels">
                  <span class="llm-toggle-label llm-toggle-label--formatted">Formatted</span>
                </div>
                <button
                  type="button"
                  class="btn-icon copy-section-btn"
                  data-target="response"
                  data-mode="formatted"
                  title="Copy formatted LLM output"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.85"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.85"/>
                  </svg>
                </button>
              </div>
            </div>
            <pre data-section="response-formatted"><code>${escapeHtml(formattedText)}</code></pre>
            <pre data-section="response-raw" style="display:none;"><code>${escapeHtml(rawTextDisplay)}</code></pre>
          </section>
        `;
      } else {
        html += `
          <section class="message-section" data-section="response">
            <div class="message-section-header">
              <h4>Response</h4>
              <button type="button" class="btn-icon copy-section-btn" data-target="response" title="Copy response JSON">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.85"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.85"/>
                </svg>
              </button>
            </div>
            <pre data-section="response"><code>${escapeHtml(JSON.stringify(metadata.response, null, 2))}</code></pre>
          </section>
        `;
      }
    }

    messageDetails.innerHTML = html;

    // Wire up LLM output toggle (for assistant responses) if present
    const llmToggle = messageDetails.querySelector(".llm-output-toggle");
    if (llmToggle) {
      llmToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentMode = llmToggle.getAttribute("data-mode") === "raw" ? "raw" : "formatted";
        const nextMode = currentMode === "formatted" ? "raw" : "formatted";
        llmToggle.setAttribute("data-mode", nextMode);
        llmToggle.setAttribute("aria-checked", nextMode === "formatted" ? "true" : "false");

        const formattedPre = messageDetails.querySelector('pre[data-section="response-formatted"]');
        const rawPre = messageDetails.querySelector('pre[data-section="response-raw"]');
        if (formattedPre && rawPre) {
          if (nextMode === "formatted") {
            formattedPre.style.display = "";
            rawPre.style.display = "none";
          } else {
            formattedPre.style.display = "none";
            rawPre.style.display = "";
          }
        }

        const llmCopyBtn = messageDetails.querySelector('.copy-section-btn[data-target="response"]');
        if (llmCopyBtn) {
          llmCopyBtn.setAttribute("data-mode", nextMode);
          llmCopyBtn.title = nextMode === "formatted" ? "Copy formatted LLM output" : "Copy raw LLM output";
        }
      });
    }

    // Wire up copy buttons after content is injected
    const copyButtons = messageDetails.querySelectorAll(".copy-section-btn");
    copyButtons.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const target = btn.getAttribute("data-target");
        if (!target) return;

        let section = target;
        // For assistant LLM responses we have formatted/raw variants under the same "response" target
        if (target === "response") {
          const modeAttr = btn.getAttribute("data-mode");
          if (modeAttr === "raw" || modeAttr === "formatted") {
            section = modeAttr === "raw" ? "response-raw" : "response-formatted";
          }
        }

        const codeEl = messageDetails.querySelector(`pre[data-section="${section}"] code`);
        if (!codeEl) return;

        const text = codeEl.textContent || "";

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            const temp = document.createElement("textarea");
            temp.value = text;
            temp.style.position = "fixed";
            temp.style.opacity = "0";
            document.body.appendChild(temp);
            temp.select();
            document.execCommand("copy");
            document.body.removeChild(temp);
          }

          btn.classList.add("copied");
          let defaultTitle;
          if (target === "request") {
            defaultTitle = "Copy request JSON";
          } else if (target === "response") {
            const modeAttr = btn.getAttribute("data-mode");
            if (modeAttr === "raw" || modeAttr === "formatted") {
              defaultTitle = modeAttr === "formatted" ? "Copy formatted LLM output" : "Copy raw LLM output";
            } else {
              defaultTitle = "Copy response JSON";
            }
          } else {
            defaultTitle = btn.title || "Copy";
          }

          btn.title = "Copied";
          setTimeout(() => {
            btn.classList.remove("copied");
            btn.title = defaultTitle;
          }, 1500);
        } catch (err) {
          console.error("Failed to copy section text", err);
        }
      });
    });

    messageModal.classList.add("show");
  }

  // Helper function to escape HTML
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  clearChat &&
    clearChat.addEventListener("click", () => {
      chat.innerHTML = "";
      conversationMessages = [];
      messageMetadata.clear();
      localStorage.removeItem("chatHistory");
      lastLmstudioResponseId = null;
    });

  send.addEventListener("click", async () => {
    if (_isSending) return;
    const p = prompt.value.trim();
    if (!p) return;
    _isSending = true;
    const userTimestamp = Date.now();
    appendUserMessage(p, userTimestamp);

    // Build request data
    let requestMessages = conversationMessages.map((msg) => {
      const clean = { role: msg.role, content: msg.content };
      if (msg.name) clean.name = msg.name;
      if (msg.tool_call_id) clean.tool_call_id = msg.tool_call_id;
      if (msg.tool_calls) clean.tool_calls = msg.tool_calls;
      return clean;
    });

    // LMStudio uses previous_response_id for context, no need to send full history
    if (modelType.value === "lmstudio") {
      requestMessages = [];
    }

    const requestData = { prompt: p, messages: requestMessages };
    if (modelType.value === "lmstudio" && lastLmstudioResponseId) {
      requestData.previous_response_id = lastLmstudioResponseId;
    }

    // Start SSE - send history WITHOUT the current message
    send.disabled = true;
    prompt.disabled = true;
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
    });

    // Add user message to conversation history AFTER sending
    conversationMessages.push({ role: "user", content: p, createdAt: userTimestamp });
    saveChatHistory();
    if (!resp.ok) {
      const err = await resp.json();
      const b = createBotMessageContainer(Date.now());
      b.textContent = "Error: " + (err.error || JSON.stringify(err));
      send.disabled = false;
      prompt.disabled = false;
      return;
    }

    // Read as text stream and parse SSE-style 'data: ' lines
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const botBubble = createBotMessageContainer(Date.now());

    // Add thinking indicator
    const thinkingSpan = document.createElement("span");
    thinkingSpan.className = "thinking";
    thinkingSpan.textContent = "💭 Thinking...";
    botBubble.appendChild(thinkingSpan);

    let fullText = "";
    let pendingLmstudioResponseId = null;
    let chunkCount = 0;
    const appendChunk = (chunk) => {
      if (!chunk) return;

      // Don't add spaces - just concatenate
      // The streaming should come with proper spacing from the server
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
      let parts = buf.split("\n\n");
      buf = parts.pop(); // Keep incomplete event in buffer

      for (const part of parts) {
        const lines = part.split("\n");

        // Check if this is an event-based SSE message
        let eventType = null;
        let eventData = null;

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith("data:")) {
            eventData = line.substring(5).trim();
          }
        }

        // Handle meta event (LMStudio response id, etc.)
        if (eventType === "meta" && eventData) {
          try {
            const meta = JSON.parse(eventData);
            if (meta && meta.response_id) {
              pendingLmstudioResponseId = meta.response_id;
            }
          } catch (e) {
            // Ignore meta parsing errors
          }
          continue;
        }

        // Handle tool call event
        if (eventType === "toolcall" && eventData) {
          try {
            const toolCallData = JSON.parse(eventData);
            // Create a separate bubble for the tool call
            const toolTimestamp = Number.isFinite(toolCallData.timestamp) ? toolCallData.timestamp : Date.now();
            const toolBubble = createBotMessageContainer(toolTimestamp);
            toolBubble.innerHTML = `🔧 <strong>Calling tool:</strong> ${escapeHtml(toolCallData.name)} <span class="tool-status" aria-hidden="true">✓</span>`;
            toolBubble.style.background = "var(--surface-hover)";
            toolBubble.style.borderLeft = "3px solid var(--primary)";
            toolBubble.style.color = "var(--text)";
            toolBubble.dataset.toolCallId = toolCallData.id; // Store ID for later update

            // Store metadata for the tool call
            messageMetadata.set(toolBubble, {
              type: "tool",
              request: {
                tool: toolCallData.name,
                arguments: toolCallData.arguments,
                id: toolCallData.id,
              },
              response: null,
            });

            // Add click listener
            toolBubble.addEventListener("click", () => {
              showMessageDetails(toolBubble);
            });
            sortChatByTimestamp();
          } catch (e) {
            console.error("Error parsing tool call event:", e);
          }
          continue;
        }

        // Handle tool result event
        if (eventType === "toolresult" && eventData) {
          try {
            const toolResultData = JSON.parse(eventData);
            // Find the corresponding tool bubble by ID
            const toolBubbles = Array.from(chat.querySelectorAll('.bubble[data-tool-call-id]'));
            const toolBubble = toolBubbles.find((bubble) => bubble.dataset.toolCallId === toolResultData.id);

            if (toolBubble) {
              // Update the metadata with the result
              const metadata = messageMetadata.get(toolBubble);
              if (metadata) {
                metadata.response = toolResultData.result;
                messageMetadata.set(toolBubble, metadata);

                // Update the visual indicator to show completion
                toolBubble.style.borderLeft = "3px solid var(--success)";
                const statusEl = toolBubble.querySelector(".tool-status");
                if (statusEl) statusEl.classList.add("show");
              }
            }
          } catch (e) {
            console.error("Error parsing tool result event:", e);
          }
          continue;
        }

        // Handle regular data events
        if (part.startsWith("data:")) {
          // Extract everything after "data: " and parse JSON
          const jsonStr = part.replace(/^data:\s*/, "");
          try {
            const text = JSON.parse(jsonStr);
            // Append all text chunks, including whitespace (spaces, newlines)
            // Don't use trim() here as it would filter out important formatting characters
            if (text !== null && text !== undefined) {
              appendChunk(text);
              // Keep thinking bubble visible, don't update text yet
            }
          } catch (e) {
            // If not JSON, use as-is
            // Don't trim here either - preserve all characters including whitespace
            if (jsonStr !== null && jsonStr !== undefined) {
              appendChunk(jsonStr);
              // Keep thinking bubble visible, don't update text yet
            }
          }
          chat.scrollTop = chat.scrollHeight;
        }
      }
    }

    if (buf.trim()) {
      if (buf.startsWith("data:")) {
        const jsonStr = buf.replace(/^data:\s*/, "");
        try {
          const text = JSON.parse(jsonStr);
          // Don't filter out whitespace - append all characters
          if (text !== null && text !== undefined) {
            appendChunk(text);
          }
        } catch (e) {
          // Don't filter out whitespace - append all characters
          if (jsonStr !== null && jsonStr !== undefined) {
            appendChunk(jsonStr);
          }
        }
      }
    }

    // Preserve the raw accumulated text for debugging / modal display
    const rawFullText = fullText;
    // Clean up trailing artifacts (like {} braces from formatting) for display/rendering
    fullText = fullText.replace(/\{\}\s*$/, "").trim();

    // Remove thinking indicator now that we're ready to show formatted content
    thinkingSpan.remove();
    const assistantTimestamp = Date.now();
    if (botBubble && botBubble.parentElement) {
      botBubble.parentElement.dataset.ts = String(assistantTimestamp);
    }

    // Clear the bubble before rendering
    botBubble.innerHTML = "";

    // Unified rendering: All model outputs (Azure, OpenAI, LMStudio, etc.) are normalized
    // server-side to markdown-ready text, then rendered here with the same markdown renderer.
    // This ensures consistent formatting: markdown, LaTeX math, code blocks, etc.
    if (window.createMarkdownRenderer) {
      try {
        const renderer = window.createMarkdownRenderer();
        renderer.render(fullText, botBubble);
      } catch (e) {
        console.error("Renderer error:", e);
        botBubble.textContent = fullText;
        botBubble.style.whiteSpace = "pre-wrap";
      }
    } else {
      // Fallback to old marked rendering
      if (typeof marked !== "undefined") {
        try {
          // Protect LaTeX from markdown processing by replacing with placeholders
          const latexBlocks = [];
          let processed = fullText;
          // Ensure headings start on a new line even if model omitted a newline
          processed = processed.replace(/([^\n])(#{1,6}\s)/g, "$1\n\n$2");
          // Ensure a blank line before headings for consistent spacing
          processed = processed.replace(/\n(#{1,6}\s)/g, "\n\n$1");
          // Ensure lists start on a new line if the model forgot a break
          processed = processed.replace(/([^\n])(\s*[\-*+]\s)/g, "$1\n$2");
          // Ensure ordered lists start on a new line
          processed = processed.replace(/([^\n])(\s*\d+\.\s)/g, "$1\n$2");
          // Normalize tables so they render correctly outside list contexts
          processed = normalizeMarkdownTables(processed);

          // Replace display math \[ ... \]
          processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
            const placeholder = `LATEX_DISPLAY_${latexBlocks.length}`;
            latexBlocks.push({ type: "display", content: match });
            return placeholder;
          });

          // Replace inline math \( ... \)
          processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => {
            const placeholder = `LATEX_INLINE_${latexBlocks.length}`;
            latexBlocks.push({ type: "inline", content: match });
            return placeholder;
          });

          // Process markdown
          marked.setOptions({
            breaks: true,
            gfm: true,
          });

          let htmlOutput = marked.parse(processed);

          // Restore LaTeX placeholders
          latexBlocks.forEach((block, i) => {
            if (block.type === "display") {
              htmlOutput = htmlOutput.replace(`LATEX_DISPLAY_${i}`, block.content);
            } else {
              htmlOutput = htmlOutput.replace(`LATEX_INLINE_${i}`, block.content);
            }
          });

          botBubble.innerHTML = htmlOutput;

          // Render LaTeX math with KaTeX
          if (typeof renderMathInElement !== "undefined") {
            renderMathInElement(botBubble, {
              delimiters: [
                { left: "\\[", right: "\\]", display: true },
                { left: "\\(", right: "\\)", display: false },
              ],
              throwOnError: false,
            });
          }
        } catch (e) {
          console.error("Rendering error:", e);
          botBubble.textContent = fullText;
          botBubble.style.whiteSpace = "pre-wrap";
        }
      } else {
        botBubble.textContent = fullText;
        botBubble.style.whiteSpace = "pre-wrap";
      }
    }

    // Store metadata for this message
    messageMetadata.set(botBubble, {
      type: "assistant",
      request: requestData,
      response: {
        content: fullText,
        formatted: fullText,
        raw: rawFullText,
        response_id: pendingLmstudioResponseId || null,
      },
    });

    // Add click listener to show details
    botBubble.addEventListener("click", () => {
      showMessageDetails(botBubble);
    });

    // Add assistant response to conversation history
    const assistantMessage = { role: "assistant", content: fullText, createdAt: assistantTimestamp };
    if (pendingLmstudioResponseId) {
      assistantMessage.response_id = pendingLmstudioResponseId;
      lastLmstudioResponseId = pendingLmstudioResponseId;
    }
    conversationMessages.push(assistantMessage);
    saveChatHistory();
    sortChatByTimestamp();

    // done streaming
    send.disabled = false;
    prompt.disabled = false;
    prompt.value = "";
    prompt.focus();
    _isSending = false;
  });

  // Load UI preferences on startup
  loadCodeWrapPreference();
  loadAccordionPreferences();
}
);
