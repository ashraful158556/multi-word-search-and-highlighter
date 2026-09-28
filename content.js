(() => {
  const STATE = {
    words: [],
    textMarks: [],
    fields: new Map(),
    fieldObserver: null,
    resizeHandler: null,
    inputHandler: null
  };

  const TEXT_MARK_CLASS = "mwh-highlight";
  const FIELD_WRAP_CLASS = "mwh-field-wrap";
  const OVERLAY_CLASS = "mwh-input-overlay";
  const FIELD_MATCH_CLASS = "mwh-field-match";

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function sortedWords(words) {
    return [...new Set(words)]
      .map(x => x.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
  }

  function regexFor(words) {
    return new RegExp(words.map(escapeRegExp).join("|"), "gi");
  }

  function isIgnoredTextNode(node) {
    const p = node.parentElement;
    if (!p) return true;

    const tag = p.closest(
      "script,style,noscript,template,svg,canvas,video,audio,iframe,select,option"
    );

    if (tag) return true;

    if (p.closest(`.${TEXT_MARK_CLASS}`)) return true;

    return false;
  }

  function clearTextMarks() {
    for (const mark of STATE.textMarks) {
      if (!mark.isConnected) continue;
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
    STATE.textMarks = [];
  }

  function highlightTextNodes() {
    const re = regexFor(STATE.words);
    if (!STATE.words.length) return;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    const nodes = [];
    let node;

    while ((node = walker.nextNode())) {
      if (!isIgnoredTextNode(node) && node.nodeValue && re.test(node.nodeValue)) {
        nodes.push(node);
      }
      re.lastIndex = 0;
    }

    for (const textNode of nodes) {
      if (!textNode.isConnected) continue;

      const text = textNode.nodeValue;
      re.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let last = 0;
      let match;

      while ((match = re.exec(text)) !== null) {
        if (match.index > last) {
          frag.appendChild(document.createTextNode(text.slice(last, match.index)));
        }

        const mark = document.createElement("mark");
        mark.className = TEXT_MARK_CLASS;
        mark.textContent = match[0];
        frag.appendChild(mark);
        STATE.textMarks.push(mark);

        last = match.index + match[0].length;
      }

      if (last < text.length) {
        frag.appendChild(document.createTextNode(text.slice(last)));
      }

      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  function fieldValue(field) {
    return field.value ?? "";
  }

  function syncOverlay(field, overlay) {
    const cs = getComputedStyle(field);

    overlay.style.left = "0px";
    overlay.style.top = "0px";
    overlay.style.width = `${field.clientWidth}px`;
    overlay.style.height = `${field.clientHeight}px`;

    overlay.style.paddingTop = cs.paddingTop;
    overlay.style.paddingRight = cs.paddingRight;
    overlay.style.paddingBottom = cs.paddingBottom;
    overlay.style.paddingLeft = cs.paddingLeft;

    overlay.style.font = cs.font;
    overlay.style.fontFamily = cs.fontFamily;
    overlay.style.fontSize = cs.fontSize;
    overlay.style.fontWeight = cs.fontWeight;
    overlay.style.fontStyle = cs.fontStyle;
    overlay.style.lineHeight = cs.lineHeight;
    overlay.style.letterSpacing = cs.letterSpacing;
    overlay.style.textAlign = cs.textAlign;
    overlay.style.textTransform = cs.textTransform;
    overlay.style.textIndent = cs.textIndent;
    overlay.style.boxSizing = "border-box";

    overlay.style.borderRadius = cs.borderRadius;

    overlay.style.whiteSpace = field.tagName === "TEXTAREA" ? "pre-wrap" : "pre";
    overlay.style.wordWrap = field.tagName === "TEXTAREA" ? "break-word" : "normal";
    overlay.style.overflowWrap = field.tagName === "TEXTAREA" ? "break-word" : "normal";

    overlay.scrollTop = field.scrollTop;
    overlay.scrollLeft = field.scrollLeft;
  }

  function buildOverlay(field) {
    if (field.type === "password") return null;

    let state = STATE.fields.get(field);

    if (state) {
      syncOverlay(field, state.overlay);
      return state.overlay;
    }

    const parent = field.parentElement;
    if (!parent) return null;

    // If already wrapped by another instance, reuse it.
    if (parent.classList.contains(FIELD_WRAP_CLASS)) {
      const existing = parent.querySelector(`.${OVERLAY_CLASS}`);
      if (existing) {
        state = { overlay: existing, originalParent: parent.parentNode, originalNext: null };
        STATE.fields.set(field, state);
        field.classList.add("mwh-transparent-text");
        return existing;
      }
    }

    const rect = field.getBoundingClientRect();
    const wrapper = document.createElement("span");
    wrapper.className = FIELD_WRAP_CLASS;

    const fieldStyle = getComputedStyle(field);
    wrapper.style.width = `${field.offsetWidth}px`;
    wrapper.style.height = `${field.offsetHeight}px`;
    wrapper.style.display = fieldStyle.display === "block" ? "block" : "inline-block";

    field.parentNode.insertBefore(wrapper, field);
    wrapper.appendChild(field);

    const overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;
    wrapper.appendChild(overlay);

    field.classList.add("mwh-transparent-text");

    state = {
      overlay,
      wrapper,
      originalParent: wrapper.parentNode,
      originalNext: null
    };

    STATE.fields.set(field, state);
    syncOverlay(field, overlay);

    return overlay;
  }

  function renderField(field) {
    const overlay = buildOverlay(field);
    if (!overlay) return 0;

    const value = fieldValue(field);
    const re = regexFor(STATE.words);

    overlay.innerHTML = "";
    re.lastIndex = 0;

    let last = 0;
    let count = 0;
    let match;

    while ((match = re.exec(value)) !== null) {
      if (match.index > last) {
        overlay.appendChild(document.createTextNode(value.slice(last, match.index)));
      }

      const mark = document.createElement("span");
      mark.className = FIELD_MATCH_CLASS;
      mark.textContent = match[0];
      overlay.appendChild(mark);

      count++;
      last = match.index + match[0].length;
    }

    if (last < value.length) {
      overlay.appendChild(document.createTextNode(value.slice(last)));
    }

    // Keep spaces visible even when the value is empty.
    if (!value) overlay.appendChild(document.createTextNode(""));

    syncOverlay(field, overlay);
    return count;
  }

  function findFields() {
    return [...document.querySelectorAll("input:not([type='password']), textarea")];
  }

  function clearFields() {
    for (const [field, state] of STATE.fields.entries()) {
      field.classList.remove("mwh-transparent-text");

      if (state.wrapper && state.wrapper.parentNode) {
        const wrapper = state.wrapper;
        const parent = wrapper.parentNode;

        // Move field out of wrapper and remove wrapper.
        parent.insertBefore(field, wrapper);
        wrapper.remove();
      } else if (state.overlay?.parentNode) {
        state.overlay.remove();
      }
    }

    STATE.fields.clear();
  }

  function clearAll() {
    if (STATE.fieldObserver) {
      STATE.fieldObserver.disconnect();
      STATE.fieldObserver = null;
    }

    if (STATE.inputHandler) {
      document.removeEventListener("input", STATE.inputHandler, true);
      document.removeEventListener("scroll", STATE.inputHandler, true);
      STATE.inputHandler = null;
    }

    if (STATE.resizeHandler) {
      window.removeEventListener("resize", STATE.resizeHandler);
      STATE.resizeHandler = null;
    }

    clearTextMarks();
    clearFields();
  }

  function observeNewFields() {
    if (STATE.fieldObserver) STATE.fieldObserver.disconnect();

    STATE.fieldObserver = new MutationObserver(() => {
      for (const field of findFields()) {
        if (!STATE.fields.has(field)) renderField(field);
      }
    });

    STATE.fieldObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function highlightAll() {
    clearAll();

    STATE.words = sortedWords(STATE.words);

    if (!STATE.words.length) return 0;

    highlightTextNodes();

    let count = STATE.textMarks.length;

    for (const field of findFields()) {
      count += renderField(field);
    }

    observeNewFields();

    STATE.inputHandler = (event) => {
      const target = event.target;

      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        if (STATE.fields.has(target)) {
          renderField(target);
        }
      }

      if (event.type === "scroll") {
        for (const [field, state] of STATE.fields.entries()) {
          syncOverlay(field, state.overlay);
        }
      }
    };

    document.addEventListener("input", STATE.inputHandler, true);
    document.addEventListener("scroll", STATE.inputHandler, true);

    STATE.resizeHandler = () => {
      for (const [field, state] of STATE.fields.entries()) {
        syncOverlay(field, state.overlay);
      }
    };

    window.addEventListener("resize", STATE.resizeHandler);

    return count;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "highlight") {
      STATE.words = Array.isArray(message.words) ? message.words : [];
      const count = highlightAll();
      sendResponse({ count });
      return true;
    }

    if (message.action === "clear") {
      const count = STATE.textMarks.length + STATE.fields.size;
      clearAll();
      STATE.words = [];
      sendResponse({ count });
      return true;
    }
  });
})();