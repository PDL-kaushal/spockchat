(function (global) {
  const ensureHighlightTheme = () => {
    const existing = document.querySelector('link[data-hljs-theme="vs"]');
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs.min.css";
    link.setAttribute("data-hljs-theme", "vs");
    document.head.appendChild(link);
  };

  const ensureHighlightScript = (onReady) => {
    const check = () => {
      if (window.hljs) {
        if (onReady) onReady();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  };

  const ensureHighlightLanguage = (language, onReady) => {
    if (!language) {
      if (onReady) onReady();
      return;
    }
    const check = () => {
      if (window.hljs && window.hljs.getLanguage && window.hljs.getLanguage(language)) {
        if (onReady) onReady();
      } else if (window.hljs && window.hljs.getLanguage) {
        const script = document.createElement("script");
        script.src = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/${language}.min.js`;
        script.onload = () => {
          if (onReady) onReady();
        };
        document.head.appendChild(script);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  };

  function createMarkdownRenderer(options) {
    const opts = options || {};
    const markdownIt = opts.markdownIt || global.markdownit;
    const highlight = opts.highlight || global.hljs;
    const katexRender = opts.katexRender || global.renderMathInElement;
    const enableTables = opts.enableTables !== undefined ? opts.enableTables : true;
    const enableLinkify = opts.enableLinkify !== undefined ? opts.enableLinkify : true;

    if (!markdownIt) {
      throw new Error("markdown-it not available");
    }

    ensureHighlightTheme();

    const md = markdownIt({
      html: false,
      linkify: enableLinkify,
      breaks: true,
      typographer: false,
      tables: enableTables,
    });

    const normalizeLatexDelimiters = (text) => {
      let normalized = text || "";

      // Debug: Check what LaTeX patterns exist
      const hasDoubleBackslashBracket = normalized.includes("\\\\[");
      const hasSingleBackslashBracket = normalized.includes("\\[");
      const hasDoubleBackslashParen = normalized.includes("\\\\(");
      const hasSingleBackslashParen = normalized.includes("\\(");

      // Show actual character codes around LaTeX delimiters
      const bracketMatch = normalized.match(/\\\[/);
      if (bracketMatch) {
        const idx = normalized.indexOf(bracketMatch[0]);
      }
      const parenMatch = normalized.match(/\\\(/);
      if (parenMatch) {
        const idx = normalized.indexOf(parenMatch[0]);
      }

      // Handle various LaTeX delimiter formats
      // Convert LaTeX delimiters to standard $ and $$ format for KaTeX

      // Step 1: Convert display math blocks \\[ ... \\] to $$ ... $$
      // Handle both double backslash (\\[) and single backslash (\[)
      // IMPORTANT: Match literal backslash-bracket, not escaped
      const beforeDisplay = normalized;
      normalized = normalized.replace(/\\\\\[/g, "LATEX_DISPLAY_START");
      normalized = normalized.replace(/\\\[/g, "LATEX_DISPLAY_START");
      normalized = normalized.replace(/\\\\\]/g, "LATEX_DISPLAY_END");
      normalized = normalized.replace(/\\\]/g, "LATEX_DISPLAY_END");

      // Pair up display math delimiters
      const displayMatches = normalized.match(/LATEX_DISPLAY_START([\s\S]*?)LATEX_DISPLAY_END/g);
      normalized = normalized.replace(/LATEX_DISPLAY_START([\s\S]*?)LATEX_DISPLAY_END/g, (match, content) => {
        return `$$${content.trim()}$$`;
      });

      // Step 2: Convert inline math \\( ... \\) to $ ... $
      // Handle both double backslash (\\( ) and single backslash (\( )
      const beforeInline = normalized;
      normalized = normalized.replace(/\\\\\(/g, "LATEX_INLINE_START");
      normalized = normalized.replace(/\\\(/g, "LATEX_INLINE_START");
      normalized = normalized.replace(/\\\\\)/g, "LATEX_INLINE_END");
      normalized = normalized.replace(/\\\)/g, "LATEX_INLINE_END");

      // Pair up inline math delimiters (non-greedy, don't cross newlines)
      const inlineMatches = normalized.match(/LATEX_INLINE_START([^\n$]*?)LATEX_INLINE_END/g);
      normalized = normalized.replace(/LATEX_INLINE_START([^\n$]*?)LATEX_INLINE_END/g, (match, content) => {
        // Don't convert if already inside a $$ block
        if (content.includes("$$")) return match;
        return `$${content.trim()}$`;
      });

      // Step 3: Ensure $$ ... $$ display blocks have proper spacing
      normalized = normalized.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
        const trimmed = content.trim();
        // Check if this looks like display math (multi-line, contains \begin, etc.)
        const isDisplay =
          trimmed.includes("\n") ||
          trimmed.includes("\\begin") ||
          trimmed.includes("\\end") ||
          trimmed.includes("\\cases") ||
          trimmed.length > 50;
        if (isDisplay) {
          // Add spacing if not already present
          const beforeIdx = normalized.lastIndexOf(match) - 1;
          const afterIdx = normalized.lastIndexOf(match) + match.length;
          const before = beforeIdx >= 0 ? normalized[beforeIdx] : "";
          const after = afterIdx < normalized.length ? normalized[afterIdx] : "";
          if (before !== "\n" || after !== "\n") {
            return `\n\n$$${trimmed}$$\n\n`;
          }
        }
        return match;
      });

      return normalized;
    };

    const render = (source, outputElement) => {
      if (!outputElement) {
        throw new Error("outputElement is required");
      }

      // First normalize LaTeX delimiters
      let normalized = normalizeLatexDelimiters(source || "");

      // Extract LaTeX blocks to protect them from markdown processing
      const latexPlaceholders = [];
      let processedText = normalized;

      // Store display math ($$...$$) and replace with placeholders using Unicode chars markdown won't touch
      processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
        latexPlaceholders.push(match);
        return `\u0001LATEX${latexPlaceholders.length - 1}LATEX\u0001`;
      });

      // Store inline math ($...$) - be more careful to avoid matching placeholders
      processedText = processedText.replace(/\$([^\$\n]+?)\$/g, (match) => {
        // Skip if it looks like a placeholder
        if (match.includes("LATEX") || match.includes("\u0001") || match.includes("\u0002")) return match;
        latexPlaceholders.push(match);
        return `\u0002LATEX${latexPlaceholders.length - 1}LATEX\u0002`;
      });

      // Preprocess: Convert single line breaks to markdown hard breaks (two spaces + newline)
      // This preserves line breaks while keeping breaks: false for LaTeX safety
      // We do this AFTER LaTeX extraction so LaTeX is protected
      processedText = processedText.replace(/([^\n])\n([^\n])/g, "$1  \n$2");
      // But don't convert if it's already a double line break (paragraph break)
      processedText = processedText.replace(/\n\n/g, "\u0003PARA\u0003");
      processedText = processedText.replace(/\n/g, "  \n"); // Convert remaining singles to hard breaks
      processedText = processedText.replace(/\u0003PARA\u0003/g, "\n\n"); // Restore paragraph breaks

      // Render markdown with protected LaTeX
      let html = md.render(processedText);

      // Restore LaTeX blocks (iterate backwards to avoid index issues with replacements)
      for (let i = latexPlaceholders.length - 1; i >= 0; i--) {
        const placeholder1 = `\u0001LATEX${i}LATEX\u0001`;
        const placeholder2 = `\u0002LATEX${i}LATEX\u0002`;
        if (html.includes(placeholder1)) {
          html = html.replace(placeholder1, latexPlaceholders[i]);
        }
        if (html.includes(placeholder2)) {
          html = html.replace(placeholder2, latexPlaceholders[i]);
        }
      }

      outputElement.innerHTML = html;

      const runHighlight = () => {
        if (!window.hljs) return;
        const blocks = outputElement.querySelectorAll("pre code");
        blocks.forEach((block) => {
          block.className = "";
          const code = block.textContent || "";
          if (!code.trim()) return;

          const result = window.hljs.highlightAuto(code);
          block.innerHTML = result.value;
          block.classList.add("hljs");
          if (result.language) {
            block.classList.add(`language-${result.language}`);
            // Add language tag to parent pre element
            const pre = block.parentElement;
            if (pre && pre.tagName === "PRE") {
              pre.setAttribute("data-language", result.language);

              // Check if any line exceeds 80 characters
              const lines = code.split("\n");
              const hasLongLines = lines.some((line) => line.length > 80);
              if (hasLongLines) {
                pre.setAttribute("data-has-long-lines", "true");
              }
            }
          }
        });
      };

      // Ensure highlight.js and languages are loaded, then highlight
      ensureHighlightScript(() => {
        ensureHighlightLanguage("kotlin", runHighlight);
      });

      // Add wrap toggle buttons to code blocks with long lines
      if (global.addWrapToggleButtons) {
        setTimeout(() => global.addWrapToggleButtons(outputElement), 100);
      }

      if (katexRender) {
        katexRender(outputElement, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true },
          ],
          throwOnError: false,
        });
      }
    };

    return { render };
  }

  global.createMarkdownRenderer = createMarkdownRenderer;
})(window);
