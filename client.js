window.__ModuleLoader__.load({
  id: 'dsh-aside',
  factory(require) {
    const React = require('react');
    const {
      createElement: h,
      useCallback,
      useEffect,
      useMemo,
      useRef,
      useState,
      useSyncExternalStore,
    } = React;

    // The Client mounts its own wire declaration: same identity and strict codecs
    // as lib/typert.js, rebuilt here because a raw client module cannot import the
    // Host half. `zod` comes from the browser module table.
    function wireInvocation(method, requestType, requestSchema, resultType, resultSchema, options = {}) {
      return {
        id: `dsh-aside#aside/${method}`,
        service: 'aside',
        namespace: 'aside',
        method,
        implementation: method,
        invocation: { kind: 'direct' },
        ...(options.stream ? { mode: 'stream' } : {}),
        ...(options.cancellation ? { cancellation: { parameter: 'signal' } } : {}),
        parameters: [{
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: `dsh-aside/remote#${requestType}`, create: () => requestSchema },
        }],
        result: { mode: 'strict', typeSymbol: `dsh-aside/remote#${resultType}`, create: () => resultSchema },
        sourceLocation: { file: 'lib/typert.js', line: 1, column: 1 },
      };
    }

    function wireRemote(zod) {
      const id = zod.string().min(1).max(512);
      const wireError = zod.strictObject({ code: zod.string(), message: zod.string(), recoverable: zod.boolean() });
      const envelope = shape => zod.union([
        zod.strictObject({ ok: zod.literal(true), value: shape }),
        zod.strictObject({ ok: zod.literal(false), error: wireError }),
      ]);
      const modelSelection = zod.strictObject({ provider: id, model: id, reasoningEffort: id.optional() });
      const createRequest = zod.strictObject({
        parentSessionId: id,
        atSeq: zod.number().int().nonnegative(),
        selectedText: zod.string().max(16384).optional(),
        modelSelection: modelSelection.optional(),
      });
      const createValue = zod.strictObject({
        chatId: id,
        boundarySeq: zod.number().int().nonnegative(),
        modelSelection,
      });
      const streamRequest = zod.strictObject({ chatId: id, requestId: id, text: zod.string().min(1).max(65536) });
      const streamEvent = zod.union([
        zod.strictObject({ type: zod.literal('started'), requestId: id }),
        zod.strictObject({ type: zod.literal('content'), text: zod.string(), reasoning: zod.string() }),
        zod.strictObject({ type: zod.literal('finished'), status: zod.enum(['complete', 'stopped']) }),
        zod.strictObject({ type: zod.literal('error'), error: wireError }),
      ]);
      const chatRequest = zod.strictObject({ chatId: id });
      return {
        package: 'dsh-aside',
        descriptors: [
          wireInvocation('create', 'CreateRequest', createRequest, 'CreateResult', envelope(createValue), { cancellation: true }),
          wireInvocation('stream', 'StreamRequest', streamRequest, 'StreamEvent', streamEvent, { stream: true, cancellation: true }),
          wireInvocation('cancel', 'ChatRequest', chatRequest, 'CancelResult', envelope(zod.strictObject({ cancelled: zod.literal(true) }))),
          wireInvocation('close', 'ChatRequest', chatRequest, 'CloseResult', envelope(zod.strictObject({ closed: zod.literal(true) }))),
        ],
      };
    }

    const SOURCE = 'aside-annotations';
    const CHIP_LABEL = '__dsh_aside_annotations__';
    const PAYLOAD_VERSION = 1;
    const MAX_SELECTION_CHARS = 16384;
    const HIGHLIGHT_ALL = 'dsh-aside-annotation';
    const HIGHLIGHT_ACTIVE = 'dsh-aside-active';
    const GAP = 8;
    const BAR_HEIGHT = 36;
    const BAR_WIDTH = 320;

    const CSS = `
.dsh-aside-bar{position:fixed;z-index:80;display:flex;align-items:center;gap:2px;height:${BAR_HEIGHT}px;padding:3px;border-radius:10px;
  background:var(--dsh-surface-raised,color-mix(in srgb, Canvas 92%, CanvasText 8%));color:inherit;
  border:1px solid var(--dsh-border-subtle,rgba(127,127,127,.28));box-shadow:0 8px 24px rgba(0,0,0,.16);
  font:500 12.5px/1.2 var(--dsh-font-family,system-ui,sans-serif);white-space:nowrap}
.dsh-aside-bar button{all:unset;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px;border-radius:7px;cursor:pointer}
.dsh-aside-bar button:hover,.dsh-aside-bar button:focus-visible{background:color-mix(in srgb, currentColor 10%, transparent)}
.dsh-aside-bar svg{width:15px;height:15px;flex:none;opacity:.85}
.dsh-aside-editor{position:relative;z-index:81;width:320px;display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:12px;
  background:var(--dsh-surface-raised,color-mix(in srgb, Canvas 95%, CanvasText 5%));border:1px solid var(--dsh-border-subtle,rgba(127,127,127,.28));
  box-shadow:0 12px 32px rgba(0,0,0,.2);font:400 13px/1.45 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-aside-editor-quote{max-height:96px;overflow:auto;padding:6px 8px;border-radius:8px;font-size:12px;opacity:.75;
  background:color-mix(in srgb, currentColor 6%, transparent);white-space:pre-wrap}
.dsh-aside-editor textarea{resize:none;min-height:68px;padding:7px 8px;border-radius:8px;font:inherit;color:inherit;
  background:transparent;border:1px solid var(--dsh-border-subtle,rgba(127,127,127,.3));outline:none}
.dsh-aside-editor textarea:focus{border-color:var(--dsh-accent,#3b82f6)}
.dsh-aside-editor-actions{display:flex;align-items:center;gap:6px}
.dsh-aside-editor-actions .dsh-aside-spacer{flex:1}
.dsh-aside-button{all:unset;display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:7px;cursor:pointer;
  font:500 12.5px/1 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-aside-button:hover{background:color-mix(in srgb, currentColor 9%, transparent)}
.dsh-aside-button-primary{background:var(--dsh-accent,#3b82f6);color:#fff}
.dsh-aside-button-primary:hover{background:color-mix(in srgb, var(--dsh-accent,#3b82f6) 88%, #fff)}
.dsh-aside-button-danger{color:#dc2626}
.dsh-aside-marker{position:fixed;z-index:70;display:grid;place-items:center;width:18px;height:18px;border-radius:99px;
  background:var(--dsh-accent,#3b82f6);color:#fff;font:600 10.5px/1 var(--dsh-font-family,system-ui,sans-serif);
  cursor:pointer;border:none;box-shadow:0 2px 6px rgba(0,0,0,.2);padding:0}
.dsh-aside-marker:focus-visible{outline:2px solid color-mix(in srgb, var(--dsh-accent,#3b82f6) 45%, #fff);outline-offset:1px}
.dsh-aside-dock{display:flex;flex-direction:column;gap:6px;margin:0 0 6px}
.dsh-aside-capsule{display:inline-flex;align-items:center;gap:8px;height:30px;max-width:100%;width:fit-content;padding:0 10px;
  border-radius:9px;cursor:pointer;font:500 12.5px/1 var(--dsh-font-family,system-ui,sans-serif);color:inherit;
  background:color-mix(in srgb, var(--dsh-accent,#3b82f6) 12%, transparent);
  border:1px solid color-mix(in srgb, var(--dsh-accent,#3b82f6) 32%, transparent)}
.dsh-aside-capsule:hover{background:color-mix(in srgb, var(--dsh-accent,#3b82f6) 18%, transparent)}
.dsh-aside-capsule-count{display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:99px;
  background:var(--dsh-accent,#3b82f6);color:#fff;font-size:10.5px;font-weight:600}
.dsh-aside-list{display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto;
  padding:8px;border-radius:10px;background:color-mix(in srgb, currentColor 4%, transparent);
  border:1px solid var(--dsh-border-subtle,rgba(127,127,127,.24))}
.dsh-aside-list-row{display:flex;gap:8px;align-items:flex-start;padding:6px;border-radius:8px;cursor:pointer}
.dsh-aside-list-row:hover{background:color-mix(in srgb, currentColor 6%, transparent)}
.dsh-aside-list-row .dsh-aside-list-index{display:grid;place-items:center;width:18px;height:18px;border-radius:99px;flex:none;
  background:var(--dsh-accent,#3b82f6);color:#fff;font:600 10.5px/1 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-aside-list-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.dsh-aside-list-quote{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:12px;opacity:.85}
.dsh-aside-list-comment{font-size:12px;opacity:.62;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.dsh-aside-list-row button{all:unset;flex:none;font-size:11.5px;opacity:.6;cursor:pointer;padding:2px 4px;border-radius:5px}
.dsh-aside-list-row button:hover{opacity:1;background:color-mix(in srgb, currentColor 10%, transparent)}
.dsh-aside-message{display:flex;flex-direction:column;gap:8px;min-width:0}
.dsh-aside-message-body{min-width:0}
.dsh-aside-card{border:1px solid var(--dsh-border-subtle,rgba(127,127,127,.26));border-radius:10px;overflow:hidden;
  font:400 12.5px/1.45 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-aside-card-head{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;cursor:pointer}
.dsh-aside-card-head:hover{background:color-mix(in srgb, currentColor 5%, transparent)}
.dsh-aside-card-head .dsh-aside-card-count{display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:99px;
  background:var(--dsh-accent,#3b82f6);color:#fff;font:600 10.5px/1 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-aside-card-head .dsh-aside-card-chevron{margin-left:auto;opacity:.5;font-size:11px}
.dsh-aside-card-body{display:flex;flex-direction:column;gap:8px;padding:0 10px 10px}
.dsh-aside-card-item{display:flex;gap:8px;padding-top:8px;border-top:1px solid var(--dsh-border-subtle,rgba(127,127,127,.18))}
.dsh-aside-card-item-index{flex:none;display:grid;place-items:center;width:18px;height:18px;border-radius:99px;
  background:color-mix(in srgb, var(--dsh-accent,#3b82f6) 16%, transparent);font-size:10.5px;font-weight:600}
.dsh-aside-card-item-text{display:flex;flex-direction:column;gap:3px;min-width:0}
.dsh-aside-card-item-quote{margin:0;padding-left:8px;border-left:2px solid color-mix(in srgb, var(--dsh-accent,#3b82f6) 45%, transparent);
  white-space:pre-wrap;opacity:.85}
.dsh-aside-card-item-comment{white-space:pre-wrap;opacity:.7;font-size:12px}
.dsh-aside-panel{display:flex;flex-direction:column;height:100%;min-height:0;font:400 13px/1.5 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-aside-panel-quote{flex:none;margin:10px 12px 0;padding:8px 10px;border-radius:9px;max-height:120px;overflow:auto;white-space:pre-wrap;
  font-size:12px;opacity:.8;background:color-mix(in srgb, var(--dsh-accent,#3b82f6) 9%, transparent);
  border:1px solid color-mix(in srgb, var(--dsh-accent,#3b82f6) 24%, transparent)}
.dsh-aside-panel-log{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:12px}
.dsh-aside-panel-empty{margin:auto;text-align:center;font-size:12.5px;opacity:.6;padding:24px}
.dsh-aside-turn{display:flex;flex-direction:column;gap:4px}
.dsh-aside-turn-role{font-size:11px;opacity:.55;letter-spacing:.02em}
.dsh-aside-turn-question{white-space:pre-wrap;padding:8px 10px;border-radius:9px;font-size:12.5px;
  background:color-mix(in srgb, currentColor 7%, transparent)}
.dsh-aside-turn-answer{white-space:pre-wrap}
.dsh-aside-panel-error{flex:none;margin:0 12px;padding:7px 9px;border-radius:8px;font-size:12px;color:#dc2626;
  background:color-mix(in srgb, #dc2626 10%, transparent)}
.dsh-aside-panel-composer{flex:none;display:flex;flex-direction:column;gap:6px;padding:10px 12px 12px;border-top:1px solid var(--dsh-border-subtle,rgba(127,127,127,.2))}
.dsh-aside-panel-composer textarea{resize:none;min-height:62px;max-height:180px;padding:8px 9px;border-radius:9px;font:inherit;color:inherit;
  background:transparent;border:1px solid var(--dsh-border-subtle,rgba(127,127,127,.3));outline:none}
.dsh-aside-panel-composer textarea:focus{border-color:var(--dsh-accent,#3b82f6)}
.dsh-aside-panel-actions{display:flex;align-items:center;gap:8px;font-size:11.5px;opacity:.75}
.dsh-aside-panel-actions .dsh-aside-spacer{flex:1}
.dsh-aside-model{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-aside-panel-actions .dsh-aside-button{opacity:1}
[data-composer-chip="aside-annotations"]{display:inline-block!important;width:0!important;height:0!important;overflow:hidden!important;
  opacity:0!important;pointer-events:none!important;vertical-align:baseline!important}
::highlight(${HIGHLIGHT_ALL}){background-color:color-mix(in srgb, #3b82f6 24%, transparent)}
::highlight(${HIGHLIGHT_ACTIVE}){background-color:color-mix(in srgb, #3b82f6 44%, transparent)}
`;

    const MESSAGES = {
      zh: {
        add: '添加到对话', ask: '在侧边聊天中提问', annotations: '条注释', quote: '所选文本',
        commentPlaceholder: '补充说明（可选）', cancel: '取消', save: '保存', remove: '删除',
        clearAll: '清除全部', aside: '旁注讨论', empty: '这段对话是临时的，只用于讨论所选内容。',
        inputPlaceholder: '就所选内容提问…', send: '发送', stop: '停止', thinking: '思考中…',
        inherited: '使用主会话模型', close: '关闭', thinkingLabel: '思考',
      },
      en: {
        add: 'Add to chat', ask: 'Ask in side chat', annotations: 'annotations', quote: 'Selected text',
        commentPlaceholder: 'Add a note (optional)', cancel: 'Cancel', save: 'Save', remove: 'Remove',
        clearAll: 'Clear all', aside: 'Aside', empty: 'This discussion is temporary and only sees the selected passage.',
        inputPlaceholder: 'Ask about this passage…', send: 'Send', stop: 'Stop', thinking: 'Thinking…',
        inherited: 'Using the parent model', close: 'Close', thinkingLabel: 'Reasoning',
      },
    };

    function currentLocale() {
      try {
        const lang = (document.documentElement.lang || navigator.language || 'en').toLowerCase();
        return lang.startsWith('zh') ? 'zh' : 'en';
      } catch {
        return 'en';
      }
    }

    // ---------------------------------------------------------------- pure logic

    function clamp(value, min, max) {
      if (max < min) return min;
      return Math.min(Math.max(value, min), max);
    }

    function normalizeText(text) {
      return text.replace(/\r\n?/gu, '\n');
    }

    function escapeXmlText(value) {
      return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    }

    function unescapeXmlText(value) {
      return value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
    }

    function serializeAnnotations(annotations) {
      return [
        '<aside_context>',
        ...annotations.flatMap((annotation, index) => [
          `<annotation index="${String(index + 1)}">`,
          '<selected_text>', escapeXmlText(annotation.text), '</selected_text>',
          ...(annotation.comment === undefined ? [] : ['<user_comment>', escapeXmlText(annotation.comment), '</user_comment>']),
          '</annotation>',
        ]),
        '</aside_context>',
      ].join('\n');
    }

    const ASIDE_PREFIX = /^\s*<aside_context(?:\s[^>]*)?>\r?\n([\s\S]*?)\r?\n<\/aside_context>\s*/u;

    function parseAsideContext(text) {
      const prefix = ASIDE_PREFIX.exec(text);
      if (prefix === null) return undefined;
      const annotations = [];
      for (const match of prefix[1].matchAll(/<annotation(?: index="\d+")?>\r?\n([\s\S]*?)\r?\n<\/annotation>/gu)) {
        const body = match[1] ?? '';
        const parts = /^<selected_text>\r?\n([\s\S]*?)\r?\n<\/selected_text>(?:\r?\n<user_comment>\r?\n([\s\S]*?)\r?\n<\/user_comment>)?$/u.exec(body);
        annotations.push({
          text: unescapeXmlText(parts?.[1] ?? body),
          ...(parts?.[2] === undefined ? {} : { comment: unescapeXmlText(parts[2]) }),
        });
      }
      if (annotations.length === 0) return undefined;
      return { annotations, message: text.slice(prefix[0].length).trim() };
    }

    function chipPayload(sessionId, annotations) {
      return { version: PAYLOAD_VERSION, sessionId, annotations };
    }

    function decodeChip(ref) {
      let payload;
      try {
        payload = JSON.parse(ref);
      } catch {
        return;
      }
      if (payload === null || typeof payload !== 'object' || payload.version !== PAYLOAD_VERSION
        || !Array.isArray(payload.annotations)) {
        return;
      }
      const annotations = payload.annotations.filter((value) => value !== null && typeof value === 'object'
        && typeof value.text === 'string' && (value.comment === undefined || typeof value.comment === 'string'));
      if (annotations.length !== payload.annotations.length) return;
      return { sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined, annotations };
    }

    function occurrenceInDraft(snapshot, occurrence, label = occurrence.label) {
      const { offset, length } = occurrence;
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
        || offset < 0 || length <= 0 || offset + length > snapshot.draft.length
        || label !== occurrence.label
        || snapshot.draft.slice(offset, offset + length) !== occurrence.clipboardText) {
        return;
      }
      return { start: offset, end: offset + length };
    }

    /** Convert the chip's draft character range into the editor's atomic span. */
    function occurrenceEditSpan(snapshot, occurrence) {
      const range = occurrenceInDraft(snapshot, occurrence);
      if (range === undefined) return;
      let start = range.start;
      for (const previous of snapshot.occurrences) {
        if (previous.offset >= occurrence.offset) continue;
        if (occurrenceInDraft(snapshot, previous) === undefined
          || previous.offset + previous.length > occurrence.offset) {
          return;
        }
        start -= previous.length - 1;
      }
      return { start, end: start + 1, draftRev: snapshot.draftRev };
    }

    function readAnnotations(snapshot) {
      if (snapshot === undefined) return [];
      const occurrences = snapshot.occurrences.filter(occurrence => occurrence.source === SOURCE);
      const result = [];
      for (const occurrence of occurrences) {
        const decoded = decodeChip(occurrence.ref);
        if (decoded === undefined) continue;
        for (const annotation of decoded.annotations) {
          result.push({ ...annotation, sessionId: decoded.sessionId });
        }
      }
      return result;
    }

    function writeAnnotations(input, annotations) {
      if (input === undefined) return false;
      const before = input.state.getSnapshot();
      const existing = before.occurrences.filter(occurrence => occurrence.source === SOURCE);
      if (existing.length > 1) return false;
      const previous = existing[0];
      const span = previous === undefined
        ? { start: 0, end: 0, draftRev: before.draftRev }
        : occurrenceEditSpan(before, previous);
      if (span === undefined) return false;
      if (annotations.length === 0) {
        if (previous === undefined) return true;
        const removal = occurrenceEditSpan(before, previous);
        return removal !== undefined && input.replaceText('', removal);
      }
      const ref = JSON.stringify(chipPayload(annotations[0]?.sessionId, annotations.map(annotation => ({
        text: annotation.text,
        ...(annotation.comment === undefined ? {} : { comment: annotation.comment }),
        ...(annotation.anchor === undefined ? {} : { anchor: annotation.anchor }),
      }))));
      return input.insertReference({
        source: SOURCE,
        ref,
        label: CHIP_LABEL,
        clipboardText: annotations.map(annotation => annotation.text).join('\n\n'),
      }, span) === true;
    }

    /** Place a floating control above the selection, or below when there is no room. */
    function placeFloating(rect, size, bounds) {
      const width = size.width ?? 0;
      const height = size.height ?? BAR_HEIGHT;
      const fitsAbove = rect.top - height - GAP >= bounds.top + 4;
      const top = fitsAbove ? rect.top - height - GAP : rect.bottom + GAP;
      const maxTop = Math.max(bounds.top + 4, bounds.bottom - height - 4);
      return {
        placement: fitsAbove ? 'above' : 'below',
        top: clamp(top, bounds.top + 4, maxTop),
        left: clamp(rect.left, bounds.left + 8, Math.max(bounds.left + 8, bounds.right - width - 8)),
      };
    }

    // ------------------------------------------------------------------- services

    function createAccess(ctx) {
      const faces = new WeakMap();
      const inputs = new WeakMap();

      const mainSessionId = () => {
        const byId = ctx.sessions.list.getSnapshot().byId;
        for (const [id, summary] of Object.entries(byId)) {
          if ((summary.retainedBy?.mainView ?? 0) > 0) return id;
        }
      };

      const chatFor = (id) => {
        const source = ctx.sessions.binding(id)?.session;
        if (source === undefined) return;
        const existing = faces.get(source);
        if (existing !== undefined) return existing;
        const conversation = ctx.uiConversation.binding(source.sessionId);
        conversation.activate('chat');
        const chat = conversation.target('chat');
        const face = {
          subscribe: listener => chat.subscribe(listener),
          getSnapshot: () => {
            const snapshot = chat.getSnapshot();
            if (snapshot === undefined) return { nodes: new Map(), turnEnds: new Map() };
            return { nodes: snapshot.nodes, turnEnds: snapshot.legacy?.turnEnds ?? new Map() };
          },
        };
        faces.set(source, face);
        return face;
      };

      const inputFor = (id) => {
        const scope = ctx.sessions.scope(id);
        if (scope === undefined) return;
        const source = ctx.conversation.input.for(scope);
        if (source === undefined) return;
        const existing = inputs.get(source);
        if (existing !== undefined) return existing;
        const input = {
          state: source.state,
          insertReference: (reference, span) => source.insertReference(reference, span),
          replaceText: (text, span) => scope.bail(scope, 'slash/input-insert-text', { text, span }) === true,
          notify: (level, text) => source.notify?.(level, text),
        };
        inputs.set(source, input);
        return input;
      };

      return {
        mainSessionId,
        chatFor,
        currentSessionId: mainSessionId,
        currentChat() {
          const id = mainSessionId();
          return id === undefined ? undefined : chatFor(id);
        },
        currentInput() {
          const id = mainSessionId();
          return id === undefined ? undefined : inputFor(id);
        },
        currentAnnotations() {
          const input = this.currentInput();
          return input === undefined ? [] : readAnnotations(input.state.getSnapshot());
        },
        subscribeInput(listener) {
          let bound;
          let remove = () => {};
          const bind = () => {
            const input = this.currentInput();
            if (input === bound) return;
            remove();
            bound = input;
            remove = input?.state.subscribe(listener) ?? (() => {});
          };
          bind();
          const offList = ctx.sessions.list.subscribe(() => { bind(); listener(); });
          return () => { offList(); remove(); };
        },
      };
    }

    function chatDescriptor(chat, nodeKey) {
      const snapshot = chat?.getSnapshot();
      const node = snapshot?.nodes?.get(nodeKey);
      if (node === undefined || node.visibility !== 'visible') return;
      const source = node.kind === 'user' || node.kind === 'steering' ? 'user'
        : node.kind === 'assistant-step' ? 'assistant' : node.kind === 'context' ? 'context' : undefined;
      if (source === undefined) return;
      const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn.turn : undefined;
      if (turn === undefined) return;
      const settled = node.location.kind === 'turn' ? node.location.turn.status === 'closed'
        : node.location.kind === 'step' ? node.location.turn.status === 'closed' && node.location.step.status === 'closed'
          : false;
      return { nodeKey: node.key, nodeKind: node.kind, turnKey: `turn:${String(turn)}`, seq: node.anchorSeq, source, settled };
    }

    // -------------------------------------------------------------- DOM selection

    function elementOf(node) {
      if (node === null) return;
      return node.nodeType === 1 ? node : node.parentElement;
    }

    function chatHostOf(node) {
      return elementOf(node)?.closest('[data-chat-anchor-key]');
    }

    function textNodesOf(host) {
      const nodes = [];
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      for (let cell = walker.nextNode(); cell !== null; cell = walker.nextNode()) {
        const parent = cell.parentElement;
        if (parent === null) continue;
        if (parent.closest('[data-aside-skip],button,[role="button"],[aria-hidden="true"]') !== null) continue;
        nodes.push(cell);
      }
      return nodes;
    }

    function offsetsOf(host, range) {
      let start;
      let end;
      let total = 0;
      for (const node of textNodesOf(host)) {
        if (node === range.startContainer) start = total + range.startOffset;
        if (node === range.endContainer) end = total + range.endOffset;
        if (start !== undefined && end !== undefined) break;
        total += node.nodeValue?.length ?? 0;
      }
      if (start === undefined || end === undefined || end <= start) return;
      return { start, end };
    }

    function rangeOfAnchor(host, anchor) {
      const nodes = textNodesOf(host);
      let total = 0;
      let startNode;
      let startOffset;
      let endNode;
      let endOffset;
      for (const node of nodes) {
        const length = node.nodeValue?.length ?? 0;
        if (startNode === undefined && anchor.startOffset >= total && anchor.startOffset <= total + length) {
          startNode = node;
          startOffset = anchor.startOffset - total;
        }
        if (anchor.endOffset >= total && anchor.endOffset <= total + length) {
          endNode = node;
          endOffset = anchor.endOffset - total;
        }
        total += length;
      }
      if (startNode === undefined || endNode === undefined) return;
      const range = document.createRange();
      try {
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
      } catch {
        return;
      }
      return range;
    }

    function rootOfAnchor(nodeKey) {
      for (const root of document.querySelectorAll('[data-conversation-session]')) {
        const host = root.querySelector(`[data-chat-anchor-key="${CSS.escape(nodeKey)}"]`);
        if (host !== null) return { root, host };
      }
    }

    function captureSelection(chat) {
      const selection = window.getSelection();
      if (selection === null || selection.isCollapsed || selection.rangeCount !== 1) return;
      const range = selection.getRangeAt(0);
      const startHost = chatHostOf(range.startContainer);
      const endHost = chatHostOf(range.endContainer);
      if (startHost === null || startHost !== endHost) return;
      const text = normalizeText(selection.toString());
      if (text.trim().length === 0 || text.length > MAX_SELECTION_CHARS) return;
      const nodeKey = startHost.getAttribute('data-chat-anchor-key');
      if (nodeKey === null) return;
      const descriptor = chatDescriptor(chat, nodeKey);
      if (descriptor === undefined || !descriptor.settled) return;
      const offsets = offsetsOf(startHost, range);
      if (offsets === undefined) return;
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0 || rect.height > 0);
      if (rects.length === 0) return;
      const bounds = rects.reduce((acc, rect) => ({
        left: Math.min(acc.left, rect.left),
        top: Math.min(acc.top, rect.top),
        right: Math.max(acc.right, rect.right),
        bottom: Math.max(acc.bottom, rect.bottom),
      }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
      return {
        text,
        anchor: { ...descriptor, startOffset: offsets.start, endOffset: offsets.end },
        rect: bounds,
        range: range.cloneRange(),
      };
    }

    function readBounds() {
      const scroll = document.querySelector('[data-conversation-scroll]');
      const seat = document.querySelector('[data-composer-seat]');
      const top = scroll === null ? 0 : scroll.getBoundingClientRect().top;
      const bottom = seat === null ? window.innerHeight : seat.getBoundingClientRect().top;
      return { top: Math.max(top, 0), bottom: Math.min(bottom, window.innerHeight), left: 0, right: window.innerWidth };
    }

    // ---------------------------------------------------------------- components

    function useAnnotations(access) {
      const subscribe = useCallback(listener => access.subscribeInput(listener), [access]);
      const snapshot = useSyncExternalStore(subscribe, () => access.currentInput()?.state.getSnapshot());
      return useMemo(() => readAnnotations(snapshot), [snapshot]);
    }

    function IconQuote() {
      return h('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true },
        h('path', { d: 'M3 3.5h10M3 8h6.5M3 12.5h8' }));
    }

    function IconAsk() {
      return h('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true },
        h('path', { d: 'M13.5 8A5.5 5.5 0 1 1 8 2.5H13.5V8Z' }), h('path', { d: 'M8.2 6.1h1.6' }));
    }

    function AnnotationEditor({ locale, draft, anchor, initialComment, onSave, onCancel, onRemove }) {
      const messages = MESSAGES[locale];
      const [comment, setComment] = useState(initialComment ?? '');
      const areaRef = useRef(null);
      const save = () => onSave(comment.trim() === '' ? undefined : comment.trim());
      useEffect(() => {
        areaRef.current?.focus();
        areaRef.current?.setSelectionRange(areaRef.current.value.length, areaRef.current.value.length);
      }, []);
      return h('div', {
        className: 'dsh-aside-editor',
        role: 'dialog',
        'aria-label': messages.add,
        onKeyDown: (event) => {
          if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
          else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); save(); }
        },
      },
        h('div', { className: 'dsh-aside-editor-quote' }, draft.slice(0, 300)),
        h('textarea', {
          ref: areaRef,
          value: comment,
          placeholder: messages.commentPlaceholder,
          'aria-label': messages.commentPlaceholder,
          onChange: event => setComment(event.target.value),
        }),
        h('div', { className: 'dsh-aside-editor-actions' },
          onRemove === undefined ? null : h('button', { type: 'button', className: 'dsh-aside-button dsh-aside-button-danger', onClick: onRemove }, messages.remove),
          h('span', { className: 'dsh-aside-spacer' }),
          h('button', { type: 'button', className: 'dsh-aside-button', onClick: onCancel }, messages.cancel),
          h('button', { type: 'button', className: 'dsh-aside-button dsh-aside-button-primary', onClick: save }, messages.save),
        ),
      );
    }

    function AsideDock({ access, locale, onEdit }) {
      const messages = MESSAGES[locale];
      const annotations = useAnnotations(access);
      const [expanded, setExpanded] = useState(false);
      useEffect(() => {
        if (annotations.length === 0 && expanded) setExpanded(false);
      }, [annotations.length, expanded]);
      if (annotations.length === 0) return null;
      const remove = (index) => {
        const input = access.currentInput();
        if (input === undefined) return;
        const next = access.currentAnnotations().filter((_, position) => position !== index);
        writeAnnotations(input, next);
      };
      return h('div', { className: 'dsh-aside-dock', 'data-aside-skip': '' },
        h('button', {
          type: 'button',
          className: 'dsh-aside-capsule',
          'aria-expanded': expanded,
          onClick: () => setExpanded(value => !value),
        },
          h('span', { className: 'dsh-aside-capsule-count' }, String(annotations.length)),
          h('span', null, `${String(annotations.length)} ${messages.annotations}`),
          h('span', { style: { fontSize: '10px', opacity: 0.6 } }, expanded ? '▾' : '▸'),
        ),
        expanded ? h('div', { className: 'dsh-aside-list', role: 'list' }, annotations.map((annotation, index) => h('div', {
          key: `aside-${String(index)}`,
          role: 'listitem',
          className: 'dsh-aside-list-row',
          onClick: () => onEdit(index),
          onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEdit(index); } },
          tabIndex: 0,
        },
          h('span', { className: 'dsh-aside-list-index' }, String(index + 1)),
          h('span', { className: 'dsh-aside-list-text' },
            h('span', { className: 'dsh-aside-list-quote' }, annotation.text),
            annotation.comment === undefined ? null : h('span', { className: 'dsh-aside-list-comment' }, annotation.comment),
          ),
          h('button', {
            type: 'button',
            onClick: (event) => { event.stopPropagation(); remove(index); },
          }, messages.remove),
        ))) : null,
      );
    }

    function AsideMessages({ annotations, locale }) {
      const [expanded, setExpanded] = useState(false);
      const messages = MESSAGES[locale];
      if (annotations.length === 0) return null;
      return h('div', { className: 'dsh-aside-card', 'data-aside-skip': '' },
        h('button', { type: 'button', className: 'dsh-aside-card-head', 'aria-expanded': expanded, onClick: () => setExpanded(value => !value) },
          h('span', { className: 'dsh-aside-card-count' }, String(annotations.length)),
          h('span', null, `${String(annotations.length)} ${messages.annotations}`),
          h('span', { className: 'dsh-aside-card-chevron' }, expanded ? '▾' : '▸'),
        ),
        expanded ? h('div', { className: 'dsh-aside-card-body' }, annotations.map((annotation, index) => h('div', {
          key: `aside-card-${String(index)}`,
          className: 'dsh-aside-card-item',
        },
          h('span', { className: 'dsh-aside-card-item-index' }, String(index + 1)),
          h('div', { className: 'dsh-aside-card-item-text' },
            h('blockquote', { className: 'dsh-aside-card-item-quote' }, annotation.text),
            annotation.comment === undefined ? null : h('div', { className: 'dsh-aside-card-item-comment' }, annotation.comment),
          ),
        ))) : null,
      );
    }

    function contentText(content) {
      return content.map((block) => {
        if (typeof block !== 'object' || block === null) return '';
        return block.type === 'text' && typeof block.text === 'string' ? block.text : '';
      }).join('');
    }

    function replaceTextContent(content, message) {
      let replaced = false;
      const next = content.flatMap((block) => {
        if (typeof block !== 'object' || block === null) return [block];
        if (block.type !== 'text' || typeof block.text !== 'string') return [block];
        if (replaced) return [];
        replaced = true;
        return [{ ...block, text: message }];
      });
      return replaced ? next : [{ type: 'text', text: message }, ...next];
    }

    function annotatedRenderer(Original, locale) {
      return function AsideUserMessage(props) {
        const parsed = parseAsideContext(contentText(props.node.data.content));
        if (parsed === undefined) return h(Original, props);
        const node = {
          ...props.node,
          data: { ...props.node.data, content: replaceTextContent(props.node.data.content, parsed.message) },
        };
        return h('div', { className: 'dsh-aside-message' },
          h(AsideMessages, { annotations: parsed.annotations, locale }),
          h('div', { className: 'dsh-aside-message-body' }, h(Original, { ...props, node })),
        );
      };
    }

    function AsidePanel({ ctx, access, locale, params }) {
      const messages = MESSAGES[locale];
      const [messagesState, setMessagesState] = useState(() => ({
        chatId: undefined, model: undefined, entries: [], status: 'idle', error: undefined,
      }));
      const [draft, setDraft] = useState('');
      const [stopping, setStopping] = useState(false);
      const stateRef = useRef(messagesState);
      stateRef.current = messagesState;
      const listRef = useRef(null);

      const patch = useCallback((next) => {
        setMessagesState((current) => {
          const merged = { ...current, ...next };
          stateRef.current = merged;
          return merged;
        });
      }, []);

      useEffect(() => {
        if (listRef.current !== null) listRef.current.scrollTop = listRef.current.scrollHeight;
      }, [messagesState.entries, messagesState.status]);

      useEffect(() => () => {
        const chatId = stateRef.current.chatId;
        if (chatId !== undefined) void services.close(chatId);
      }, []);

      const stream = async (requestId, chatId, text) => {
        try {
          for await (const event of await services.stream({ chatId, requestId, text })) {
            if (event.type === 'started') continue;
            if (event.type === 'content') {
              setMessagesState((current) => {
                const entries = [...current.entries];
                const last = entries[entries.length - 1];
                if (last !== undefined && last.pending === true) entries[entries.length - 1] = { ...last, text: event.text, reasoning: event.reasoning };
                const merged = { ...current, entries };
                stateRef.current = merged;
                return merged;
              });
              continue;
            }
            if (event.type === 'finished') {
              setMessagesState((current) => {
                const entries = [...current.entries];
                const last = entries[entries.length - 1];
                if (last !== undefined && last.pending === true) entries[entries.length - 1] = { ...last, pending: false };
                const merged = { ...current, entries, status: 'idle' };
                stateRef.current = merged;
                return merged;
              });
              continue;
            }
            if (event.type === 'error') {
              patch({ status: 'idle', error: event.error.message });
            }
          }
        } catch (cause) {
          patch({ status: 'idle', error: cause instanceof Error ? cause.message : String(cause) });
        }
      };

      const ensureChat = async () => {
        if (stateRef.current.chatId !== undefined) return stateRef.current.chatId;
        if (params.sessionId === undefined || params.atSeq === undefined) {
          patch({ error: 'The selection is not attached to a completed turn.' });
          return;
        }
        const created = await services.create({
          parentSessionId: params.sessionId,
          atSeq: params.atSeq,
          ...(params.text === undefined ? {} : { selectedText: params.text }),
        });
        if (!created.ok) {
          patch({ error: created.error.message });
          return;
        }
        patch({ chatId: created.value.chatId, model: created.value.modelSelection });
        return created.value.chatId;
      };

      const send = async () => {
        const text = draft.trim();
        if (text.length === 0 || stateRef.current.status === 'streaming') return;
        const chatId = await ensureChat();
        if (chatId === undefined) return;
        const requestId = crypto.randomUUID();
        setDraft('');
        patch({
          status: 'streaming',
          error: undefined,
          entries: [...stateRef.current.entries, { role: 'user', text }, { role: 'assistant', text: '', pending: true }],
        });
        void stream(requestId, chatId, text);
      };

      const stop = async () => {
        const chatId = stateRef.current.chatId;
        if (chatId === undefined) return;
        setStopping(true);
        await services.cancel(chatId);
        setStopping(false);
      };

      const entries = messagesState.entries;
      return h('div', { className: 'dsh-aside-panel' },
        params.text === undefined ? null : h('div', { className: 'dsh-aside-panel-quote' }, `${messages.quote}：${params.text}`),
        h('div', { className: 'dsh-aside-panel-log', ref: listRef },
          entries.length === 0
            ? h('div', { className: 'dsh-aside-panel-empty' }, messages.empty)
            : entries.map((entry, index) => h('div', {
              key: `aside-turn-${String(index)}`,
              className: 'dsh-aside-turn',
            },
              entry.role === 'user'
                ? h(React.Fragment, null,
                  h('span', { className: 'dsh-aside-turn-role' }, 'You'),
                  h('div', { className: 'dsh-aside-turn-question' }, entry.text))
                : h(React.Fragment, null,
                  h('span', { className: 'dsh-aside-turn-role' }, entry.pending === true ? messages.thinking : 'Aside'),
                  h('div', { className: 'dsh-aside-turn-answer' }, entry.text.length === 0 && entry.pending === true ? '…' : entry.text)),
            )),
        ),
        messagesState.error === undefined ? null : h('div', { className: 'dsh-aside-panel-error', role: 'alert' }, messagesState.error),
        h('div', { className: 'dsh-aside-panel-composer' },
          h('textarea', {
            value: draft,
            placeholder: messages.inputPlaceholder,
            'aria-label': messages.inputPlaceholder,
            onChange: event => setDraft(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            },
          }),
          h('div', { className: 'dsh-aside-panel-actions' },
            h('span', { className: 'dsh-aside-model' }, messagesState.model === undefined ? messages.inherited : messagesState.model.model),
            h('span', { className: 'dsh-aside-spacer' }),
            messagesState.status === 'streaming'
              ? h('button', { type: 'button', className: 'dsh-aside-button', onClick: () => void stop(), disabled: stopping }, messages.stop)
              : h('button', { type: 'button', className: 'dsh-aside-button dsh-aside-button-primary', onClick: () => void send() }, messages.send),
          ),
        ),
      );
    }

    function AsideOverlay({ ctx, access, locale }) {
      const messages = MESSAGES[locale];
      const annotations = useAnnotations(access);
      const [bar, setBar] = useState(null);
      const [editor, setEditor] = useState(null);
      const [markers, setMarkers] = useState([]);
      const editorRefState = useRef(editor);
      editorRefState.current = editor;

      const computeMarkers = useCallback(() => {
        const next = [];
        const highlightRanges = [];
        annotations.forEach((annotation, index) => {
          if (annotation.anchor === undefined) return;
          const found = rootOfAnchor(annotation.anchor.nodeKey);
          if (found === undefined) return;
          const range = rangeOfAnchor(found.host, annotation.anchor);
          if (range === undefined) return;
          highlightRanges.push(range);
          const rect = range.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          next.push({
            index,
            top: clamp(rect.top, 0, window.innerHeight - 20),
            left: clamp(rect.right + 6, 0, window.innerWidth - 24),
          });
        });
        if (typeof CSS !== 'undefined' && CSS.highlights !== undefined && typeof Highlight !== 'undefined') {
          CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...highlightRanges));
        }
        setMarkers(next);
      }, [annotations]);

      useEffect(() => {
        computeMarkers();
        let frame;
        const schedule = () => {
          if (frame !== undefined) return;
          frame = window.requestAnimationFrame(() => { frame = undefined; computeMarkers(); });
        };
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        const root = document.querySelector('[data-conversation-session]');
        const observer = typeof MutationObserver === 'undefined' || root === null ? undefined : new MutationObserver(schedule);
        observer?.observe(root, { childList: true, subtree: true, characterData: true });
        return () => {
          if (frame !== undefined) window.cancelAnimationFrame(frame);
          window.removeEventListener('scroll', schedule, true);
          window.removeEventListener('resize', schedule);
          observer?.disconnect();
          if (typeof CSS !== 'undefined' && CSS.highlights !== undefined) CSS.highlights.delete(HIGHLIGHT_ALL);
        };
      }, [computeMarkers]);

      useEffect(() => {
        const onPointerDown = (event) => {
          const target = event.target;
          if (target instanceof Element && (target.closest('.dsh-aside-bar, .dsh-aside-editor, .dsh-aside-marker, .dsh-aside-dock') !== null)) return;
          setBar(null);
          setEditor(null);
        };
        const capture = () => {
          if (editorRefState.current !== null) return;
          const chat = access.currentChat();
          if (chat === undefined) { setBar(null); return; }
          const value = captureSelection(chat);
          if (value === undefined) { setBar(null); return; }
          const bounds = readBounds();
          const placed = placeFloating(value.rect, { width: BAR_WIDTH, height: BAR_HEIGHT }, bounds);
          setBar({ ...value, sessionId: access.currentSessionId(), placed });
        };
        let timer;
        const schedule = () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(capture, 90);
        };
        const onDown = (event) => {
          onPointerDown(event);
          window.setTimeout(schedule, 0);
        };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('pointerup', schedule, true);
        document.addEventListener('keyup', schedule, true);
        document.addEventListener('selectionchange', schedule);
        return () => {
          window.clearTimeout(timer);
          document.removeEventListener('pointerdown', onDown, true);
          document.removeEventListener('pointerup', schedule, true);
          document.removeEventListener('keyup', schedule, true);
          document.removeEventListener('selectionchange', schedule);
        };
      }, [access]);

      const openEditor = (seed) => {
        const bars = bar;
        const bounds = readBounds();
        const rect = seed !== undefined && seed.rect !== undefined ? seed.rect : bars?.rect ?? { top: bounds.top + 80, bottom: bounds.top + 80, left: 24, right: 24 };
        const placed = placeFloating(rect, { width: 320, height: 150 }, bounds);
        setEditor({ seed, placed: { top: placed.top, left: placed.left } });
        setBar(null);
      };

      const save = (comment) => {
        const current = editor;
        if (current === null) return;
        const seed = current.seed;
        const input = access.currentInput();
        if (input === undefined) return;
        const existing = access.currentAnnotations();
        const annotation = {
          text: seed.text,
          ...(comment === undefined ? {} : { comment }),
          ...(seed.anchor === undefined ? {} : { anchor: seed.anchor }),
          ...(seed.sessionId === undefined ? {} : { sessionId: seed.sessionId }),
        };
        const next = seed.index === undefined
          ? [...existing, annotation]
          : existing.map((value, position) => position === seed.index ? annotation : value);
        if (!writeAnnotations(input, next)) {
          input.notify?.('error', 'The annotation could not be saved.');
        }
        setEditor(null);
        focusComposer();
      };

      const remove = () => {
        const current = editor;
        if (current === null || current.seed.index === undefined) return;
        const input = access.currentInput();
        if (input === undefined) return;
        writeAnnotations(input, access.currentAnnotations().filter((_, position) => position !== current.seed.index));
        setEditor(null);
        focusComposer();
      };

      const ask = () => {
        const selection = bar;
        if (selection === null) return;
        setBar(null);
        window.getSelection()?.removeAllRanges();
        ctx.sidebarRight.openTab('aside', {
          params: {
            sessionId: access.currentSessionId(),
            atSeq: selection.anchor?.seq,
            text: selection.text,
          },
        });
      };

      return h(React.Fragment, null,
        bar === null ? null : h('div', {
          className: 'dsh-aside-bar',
          role: 'toolbar',
          'aria-label': messages.aside,
          style: { top: `${String(bar.placed.top)}px`, left: `${String(bar.placed.left)}px` },
          onMouseDown: event => event.preventDefault(),
        },
          h('button', { type: 'button', onClick: () => openEditor({ text: bar.text, anchor: bar.anchor, sessionId: bar.sessionId }) },
            h(IconQuote), messages.add),
          h('button', { type: 'button', onClick: ask }, h(IconAsk), messages.ask),
        ),
        editor === null ? null : h('div', {
          style: { position: 'fixed', top: `${String(editor.placed.top)}px`, left: `${String(editor.placed.left)}px`, zIndex: 81 },
        },
          h(AnnotationEditor, {
            locale,
            draft: editor.seed.text,
            initialComment: editor.seed.comment,
            onSave: save,
            onCancel: () => { setEditor(null); focusComposer(); },
            ...(editor.seed.index === undefined ? {} : { onRemove: remove }),
          }),
        ),
        markers.map(marker => h('button', {
          key: `aside-marker-${String(marker.index)}`,
          type: 'button',
          className: 'dsh-aside-marker',
          style: { top: `${String(marker.top)}px`, left: `${String(marker.left)}px` },
          title: `${String(marker.index + 1)}`,
          onClick: () => {
            const annotation = annotations[marker.index];
            if (annotation === undefined) return;
            const found = rootOfAnchor(annotation.anchor.nodeKey);
            const range = found === undefined ? undefined : rangeOfAnchor(found.host, annotation.anchor);
            openEditor({
              text: annotation.text,
              comment: annotation.comment,
              anchor: annotation.anchor,
              sessionId: annotation.sessionId,
              index: marker.index,
              rect: range === undefined ? undefined : range.getBoundingClientRect(),
            });
          },
        }, String(marker.index + 1))),
      );
    }

    function focusComposer() {
      const seat = document.querySelector('[data-composer-seat] [contenteditable="true"]');
      if (seat instanceof HTMLElement) seat.focus();
    }

    // ---------------------------------------------------------------- registration

    const services = {
      async create(request) { return transport(await api().create(request)); },
      async stream(request) { return api().stream(request); },
      async cancel(chatId) { return transport(await api().cancel({ chatId })); },
      async close(chatId) { return transport(await api().close({ chatId })); },
    };

    let mounted;

    function api() {
      if (mounted === undefined) throw new Error('Aside is not mounted.');
      return mounted;
    }

    /** Unwrap the Remote transport envelope; the Host result keeps its own shape. */
    function transport(result) {
      if (result !== null && typeof result === 'object' && result.ok === true) return result.value;
      return {
        ok: false,
        error: {
          code: 'transport_error',
          message: result?.error?.message ?? 'The discussion service failed.',
          recoverable: true,
        },
      };
    }

    function apply(ctx) {
      const locale = currentLocale();
      const access = createAccess(ctx);

      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.dshAside = '';
        style.textContent = CSS;
        document.head.append(style);
        return () => style.remove();
      }, 'dsh-aside.styles');

      ctx.effect(() => {
        const dispose = ctx.inputTriggers.registerSource({
          trigger: '@',
          name: SOURCE,
          order: 1_000,
          candidates: async () => [],
          onPick: () => undefined,
          codec: {
            clipboardText: (ref) => {
              const decoded = decodeChip(ref);
              return decoded === undefined ? '' : decoded.annotations.map(annotation => annotation.text).join('\n\n');
            },
            serialize: async (ref, signal) => {
              if (signal.aborted) throw signal.reason;
              const decoded = decodeChip(ref);
              return decoded === undefined ? '' : serializeAnnotations(decoded.annotations);
            },
          },
        });
        return () => dispose();
      }, 'dsh-aside.reference-source');

      const slots = ctx.slots;

      ctx.effect(() => slots.inject('conversation.input.dock', () => slots.register({
        name: 'conversation.input.dock',
        id: 'dsh-aside-dock',
        order: 40,
      }, () => h(AsideDockHost, { access, locale }))), 'dsh-aside.dock');

      ctx.effect(() => slots.inject('shell.overlay', () => slots.register({
        name: 'shell.overlay',
        id: 'dsh-aside',
        order: 91,
      }, () => h(AsideOverlay, { ctx, access, locale }))), 'dsh-aside.overlay');

      const shadow = key => slots.inject('conversation.chat.node', () => {
        let cachedOriginal;
        let Cached;
        const Shadow = (props) => {
          const original = slots.entries('conversation.chat.node')
            .find(entry => entry.options.key === key
              && entry.component !== Shadow
              && (entry.options.priority ?? 0) >= 0)
            ?.component;
          if (original === undefined) return null;
          if (original !== cachedOriginal || Cached === undefined) {
            cachedOriginal = original;
            Cached = annotatedRenderer(cachedOriginal, locale);
          }
          return h(Cached, props);
        };
        return slots.register({ name: 'conversation.chat.node', key, priority: -100, locale: 'conversation' }, Shadow);
      });
      ctx.effect(() => { const dispose = shadow('user'); return () => dispose(); }, 'dsh-aside.shadow-user');
      ctx.effect(() => { const dispose = shadow('steering'); return () => dispose(); }, 'dsh-aside.shadow-steering');

      ctx.effect(() => {
        const disposeType = ctx.sidebarRightTabs.register({
          id: 'dsh-aside',
          kind: 'aside',
          keepMounted: true,
          title: () => MESSAGES[locale].aside,
        });
        const disposeBody = slots.inject('sidebar.right.pane.tab', () => slots.register({
          name: 'sidebar.right.pane.tab',
          key: 'dsh-aside',
        }, (props) => {
          const params = props?.tab?.navigation?.params ?? {};
          const sessionId = typeof params.sessionId === 'string' ? params.sessionId
            : typeof props?.sessionId === 'string' ? props.sessionId : undefined;
          return h(AsidePanel, { ctx, access, locale, params: {
            sessionId,
            atSeq: typeof params.atSeq === 'number' ? params.atSeq : undefined,
            text: typeof params.text === 'string' ? params.text : undefined,
          } });
        }));
        return () => { disposeBody(); disposeType(); };
      }, 'dsh-aside.tab');

      ctx.effect(() => {
        let disposed = false;
        void ctx.remote.$mount(wireRemote(require('zod'))).then((dispose) => {
          if (disposed) { dispose(); return; }
          mounted = ctx.get('remote.aside');
          return () => { mounted = undefined; dispose(); };
        }).catch((cause) => {
          console.warn('[dsh-aside] could not mount the discussion service', cause);
        });
        return () => { disposed = true; mounted = undefined; };
      }, 'dsh-aside.remote');
    }

    function AsideDockHost({ access, locale }) {
      const annotations = useAnnotations(access);
      const [editIndex, setEditIndex] = useState(undefined);
      const editing = editIndex === undefined ? undefined : annotations[editIndex];
      useEffect(() => {
        if (editIndex !== undefined && editing === undefined) setEditIndex(undefined);
      }, [editIndex, editing]);
      const apply = (mutate) => {
        const input = access.currentInput();
        if (input === undefined) return;
        writeAnnotations(input, mutate(access.currentAnnotations()));
        setEditIndex(undefined);
        focusComposer();
      };
      return h(React.Fragment, null,
        editing === undefined ? null : h('div', { className: 'dsh-aside-dock', 'data-aside-skip': '' },
          h(AnnotationEditor, {
            locale,
            draft: editing.text,
            initialComment: editing.comment,
            onSave: comment => apply(list => list.map((value, position) => {
              if (position !== editIndex) return value;
              const next = { ...value, ...(comment === undefined ? {} : { comment }) };
              if (comment === undefined) delete next.comment;
              return next;
            })),
            onCancel: () => setEditIndex(undefined),
            onRemove: () => apply(list => list.filter((_, position) => position !== editIndex)),
          }),
        ),
        h(AsideDock, { access, locale, onEdit: index => setEditIndex(index) }),
      );
    }

    return {
      inject: ['sessions', 'slots', 'conversation', 'inputTriggers', 'uiConversation', 'remote', 'sidebarRight', 'sidebarRightTabs'],
      apply,
      __test: {
        serializeAnnotations,
        parseAsideContext,
        chipPayload,
        decodeChip,
        occurrenceEditSpan,
        readAnnotations,
        writeAnnotations,
        placeFloating,
        clamp,
      },
    };
  },
});
