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
      const normalized = normalizeLatexDelimiters(source || '');
      outputElement.innerHTML = md.render(normalized);

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
