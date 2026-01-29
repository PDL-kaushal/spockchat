(function (global) {
  const ensureHighlightTheme = () => {
    const existing = document.querySelector('link[data-hljs-theme="vs"]');
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs.min.css';
    link.setAttribute('data-hljs-theme', 'vs');
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
        const script = document.createElement('script');
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
      throw new Error('markdown-it not available');
    }

    ensureHighlightTheme();

    const md = markdownIt({
      html: false,
      linkify: enableLinkify,
      breaks: false,
      typographer: false,
      tables: enableTables
    });

    const normalizeLatexDelimiters = (text) => {
      let normalized = text || '';

      normalized = normalized.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (match, content) => `$$${content}$$`);
      normalized = normalized.replace(/\\\\\(([^\n]*?)\\\\\)/g, (match, content) => `$${content}$`);

      normalized = normalized.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => `$$${content}$$`);
      normalized = normalized.replace(/\\\(([^\n]*?)\\\)/g, (match, content) => `$${content}$`);

      normalized = normalized.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => `\n\n$$${content}$$\n\n`);

      return normalized;
    };

    const render = (source, outputElement) => {
      if (!outputElement) {
        throw new Error('outputElement is required');
      }
      
      // First normalize LaTeX delimiters
      let normalized = normalizeLatexDelimiters(source || '');
      
      // Extract LaTeX blocks to protect them from markdown processing
      const latexPlaceholders = [];
      let processedText = normalized;
      
      // Store display math ($$...$$) and replace with placeholders using Unicode chars markdown won't touch
      processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
        latexPlaceholders.push(match);
        return `\u0001LATEX${latexPlaceholders.length - 1}LATEX\u0001`;
      });
      
      // Store inline math ($...$)
      processedText = processedText.replace(/\$([^\$\n]+?)\$/g, (match) => {
        // Skip if it looks like a placeholder
        if (match.includes('LATEX')) return match;
        latexPlaceholders.push(match);
        return `\u0002LATEX${latexPlaceholders.length - 1}LATEX\u0002`;
      });
      
      // Render markdown with protected LaTeX
      let html = md.render(processedText);
      
      // Restore LaTeX blocks
      latexPlaceholders.forEach((latex, index) => {
        html = html.replace(`\u0001LATEX${index}LATEX\u0001`, latex);
        html = html.replace(`\u0002LATEX${index}LATEX\u0002`, latex);
      });
      
      outputElement.innerHTML = html;

      const runHighlight = () => {
        if (!window.hljs) return;
        const blocks = outputElement.querySelectorAll('pre code');
        blocks.forEach((block) => {
          block.className = '';
          const code = block.textContent || '';
          if (!code.trim()) return;
          
          const result = window.hljs.highlightAuto(code);
          block.innerHTML = result.value;
          block.classList.add('hljs');
          if (result.language) {
            block.classList.add(`language-${result.language}`);
            // Add language tag to parent pre element
            const pre = block.parentElement;
            if (pre && pre.tagName === 'PRE') {
              pre.setAttribute('data-language', result.language);
              
              // Check if any line exceeds 80 characters
              const lines = code.split('\n');
              const hasLongLines = lines.some(line => line.length > 80);
              if (hasLongLines) {
                pre.setAttribute('data-has-long-lines', 'true');
              }
            }
          }
        });
      };

      // Ensure highlight.js and languages are loaded, then highlight
      ensureHighlightScript(() => {
        ensureHighlightLanguage('kotlin', runHighlight);
      });
      
      // Add wrap toggle buttons to code blocks with long lines
      if (global.addWrapToggleButtons) {
        setTimeout(() => global.addWrapToggleButtons(outputElement), 100);
      }

      if (katexRender) {
        katexRender(outputElement, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      }
    };

    return { render };
  }

  global.createMarkdownRenderer = createMarkdownRenderer;
})(window);
