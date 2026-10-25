window.__ModuleLoader__.load({
  id: 'dsh-annotations',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const {
      createElement: h,
      useCallback,
      useEffect,
      useLayoutEffect,
      useMemo,
      useRef,
      useState,
      useSyncExternalStore,
    } = React;

    const SOURCE = 'dsh-annotations';
    const LEGACY_SOURCE = 'aside-annotations'; // Existing drafts keep this source.
    const isAnnotationSource = source => source === SOURCE || source === LEGACY_SOURCE;
    const CHIP_LABEL = '__dsh_annotations__';
    const PAYLOAD_VERSION = 1;
    const MAX_SELECTION_CHARS = 16384;
    const HIGHLIGHT_ALL = 'dsh-annotations';
    const HIGHLIGHT_ACTIVE = 'dsh-annotations-active';
    const GAP = 18;
    const MARKER_SIZE = 18;
    const BAR_HEIGHT = 36;
    const BAR_WIDTH = 140;
    const TRANSCRIPT_OVERLAY_Z = 81;

    const STYLES = `
.dsh-annotations-bar{box-sizing:border-box;position:absolute;z-index:${TRANSCRIPT_OVERLAY_Z};display:flex;align-items:center;gap:2px;height:${BAR_HEIGHT}px;padding:3px;border-radius:12px;
  background:var(--dsw-alias-bg-layer-1,Canvas);color:var(--dsw-alias-label-primary,CanvasText);
  border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));box-shadow:0 8px 24px rgba(0,0,0,.16);
  font:500 12.5px/1.2 var(--dsh-font-family,system-ui,sans-serif);white-space:nowrap}
.dsh-annotations-bar button{all:unset;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px;border-radius:8px;cursor:pointer}
.dsh-annotations-bar button:hover,.dsh-annotations-bar button:focus-visible{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.dsh-annotations-bar button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,Highlight);outline-offset:1px}
.dsh-annotations-bar svg{width:15px;height:15px;flex:none;opacity:.85}
.dsh-annotations-editor{box-sizing:border-box;position:relative;width:320px;display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:12px;overflow:auto;
  background:var(--dsw-alias-bg-layer-1,Canvas);color:var(--dsw-alias-label-primary,CanvasText);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));
  box-shadow:0 12px 32px rgba(0,0,0,.2);font:400 13px/1.45 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-annotations-editor-quote{max-height:96px;overflow:auto;padding:6px 8px;border-radius:8px;font-size:12px;
  color:var(--dsw-alias-label-secondary,currentColor);background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.08));white-space:pre-wrap}
.dsh-annotations-editor textarea{resize:none;min-height:68px;padding:7px 8px;border-radius:8px;font:inherit;color:inherit;
  background:var(--dsw-alias-bg-layer-1,Canvas);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3));outline:none}
.dsh-annotations-editor textarea::placeholder{color:var(--dsw-alias-label-secondary,GrayText)}
.dsh-annotations-editor textarea:focus{border-color:var(--dsw-alias-brand-primary,Highlight)}
.dsh-annotations-editor-actions{display:flex;align-items:center;gap:6px}
.dsh-annotations-editor-actions .dsh-annotations-spacer{flex:1}
.dsh-annotations-button{all:unset;display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:8px;cursor:pointer;
  font:500 12.5px/1 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-annotations-button:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.dsh-annotations-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,Highlight);outline-offset:2px}
.dsh-annotations-button-primary{background:var(--dsw-alias-brand-primary,Highlight);color:var(--dsw-alias-bg-base,Canvas)}
.dsh-annotations-button-primary:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary,Highlight) 88%, var(--dsw-alias-label-primary,CanvasText))}
.dsh-annotations-delete{all:unset;box-sizing:border-box;display:grid;place-items:center;flex:none;width:26px;height:26px;border-radius:8px;
  color:var(--dsw-alias-state-error-primary,#dc2626);cursor:pointer}
.dsh-annotations-delete svg{width:16px;height:16px}
.dsh-annotations-delete:hover,.dsh-annotations-delete:focus-visible{background:color-mix(in srgb, currentColor 10%, transparent)}
.dsh-annotations-delete:focus-visible{outline:2px solid currentColor;outline-offset:1px}
.dsh-annotations-marker{position:absolute;z-index:${TRANSCRIPT_OVERLAY_Z - 1};display:grid;place-items:center;width:18px;height:18px;border-radius:7px;
  background:var(--dsw-alias-brand-primary,Highlight);color:var(--dsw-alias-bg-base,Canvas);font:600 10.5px/1 var(--dsh-font-family,system-ui,sans-serif);
  cursor:pointer;border:none;box-shadow:0 2px 6px rgba(0,0,0,.2);padding:0}
.dsh-annotations-marker:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,Highlight);outline-offset:2px}
.dsh-annotations-dock{position:absolute;top:8px;left:14px;z-index:3;display:flex;flex-direction:column;gap:6px;max-width:calc(100% - 28px)}
[data-composer-seat]:has(.dsh-annotations-dock) [data-composer-input]{padding-top:39px}
[data-composer-seat]:has(.dsh-annotations-dock) [data-composer-placeholder]{transform:translateY(35px)}
[data-composer-seat]:has(.dsh-annotations-dock[data-annotations-inline]) [data-composer-input]{padding-top:0}
[data-composer-seat]:has(.dsh-annotations-dock[data-annotations-inline]) [data-composer-placeholder]{transform:none}
.dsh-annotations-capsule-text{display:inline-block;min-width:0}
.dsh-annotations-dock:hover .dsh-annotations-capsule-text,.dsh-annotations-dock:focus-within .dsh-annotations-capsule-text{
  mask-image:linear-gradient(to right,#000 calc(100% - 40px),transparent calc(100% - 14px))}
.dsh-annotations-close{position:absolute;z-index:1;top:3px;right:3px;width:24px;height:24px;
  border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));background:var(--dsw-alias-bg-layer-1,Canvas);
  opacity:0;pointer-events:none;transition:opacity .14s ease,background-color .14s ease,color .14s ease}
.dsh-annotations-dock:hover .dsh-annotations-close,.dsh-annotations-dock:focus-within .dsh-annotations-close{opacity:1;pointer-events:auto}
.dsh-annotations-close:hover,.dsh-annotations-close:focus-visible{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.dsh-annotations-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,Highlight);outline-offset:1px}
.dsh-annotations-dock:has(.dsh-annotations-list)::before{content:"";position:absolute;left:0;right:0;bottom:100%;height:8px}
.dsh-annotations-list{left:0}
.dsh-annotations-message{position:relative;display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-width:0}
.dsh-annotations-message-body{align-self:stretch;min-width:0}
.dsh-annotations-message[data-annotations-after-attachments] [data-message-attachments]{margin-bottom:38px}
.dsh-annotations-message[data-annotations-after-attachments] .dsh-annotations-card{position:absolute;right:0;top:var(--dsh-annotations-sent-top,0px)}
.dsh-annotations-card{position:relative;z-index:4;align-self:flex-end;width:fit-content;max-width:100%;
  font:500 12.5px/1 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-annotations-dock:has(.dsh-annotations-list),.dsh-annotations-card:has(.dsh-annotations-card-body){z-index:6}
.dsh-annotations-card-pill{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 11px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));
  border-radius:9px;background:var(--dsw-alias-bg-layer-1,Canvas);color:var(--dsw-alias-label-primary,currentColor);
  font:500 12.5px/1 var(--dsh-font-family,system-ui,sans-serif);cursor:default;white-space:nowrap}
.dsh-annotations-card-pill svg{flex:none;color:var(--dsw-alias-label-secondary,currentColor)}
.dsh-annotations-card-pill:hover,.dsh-annotations-card-pill:focus-visible{background:var(--dsw-alias-bg-layer-2,Canvas);border-color:var(--dsw-alias-border-l2,rgba(127,127,127,.35))}
.dsh-annotations-card-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,Highlight);outline-offset:2px}
.dsh-annotations-card:has(.dsh-annotations-card-body)::before{content:"";position:absolute;left:0;right:0;bottom:100%;height:8px}
.dsh-annotations-card[data-annotations-open-below]::before{top:100%;bottom:auto}
.dsh-annotations-preview{box-sizing:border-box;position:absolute;bottom:calc(100% + 8px);width:min(320px,calc(100vw - 32px));max-height:360px;
  overflow:auto;display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:12px;
  background:var(--dsw-alias-bg-layer-1,Canvas);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.24));
  color:var(--dsw-alias-label-primary,CanvasText);box-shadow:0 8px 24px rgba(0,0,0,.16);font:400 12px/1.45 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-annotations-card-body{right:0}
.dsh-annotations-card[data-annotations-open-below] .dsh-annotations-card-body{top:calc(100% + 8px);bottom:auto}
.dsh-annotations-preview-row{display:flex;flex:none;gap:8px;align-items:flex-start;padding:6px;border-radius:8px}
.dsh-annotations-preview-row-editable{cursor:pointer}
.dsh-annotations-preview-row-editable:hover,.dsh-annotations-preview-row-editable:focus-visible{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.dsh-annotations-preview-row-editable:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,Highlight);outline-offset:2px}
.dsh-annotations-preview-index{min-width:18px;flex:none;text-align:right;color:var(--dsw-alias-label-secondary,currentColor);
  font:500 12px/1.45 var(--dsh-font-family,system-ui,sans-serif)}
.dsh-annotations-preview-text{display:flex;flex-direction:column;gap:8px;min-width:0;flex:1}
.dsh-annotations-preview-quote,.dsh-annotations-preview-comment{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
.dsh-annotations-preview-quote{color:var(--dsw-alias-label-primary,currentColor)}
.dsh-annotations-preview-comment{color:var(--dsw-alias-label-secondary,currentColor)}
:is([data-composer-chip="dsh-annotations"],[data-composer-chip="aside-annotations"]){display:inline-block!important;width:0!important;height:0!important;overflow:hidden!important;
  opacity:0!important;pointer-events:none!important;vertical-align:baseline!important}
::highlight(${HIGHLIGHT_ALL}){background-color:color-mix(in srgb, var(--dsw-alias-brand-primary,Highlight) 24%, transparent)}
::highlight(${HIGHLIGHT_ACTIVE}){background-color:color-mix(in srgb, var(--dsw-alias-brand-primary,Highlight) 44%, transparent)}
`;

    const MESSAGES = {
      zh: {
        add: '添加到对话', annotation: '条注释', annotations: '条注释',
        commentPlaceholder: '添加可选评论…', cancel: '取消', save: '保存', remove: '删除',
        clearAll: '清除全部注释', clearFailed: '无法清除注释。',
        unavailable: '当前对话中找不到选中的文字。',
        wrongConversationSave: '请返回原对话后再保存这条注释。',
        changedSave: '注释已更改，请重新打开后再保存。',
        saveFailed: '无法保存注释。',
        wrongConversationRemove: '请返回原对话后再修改这条注释。',
        changedRemove: '注释已更改，请重新打开后再删除。',
      },
      en: {
        add: 'Add to chat', annotation: 'annotation', annotations: 'annotations',
        commentPlaceholder: 'Add an optional comment…', cancel: 'Cancel', save: 'Save', remove: 'Remove',
        clearAll: 'Delete all annotations', clearFailed: 'Could not delete the annotations.',
        unavailable: 'The selected text is not available in this conversation.',
        wrongConversationSave: 'Return to the original conversation before saving this annotation.',
        changedSave: 'The annotation changed. Reopen it before saving.',
        saveFailed: 'The annotation could not be saved.',
        wrongConversationRemove: 'Return to the original conversation before changing this annotation.',
        changedRemove: 'The annotation changed. Reopen it before deleting.',
      },
    };

    function localeFace(service) {
      return {
        subscribe: listener => service.subscribe(listener),
        getSnapshot: () => service.getSnapshot().active.toLowerCase().startsWith('zh') ? 'zh' : 'en',
      };
    }

    function annotationCount(count, messages) {
      return `${count} ${count === 1 ? messages.annotation : messages.annotations}`;
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

    function serializeAnnotations(annotations, tag = 'annotation_context') {
      return [
        `<${tag}>`,
        ...annotations.flatMap((annotation, index) => [
          `<annotation index="${String(index + 1)}">`,
          '<selected_text>', escapeXmlText(annotation.text), '</selected_text>',
          ...(annotation.comment === undefined ? [] : ['<user_comment>', escapeXmlText(annotation.comment), '</user_comment>']),
          '</annotation>',
        ]),
        `</${tag}>`,
      ].join('\n');
    }

    const CONTEXT_BLOCK = /<(annotation_context|aside_context)>\r?\n[\s\S]*?\r?\n<\/\1>/gu;
    const ANNOTATION_BLOCK = /<annotation index="\d+">\n<selected_text>\n([\s\S]*?)\n<\/selected_text>(?:\n<user_comment>\n([\s\S]*?)\n<\/user_comment>)?\n<\/annotation>/gu;

    function parseAnnotationContext(text) {
      const candidates = [...text.matchAll(CONTEXT_BLOCK)];
      if (candidates.length !== 1) return undefined;
      const candidate = candidates[0];
      const xml = normalizeText(candidate[0]);
      const annotations = [...xml.matchAll(ANNOTATION_BLOCK)].map((match) => ({
        text: unescapeXmlText(match[1]),
        ...(match[2] === undefined ? {} : { comment: unescapeXmlText(match[2]) }),
      }));
      if (annotations.length === 0 || serializeAnnotations(annotations, candidate[1]) !== xml) return undefined;
      const start = candidate.index;
      const end = start + candidate[0].length;
      return { annotations, start, end };
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
      const occurrences = snapshot.occurrences.filter(occurrence => isAnnotationSource(occurrence.source));
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
      const existing = before.occurrences.filter(occurrence => isAnnotationSource(occurrence.source));
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

    function editorSize(bounds) {
      return {
        width: Math.min(320, Math.max(40, bounds.right - bounds.left - 16)),
        height: Math.min(260, Math.max(40, bounds.bottom - bounds.top - 8)),
      };
    }

    function placeWithinBounds(point, size, bounds) {
      return {
        top: clamp(point.top, bounds.top + 4, Math.max(bounds.top + 4, bounds.bottom - size.height - 4)),
        left: clamp(point.left, bounds.left + 8, Math.max(bounds.left + 8, bounds.right - size.width - 8)),
      };
    }

    function placeNearPointer(pointer, size, bounds) {
      return placeWithinBounds({ top: pointer.y + 8, left: pointer.x + 8 }, size, bounds);
    }

    function placeInScroll(placed, scroll) {
      const rect = scroll.getBoundingClientRect();
      return {
        top: placed.top - rect.top - scroll.clientTop + scroll.scrollTop,
        left: placed.left - rect.left - scroll.clientLeft + scroll.scrollLeft,
      };
    }

    function positionFloatingBox(box, rect, scroll) {
      const placed = placeFloating(rect, box.getBoundingClientRect(), readBounds(scroll));
      const point = scroll === undefined ? placed : placeInScroll(placed, scroll);
      box.style.top = `${String(point.top)}px`;
      box.style.left = `${String(point.left)}px`;
      return point;
    }

    function positionAtAnchor(box, rect, scroll, offset) {
      const anchor = placeInScroll({ top: rect.top, left: rect.left }, scroll);
      box.style.top = `${String(anchor.top + offset.top)}px`;
      box.style.left = `${String(anchor.left + offset.left)}px`;
    }

    function placeMarker(last, scroll) {
      const rect = scroll.getBoundingClientRect();
      return {
        top: last.top - rect.top - scroll.clientTop + scroll.scrollTop - MARKER_SIZE - 4,
        left: last.right - rect.left - scroll.clientLeft + scroll.scrollLeft + 4,
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
          caretSpan: () => source.caretSpan(),
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
        if (parent.closest('[data-annotations-skip],button,[role="button"],[aria-hidden="true"]') !== null) continue;
        nodes.push(cell);
      }
      return nodes;
    }

    function offsetsOf(host, range) {
      const nodes = textNodesOf(host);
      const offsetAt = (container, offset) => {
        if (container.nodeType === Node.TEXT_NODE && !nodes.includes(container)) return;
        const boundary = document.createRange();
        boundary.setStart(container, offset);
        boundary.collapse(true);
        let total = 0;
        for (const node of nodes) {
          const length = node.nodeValue?.length ?? 0;
          if (boundary.comparePoint(node, length) <= 0) total += length;
          else if (boundary.comparePoint(node, 0) >= 0) return total;
          else return container === node ? total + offset : undefined;
        }
        return total;
      };
      const start = offsetAt(range.startContainer, range.startOffset);
      const end = offsetAt(range.endContainer, range.endOffset);
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

    function rootOfAnchor(nodeKey, sessionId) {
      const root = (sessionId === undefined ? null : document.querySelector(`[data-conversation-session="${CSS.escape(sessionId)}"]`))
        ?? document.querySelector('[data-conversation-scroll]')?.closest('[data-conversation-session]');
      const host = root?.querySelector(`[data-chat-anchor-key="${CSS.escape(nodeKey)}"]`);
      if (host !== null && host !== undefined) return { root, host };
    }

    /** The visual line under a double-click: the caret's own text node,
     *  narrowed to the line the point falls on (a text node often holds the
     *  whole message). Blank carets fall back to the nearest non-blank text. */
    function lineRangeOf(host, container, offset) {
      const nodes = textNodesOf(host);
      let index = nodes.indexOf(container);
      if (index < 0 && container.nodeType !== Node.TEXT_NODE) {
        index = nodes.findIndex(node => container.contains(node));
      }
      if (index < 0) return;
      const byLine = (node, at) => {
        const value = node.nodeValue ?? '';
        const rectAt = (position) => {
          const range = document.createRange();
          range.setStart(node, position);
          range.setEnd(node, Math.min(position + 1, value.length));
          return range.getClientRects()[0];
        };
        let caret = Math.min(Math.max(at, 0), Math.max(value.length - 1, 0));
        let probe = rectAt(caret);
        if (probe === undefined && caret > 0) { caret -= 1; probe = rectAt(caret); }
        if (probe === undefined) return;
        const top = probe.top;
        const same = (position) => {
          const rect = rectAt(position);
          return rect !== undefined && Math.abs(rect.top - top) < 2;
        };
        let from = caret;
        while (from > 0 && same(from - 1)) from -= 1;
        let to = caret + 1;
        while (to < value.length && same(to)) to += 1;
        while (from < to && /\s/.test(value[from])) from += 1;
        while (to > from && /\s/.test(value[to - 1])) to -= 1;
        if (to <= from) return;
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        return range;
      };
      const whole = (node) => {
        const value = node.nodeValue ?? '';
        const from = value.search(/\S/);
        const to = value.replace(/\s+$/, '').length;
        if (from < 0 || to <= from) return;
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        return range;
      };
      const direct = byLine(nodes[index], offset) ?? whole(nodes[index]);
      if (direct !== undefined) return direct;
      for (let step = 1; step < nodes.length; step += 1) {
        const before = whole(nodes[index - step]);
        if (before !== undefined) return before;
        const after = whole(nodes[index + step]);
        if (after !== undefined) return after;
      }
    }

    function rangeEndingInHost(range, host, text) {
      const last = textNodesOf(host).at(-1);
      if (last === undefined || range.comparePoint(last, last.nodeValue.length) > 0) return;
      const clipped = range.cloneRange();
      clipped.setEnd(last, last.nodeValue.length);
      const ownText = normalizeText(clipped.toString());
      return ownText.trimEnd() === text.trimEnd() ? { range: clipped, text: ownText } : undefined;
    }

    function captureSelection(chat) {
      const selection = window.getSelection();
      if (selection === null || selection.isCollapsed || selection.rangeCount !== 1) return;
      let range = selection.getRangeAt(0);
      const startHost = chatHostOf(range.startContainer);
      const endHost = chatHostOf(range.endContainer);
      if (startHost === null) return;
      let text = normalizeText(selection.toString());
      if (startHost !== endHost) {
        const clipped = rangeEndingInHost(range, startHost, text);
        if (clipped === undefined) return;
        ({ range, text } = clipped);
      }
      if (text.trim().length === 0 || text.length > MAX_SELECTION_CHARS) return;
      const nodeKey = startHost.getAttribute('data-chat-anchor-key');
      if (nodeKey === null) return;
      const descriptor = chatDescriptor(chat, nodeKey);
      if (descriptor === undefined || !descriptor.settled || descriptor.source !== 'assistant') return;
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

    function scrollAnnotationIntoView(rect, scroll, bounds) {
      if (rect.top >= bounds.top + GAP && rect.bottom <= bounds.bottom - GAP) return;
      scroll.scrollTop += rect.top - (bounds.top + bounds.bottom) / 2;
    }

    function readBounds(container) {
      const scroll = container ?? document.querySelector('[data-conversation-scroll]');
      const seat = document.querySelector('[data-composer-seat]');
      const rect = scroll?.getBoundingClientRect();
      const bottom = seat === null ? window.innerHeight : seat.getBoundingClientRect().top;
      return {
        top: Math.max(rect?.top ?? 0, 0), bottom: Math.min(bottom, rect?.bottom ?? window.innerHeight, window.innerHeight),
        left: container === undefined ? 0 : Math.max(rect.left, 0),
        right: container === undefined ? window.innerWidth : Math.min(rect.right, window.innerWidth),
      };
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

    function IconTrash() {
      return h('svg', { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M3.5 5.5h13m-10-2h7m-8.5 2 .7 11h8.6l.7-11M8 8.5v5m4-5v5' }));
    }

    function AnnotationEditor({ locale, draft, comment, limits, onCommentChange, onSave, onCancel, onRemove }) {
      const messages = MESSAGES[locale];
      const areaRef = useRef(null);
      const save = () => onSave(comment.trim() === '' ? undefined : comment.trim());
      useEffect(() => {
        areaRef.current?.focus();
        areaRef.current?.setSelectionRange(areaRef.current.value.length, areaRef.current.value.length);
      }, []);
      return h('div', {
        className: 'dsh-annotations-editor',
        style: { maxWidth: limits.width, maxHeight: limits.height },
        role: 'dialog',
        'aria-label': messages.add,
        onKeyDown: (event) => {
          if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
          else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); save(); }
        },
      },
        h('div', { className: 'dsh-annotations-editor-quote' }, draft.slice(0, 300)),
        h('textarea', {
          ref: areaRef,
          value: comment,
          placeholder: messages.commentPlaceholder,
          'aria-label': messages.commentPlaceholder,
          onChange: event => onCommentChange(event.target.value),
        }),
        h('div', { className: 'dsh-annotations-editor-actions' },
          onRemove === undefined ? null : h('button', {
            type: 'button', className: 'dsh-annotations-delete', 'aria-label': messages.remove,
            title: messages.remove, onClick: onRemove,
          }, h(IconTrash)),
          h('span', { className: 'dsh-annotations-spacer' }),
          h('button', { type: 'button', className: 'dsh-annotations-button', onClick: onCancel }, messages.cancel),
          h('button', { type: 'button', className: 'dsh-annotations-button dsh-annotations-button-primary', onClick: save }, messages.save),
        ),
      );
    }

    function AnnotationPreview({ annotations, locale, className, onEdit, onRemove }) {
      const messages = MESSAGES[locale];
      return h('div', { className: `dsh-annotations-preview ${className}`, role: 'list' }, annotations.map((annotation, index) => h('div', {
        key: `annotations-preview-${String(index)}`,
        className: `dsh-annotations-preview-row${onEdit === undefined ? '' : ' dsh-annotations-preview-row-editable'}`,
        role: 'listitem',
        tabIndex: onEdit === undefined ? undefined : 0,
        onClick: onEdit === undefined ? undefined : () => onEdit(index),
        onKeyDown: onEdit === undefined ? undefined : event => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          onEdit(index);
        },
      },
        h('span', { className: 'dsh-annotations-preview-index' }, `${String(index + 1)}.`),
        h('span', { className: 'dsh-annotations-preview-text' },
          h('span', { className: 'dsh-annotations-preview-quote', title: annotation.text }, annotation.text),
          annotation.comment === undefined ? null : h('span', { className: 'dsh-annotations-preview-comment', title: annotation.comment }, annotation.comment),
        ),
        onRemove === undefined ? null : h('button', {
          type: 'button', className: 'dsh-annotations-delete dsh-annotations-preview-remove',
          'aria-label': messages.remove, title: messages.remove,
          onClick: event => { event.stopPropagation(); onRemove(index); },
        }, h(IconTrash)),
      )));
    }

    function placeDock(card, rail, last, dock, gap = 10) {
      if (last === undefined) return { left: 14, top: 8, inline: false };
      const left = last.right - card.left + gap;
      const inline = last.width > 0 && left + dock.width + 14 <= Math.min(card.right, rail.right) - card.left;
      return {
        left: inline ? left : 14,
        top: inline ? last.bottom - card.top - dock.height : rail.bottom - card.top + 8,
        inline,
      };
    }

    function placeSentPill(message, attachments) {
      return attachments.bottom - message.top + 8;
    }

    function sentPopoverBelow(card, height, viewportHeight) {
      return card.top < height + 8 && viewportHeight - card.bottom > card.top;
    }

    function preserveAnnotationOnDelete(input, key) {
      if (input === undefined) return false;
      const snapshot = input.state.getSnapshot();
      if (snapshot.phase !== 'plain') return false;
      const references = [...snapshot.occurrences].sort((a, b) => a.offset - b.offset);
      const own = references.filter(occurrence => isAnnotationSource(occurrence.source));
      if (own.length !== 1) return false;
      let editLength = snapshot.draft.length;
      let previousEnd = 0;
      for (const occurrence of references) {
        if (occurrenceInDraft(snapshot, occurrence) === undefined || occurrence.offset < previousEnd) return false;
        editLength -= occurrence.length - 1;
        previousEnd = occurrence.offset + occurrence.length;
      }
      const occurrence = own[0];
      const chip = occurrenceEditSpan(snapshot, occurrence);
      const selection = input.caretSpan?.();
      if (chip === undefined || selection === undefined
        || !Number.isSafeInteger(selection.start) || !Number.isSafeInteger(selection.end)
        || selection.start < 0 || selection.end > editLength || selection.start > selection.end) return false;
      if (selection.start === 0 && selection.end === editLength && selection.end > 0) {
        return input.insertReference({
          source: occurrence.source, ref: occurrence.ref, label: occurrence.label,
          clipboardText: occurrence.clipboardText,
          ...(occurrence.appearance === undefined ? {} : { appearance: occurrence.appearance }),
        }, { start: 0, end: editLength, draftRev: snapshot.draftRev }) === true;
      }
      if (selection.start !== selection.end) return false;
      const position = references.indexOf(occurrence);
      const backward = key === 'Backspace' && selection.start === chip.end;
      const forward = key === 'Delete' && selection.start === chip.start;
      if (!backward && !forward) return false;
      const text = backward
        ? snapshot.draft.slice(position === 0 ? 0 : references[position - 1].offset + references[position - 1].length, occurrence.offset)
        : snapshot.draft.slice(occurrence.offset + occurrence.length,
          references[position + 1]?.offset ?? snapshot.draft.length);
      if (text === '') return true;
      const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
      const grapheme = backward ? graphemes.at(-1) : graphemes[0];
      const start = backward ? chip.start - grapheme.segment.length : chip.end;
      return input.replaceText('', {
        start, end: start + grapheme.segment.length, draftRev: snapshot.draftRev,
      }) === true;
    }

    function editsAnnotationChip(editor, range, type) {
      const backward = type === 'Backspace' || type.endsWith('Backward');
      const forward = type === 'Delete' || type.endsWith('Forward');
      if (range.collapsed && !backward && !forward) return false;
      return [...editor.querySelectorAll('[data-composer-chip="dsh-annotations"],[data-composer-chip="aside-annotations"]')].some(chip => {
        // ponytail: mixed selections stay untouched; partial text edits need the editor's transaction hook.
        if (!range.collapsed) return range.intersectsNode(chip);
        if (chip.contains(range.startContainer)) return true;
        const boundary = document.createRange();
        boundary.selectNode(chip);
        const gap = range.cloneRange();
        if (backward) {
          if (range.compareBoundaryPoints(Range.START_TO_END, boundary) < 0) return false;
          gap.setStartAfter(chip);
        } else {
          if (range.compareBoundaryPoints(Range.START_TO_START, boundary) > 0) return false;
          gap.setEndBefore(chip);
        }
        const text = gap.toString().replace(/[\u200b-\u200d\ufeff]/gu, '');
        return type.includes('Line') || (type.includes('Word') ? text.trim() === '' : text === '');
      });
    }

    function AnnotationDock({ access, locale, onEdit }) {
      const language = useSyncExternalStore(locale.subscribe, locale.getSnapshot);
      const messages = MESSAGES[language];
      const annotations = useAnnotations(access);
      const [expanded, setExpanded] = useState(false);
      const dockRef = useRef(null);
      useEffect(() => {
        if (annotations.length === 0 && expanded) setExpanded(false);
      }, [annotations.length, expanded]);
      useLayoutEffect(() => {
        const list = dockRef.current?.querySelector('.dsh-annotations-list');
        if (list) list.style.left = `${String(Math.min(0, window.innerWidth - 16 - dockRef.current.getBoundingClientRect().left - list.offsetWidth))}px`;
      }, [expanded, annotations.length]);
      useEffect(() => {
        const dock = dockRef.current;
        const seat = dock?.closest('[data-composer-seat]');
        const card = seat?.querySelector('[data-composer-card]');
        const attachments = seat?.querySelector('[data-slot="conversation.input.attachments"]');
        if (!dock || !card || !attachments) return;
        const place = () => {
          const rail = attachments.querySelector('[role="group"]');
          const position = placeDock(card.getBoundingClientRect(), rail?.getBoundingClientRect(),
            rail?.lastElementChild?.getBoundingClientRect(), dock.getBoundingClientRect(),
            rail === null ? 10 : Number.parseFloat(getComputedStyle(rail).columnGap) || 10);
          dock.style.left = `${String(position.left)}px`;
          dock.style.top = `${String(position.top)}px`;
          dock.toggleAttribute('data-annotations-inline', position.inline);
        };
        const mutation = new MutationObserver(place);
        mutation.observe(attachments, { childList: true, subtree: true });
        const resize = new ResizeObserver(place);
        resize.observe(card);
        attachments.addEventListener('scroll', place, true);
        place();
        return () => {
          mutation.disconnect();
          resize.disconnect();
          attachments.removeEventListener('scroll', place, true);
        };
      }, [annotations.length]);
      useEffect(() => {
        const editor = dockRef.current?.closest('[data-composer-seat]')?.querySelector('[data-composer-input]');
        if (!editor || annotations.length === 0) return;
        const protect = (event) => {
          if (!editor.contains(event.target)) return;
          let type = event.inputType;
          if (event.type === 'keydown') {
            if (event.key === 'Backspace' || event.key === 'Delete') {
              const direction = event.key === 'Backspace' ? 'Backward' : 'Forward';
              type = event.metaKey ? `deleteSoftLine${direction}`
                : event.altKey || event.ctrlKey ? `deleteWord${direction}` : event.key;
            } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x') {
              type = 'deleteByCut';
            } else return;
          } else if (event.type === 'dragstart') type = 'deleteByDrag';
          else if (event.type === 'cut') type = 'deleteByCut';
          else if (event.type === 'paste' || event.type === 'drop') type = 'insertFromPaste';
          if (!type) return;
          const target = event.type === 'beforeinput' ? event.getTargetRanges?.()[0] : undefined;
          const selection = window.getSelection();
          if (!target && (!selection || selection.rangeCount === 0)) return;
          const range = target ? document.createRange() : selection.getRangeAt(0);
          if (target) {
            range.setStart(target.startContainer, target.startOffset);
            range.setEnd(target.endContainer, target.endOffset);
          }
          if (!editsAnnotationChip(editor, range, type)) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.type === 'keydown' && (event.key === 'Backspace' || event.key === 'Delete')
            && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing) {
            preserveAnnotationOnDelete(access.currentInput(), event.key);
          }
        };
        for (const event of ['keydown', 'beforeinput', 'paste', 'cut', 'dragstart', 'drop']) {
          editor.addEventListener(event, protect, true);
        }
        return () => {
          for (const event of ['keydown', 'beforeinput', 'paste', 'cut', 'dragstart', 'drop']) {
            editor.removeEventListener(event, protect, true);
          }
        };
      }, [annotations.length > 0]);
      if (annotations.length === 0) return null;
      const remove = (index) => {
        const input = access.currentInput();
        if (input === undefined) return;
        const next = access.currentAnnotations().filter((_, position) => position !== index);
        writeAnnotations(input, next);
      };
      const clear = () => {
        const input = access.currentInput();
        if (input !== undefined && !writeAnnotations(input, [])) input.notify?.('error', messages.clearFailed);
      };
      return h('div', {
        ref: dockRef, className: 'dsh-annotations-dock', 'data-annotations-skip': '',
        onMouseEnter: () => setExpanded(true),
        onMouseLeave: () => setExpanded(false),
        onFocus: () => setExpanded(true),
        onBlur: event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); },
      },
        h('button', {
          type: 'button',
          className: 'dsh-annotations-capsule dsh-annotations-card-pill',
          'aria-expanded': expanded,
        },
          h('svg', { width: 16, height: 16, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor',
            strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            h('path', { d: 'M5 3.75h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-3.5 2v-2A2 2 0 0 1 3 13.75v-8a2 2 0 0 1 2-2Z' }),
            h('path', { d: 'M6.5 8h7m-7 3h4.5' })),
          h('span', { className: 'dsh-annotations-capsule-text' }, annotationCount(annotations.length, messages)),
        ),
        h('button', {
          type: 'button', className: 'dsh-annotations-delete dsh-annotations-close',
          'aria-label': messages.clearAll, title: messages.clearAll, onClick: clear,
        }, h(IconTrash)),
        expanded ? h(AnnotationPreview, {
          annotations, locale: language, className: 'dsh-annotations-list',
          onEdit: (index) => { setExpanded(false); onEdit(index); },
          onRemove: remove,
        }) : null,
      );
    }

    function AnnotationMessages({ annotations, locale }) {
      const language = useSyncExternalStore(locale.subscribe, locale.getSnapshot);
      const [expanded, setExpanded] = useState(false);
      const cardRef = useRef(null);
      const messages = MESSAGES[language];
      useLayoutEffect(() => {
        const message = cardRef.current?.closest('.dsh-annotations-message');
        const attachments = message?.querySelector('[data-message-attachments]');
        if (!message || !attachments) return;
        // ponytail: native UserContent has no after-attachments slot; use its measured rail until one exists.
        message.setAttribute('data-annotations-after-attachments', '');
        const place = () => message.style.setProperty('--dsh-annotations-sent-top',
          `${String(placeSentPill(message.getBoundingClientRect(), attachments.getBoundingClientRect()))}px`);
        const resize = new ResizeObserver(place);
        resize.observe(message);
        resize.observe(attachments);
        place();
        return () => {
          resize.disconnect();
          message.removeAttribute('data-annotations-after-attachments');
          message.style.removeProperty('--dsh-annotations-sent-top');
        };
      }, [annotations.length]);
      useLayoutEffect(() => {
        if (!expanded) return;
        const card = cardRef.current;
        const preview = card?.querySelector('.dsh-annotations-card-body');
        if (!card || !preview) return;
        const place = () => card.toggleAttribute('data-annotations-open-below',
          sentPopoverBelow(card.getBoundingClientRect(), preview.getBoundingClientRect().height, window.innerHeight));
        const resize = new ResizeObserver(place);
        resize.observe(preview);
        place();
        return () => resize.disconnect();
      }, [expanded]);
      if (annotations.length === 0) return null;
      return h('div', {
        ref: cardRef, className: 'dsh-annotations-card', 'data-annotations-skip': '',
        onMouseEnter: () => setExpanded(true),
        onMouseLeave: () => setExpanded(false),
        onFocus: () => setExpanded(true),
        onBlur: event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); },
      },
        h('button', { type: 'button', className: 'dsh-annotations-card-pill', 'aria-expanded': expanded },
          h('svg', { width: 16, height: 16, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor',
            strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            h('path', { d: 'M5 3.75h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-3.5 2v-2A2 2 0 0 1 3 13.75v-8a2 2 0 0 1 2-2Z' }),
            h('path', { d: 'M6.5 8h7m-7 3h4.5' })),
          annotationCount(annotations.length, messages),
        ),
        expanded ? h(AnnotationPreview, { annotations, locale: language, className: 'dsh-annotations-card-body' }) : null,
      );
    }

    function contentText(content) {
      const runs = [];
      let current;
      for (const [index, block] of content.entries()) {
        if (block?.type !== 'text' || typeof block.text !== 'string') {
          current = undefined;
          continue;
        }
        if (current === undefined) {
          current = { from: index, to: index, text: '' };
          runs.push(current);
        }
        current.to = index;
        current.text += block.text;
      }
      return runs;
    }

    function replaceTextContent(content, run, start, end) {
      let offset = 0;
      return content.map((block, index) => {
        if (index < run.from || index > run.to) return block;
        const from = Math.max(0, Math.min(block.text.length, start - offset));
        const to = Math.max(0, Math.min(block.text.length, end - offset));
        offset += block.text.length;
        return { ...block, text: block.text.slice(0, from) + block.text.slice(to) };
      });
    }

    function extractAnnotationContent(content) {
      const matches = contentText(content).map(run => ({ run, parsed: parseAnnotationContext(run.text) }))
        .filter(({ parsed }) => parsed !== undefined);
      if (matches.length !== 1) return undefined;
      const { run, parsed } = matches[0];
      return {
        annotations: parsed.annotations,
        content: replaceTextContent(content, run, parsed.start, parsed.end),
      };
    }

    function annotatedRenderer(Original, locale) {
      return function AnnotationUserMessage(props) {
        const parsed = extractAnnotationContent(props.node.data.content);
        if (parsed === undefined) return h(Original, props);
        const node = {
          ...props.node,
          data: { ...props.node.data, content: parsed.content },
        };
        return h('div', { className: 'dsh-annotations-message' },
          h(AnnotationMessages, { annotations: parsed.annotations, locale }),
          h('div', { className: 'dsh-annotations-message-body' }, h(Original, { ...props, node })),
        );
      };
    }

    function AnnotationOverlay({ access, locale }) {
      const language = useSyncExternalStore(locale.subscribe, locale.getSnapshot);
      const messages = MESSAGES[language];
      const annotations = useAnnotations(access);
      const [bar, setBar] = useState(null);
      const [editor, setEditor] = useState(null);
      const [comment, setComment] = useState('');
      const editorScroll = editor?.scroll?.isConnected && editor.seed.sessionId === access.currentSessionId() ? editor.scroll : undefined;
      const editorRefState = useRef(editor);
      editorRefState.current = editor;
      const barBoxRef = useRef(null);
      const editorBoxRef = useRef(null);
      const editorOffsetRef = useRef(null);
      const pendingOpenRef = useRef(0);
      useEffect(() => () => { pendingOpenRef.current += 1; }, []);
      const repositionRef = useRef(null);
      repositionRef.current = () => {
        const currentRange = (anchor, range, sessionId) => {
          const found = anchor === undefined ? undefined : rootOfAnchor(anchor.nodeKey, sessionId);
          return (found === undefined ? undefined : rangeOfAnchor(found.host, anchor))
            ?? (range?.commonAncestorContainer.isConnected ? range : undefined);
        };
        if (bar?.scroll && barBoxRef.current !== null) {
          const rect = currentRange(bar.anchor, bar.range, bar.sessionId)?.getBoundingClientRect();
          if (rect !== undefined) positionAtAnchor(barBoxRef.current, rect, bar.scroll, bar.offset);
        }
        if (editorScroll !== undefined && editorBoxRef.current !== null && editorOffsetRef.current !== null) {
          const rect = currentRange(editor.seed.anchor, editor.seed.range, editor.seed.sessionId)?.getBoundingClientRect();
          if (rect !== undefined) positionAtAnchor(editorBoxRef.current, rect, editorScroll, editorOffsetRef.current);
        }
      };

      useEffect(() => {
        // ponytail: one transcript scrollport; nested independent scrollers need their own marker layer.
        const scroll = document.querySelector('[data-conversation-scroll]');
        if (!(scroll instanceof HTMLElement)) return;
        const previousPosition = scroll.style.position;
        const positioned = getComputedStyle(scroll).position === 'static';
        if (positioned) scroll.style.position = 'relative';
        const markers = new Map();
        const computeMarkers = () => {
          const active = new Set();
          const highlightRanges = [];
          annotations.forEach((annotation, index) => {
            if (annotation.anchor === undefined) return;
            const found = rootOfAnchor(annotation.anchor.nodeKey, annotation.sessionId);
            if (found === undefined || !scroll.contains(found.host)) return;
            const range = rangeOfAnchor(found.host, annotation.anchor);
            if (range === undefined) return;
            highlightRanges.push(range);
            const rects = [...range.getClientRects()].filter(rect => rect.height > 0);
            if (rects.length === 0) return;
            let marker = markers.get(index);
            if (marker === undefined) {
              marker = document.createElement('button');
              marker.type = 'button';
              marker.className = 'dsh-annotations-marker';
              marker.dataset.annotationsSkip = '';
              marker.textContent = String(index + 1);
              marker.title = String(index + 1);
              marker.addEventListener('click', () => access.openAnnotation?.(index));
              markers.set(index, marker);
            }
            if (marker.parentElement !== scroll) scroll.append(marker);
            const placed = placeMarker(rects[rects.length - 1], scroll);
            marker.style.top = `${String(placed.top)}px`;
            marker.style.left = `${String(placed.left)}px`;
            active.add(index);
          });
          for (const [index, marker] of markers) {
            if (!active.has(index)) { marker.remove(); markers.delete(index); }
          }
          if (typeof CSS !== 'undefined' && CSS.highlights !== undefined && typeof Highlight !== 'undefined') {
            CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...highlightRanges));
          }
          repositionRef.current?.();
        };
        computeMarkers();
        let frame;
        const schedule = () => {
          if (frame !== undefined) return;
          frame = window.requestAnimationFrame(() => { frame = undefined; computeMarkers(); });
        };
        window.addEventListener('resize', schedule);
        const root = document.querySelector('[data-conversation-session]');
        const observer = typeof MutationObserver === 'undefined' || root === null ? undefined : new MutationObserver(schedule);
        observer?.observe(root, { childList: true, subtree: true, characterData: true });
        const resize = typeof ResizeObserver === 'undefined' || root === null ? undefined : new ResizeObserver(schedule);
        if (resize !== undefined) resize.observe(root);
        return () => {
          if (frame !== undefined) window.cancelAnimationFrame(frame);
          window.removeEventListener('resize', schedule);
          observer?.disconnect();
          resize?.disconnect();
          for (const marker of markers.values()) marker.remove();
          if (positioned && scroll.style.position === 'relative') scroll.style.position = previousPosition;
          if (typeof CSS !== 'undefined' && CSS.highlights !== undefined) CSS.highlights.delete(HIGHLIGHT_ALL);
        };
      }, [annotations, access]);

      useEffect(() => {
        let selecting = false;
        let mousePoint = null;
        const onPointerDown = (event) => {
          const target = event.target;
          const scroll = document.querySelector('[data-conversation-scroll]');
          selecting = event.pointerType === 'mouse' && event.button === 0 && scroll?.contains(target);
          mousePoint = null;
          if (target instanceof Element && (target.closest('.dsh-annotations-bar, .dsh-annotations-editor, .dsh-annotations-marker, .dsh-annotations-dock') !== null)) {
            selecting = false;
            return;
          }
          // ponytail: touches inside the transcript keep the editor; distinguish taps if tap-to-dismiss is needed.
          if (editorRefState.current !== null && target instanceof Element
            && (target.matches('[data-conversation-scroll]')
              || event.pointerType !== 'mouse' && target.closest('[data-conversation-scroll]') !== null)) return;
          pendingOpenRef.current += 1;
          setBar(null);
          setEditor(null);
        };
        const capture = () => {
          if (editorRefState.current !== null || selecting) return;
          const chat = access.currentChat();
          if (chat === undefined) { setBar(null); return; }
          const value = captureSelection(chat);
          if (value === undefined) { setBar(null); return; }
          const scroll = document.querySelector('[data-conversation-scroll]');
          if (!(scroll instanceof HTMLElement) || !scroll.contains(value.range.commonAncestorContainer)) { setBar(null); return; }
          const bounds = readBounds(scroll);
          const size = { width: BAR_WIDTH, height: BAR_HEIGHT };
          const placed = placeInScroll(mousePoint === null
            ? placeFloating(value.rect, size, bounds)
            : placeNearPointer(mousePoint, size, bounds), scroll);
          const anchor = placeInScroll({ top: value.rect.top, left: value.rect.left }, scroll);
          setBar({ ...value, sessionId: access.currentSessionId(), scroll, placed,
            offset: { top: placed.top - anchor.top, left: placed.left - anchor.left } });
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
        const onDoubleClick = (event) => {
          const selection = window.getSelection();
          if (selection === null) return;
          // A real word selection is already the user's answer; a blank one
          // (double-click past the text end picks up a newline) is not.
          if (!selection.isCollapsed && selection.toString().trim() !== '') return;
          if (typeof document.caretRangeFromPoint !== 'function') return;
          const caret = document.caretRangeFromPoint(event.clientX, event.clientY);
          if (caret === null) return;
          const host = chatHostOf(caret.startContainer);
          const line = host === null ? undefined : lineRangeOf(host, caret.startContainer, caret.startOffset);
          if (line === undefined) return;
          selection.removeAllRanges();
          selection.addRange(line);
          mousePoint = { x: event.clientX, y: event.clientY };
          selecting = false;
          window.clearTimeout(timer);
          timer = window.setTimeout(capture, 0);
        };
        const onPointerUp = (event) => {
          mousePoint = selecting && event.pointerType === 'mouse' ? { x: event.clientX, y: event.clientY } : null;
          selecting = false;
          schedule();
        };
        const onKeyUp = () => { mousePoint = null; schedule(); };
        const onPointerCancel = () => { selecting = false; mousePoint = null; };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('dblclick', onDoubleClick, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('pointercancel', onPointerCancel, true);
        document.addEventListener('keyup', onKeyUp, true);
        document.addEventListener('selectionchange', schedule);
        return () => {
          window.clearTimeout(timer);
          document.removeEventListener('pointerdown', onDown, true);
          document.removeEventListener('dblclick', onDoubleClick, true);
          document.removeEventListener('pointerup', onPointerUp, true);
          document.removeEventListener('pointercancel', onPointerCancel, true);
          document.removeEventListener('keyup', onKeyUp, true);
          document.removeEventListener('selectionchange', schedule);
        };
      }, [access]);

      useLayoutEffect(() => {
        const box = editorBoxRef.current;
        if (box === null || editor === null) return;
        if (editor.seed.barPlaced !== undefined && editorScroll !== undefined) {
          const rect = editor.seed.range?.getBoundingClientRect() ?? editor.seed.rect;
          const anchor = placeInScroll({ top: rect.top, left: rect.left }, editorScroll);
          editorOffsetRef.current = { top: editor.placed.top - anchor.top, left: editor.placed.left - anchor.left };
          return;
        }
        const rect = (editorScroll === undefined ? undefined : editor.seed.range?.getBoundingClientRect()) ?? editor.seed.rect ?? bar?.rect;
        if (rect === undefined) return;
        const placed = positionFloatingBox(box, rect, editorScroll);
        if (editorScroll === undefined) { editorOffsetRef.current = null; return; }
        const anchor = placeInScroll({ top: rect.top, left: rect.left }, editorScroll);
        editorOffsetRef.current = { top: placed.top - anchor.top, left: placed.left - anchor.left };
      }, [editor, editorScroll]);

      const openEditor = (seed) => {
        const bars = bar;
        const scroll = seed?.scroll;
        const bounds = readBounds(scroll);
        const rect = seed !== undefined && seed.rect !== undefined ? seed.rect : bars?.rect ?? { top: bounds.top + 80, bottom: bounds.top + 80, left: 24, right: 24 };
        const barRect = seed.barPlaced === undefined ? undefined : barBoxRef.current?.getBoundingClientRect();
        const placed = barRect === undefined ? placeFloating(rect, editorSize(bounds), bounds)
          : placeWithinBounds({ top: barRect.top, left: barRect.left }, editorSize(bounds), bounds);
        setComment(seed.comment ?? '');
        setEditor({ seed, scroll, placed: scroll === undefined ? placed : placeInScroll(placed, scroll) });
        setBar(null);
      };
      const openAnnotation = (index, fromComposer = false) => {
        const annotation = access.currentAnnotations()[index];
        if (annotation === undefined) return;
        const sessionId = annotation.sessionId ?? access.currentSessionId();
        const original = JSON.stringify(annotation);
        const request = ++pendingOpenRef.current;
        const locate = () => {
          const found = annotation.anchor === undefined ? undefined : rootOfAnchor(annotation.anchor.nodeKey, sessionId);
          const outer = found?.root.querySelector('[data-conversation-scroll]');
          const range = found === undefined ? undefined : rangeOfAnchor(found.host, annotation.anchor);
          if (!(outer instanceof HTMLElement) || !outer.contains(found.host) || range === undefined) return;
          const scrollports = [];
          for (let node = found.host; node !== outer; node = node.parentElement) {
            if (node.scrollHeight > node.clientHeight && /^(auto|scroll)$/.test(getComputedStyle(node).overflowY)) scrollports.push(node);
          }
          scrollports.push(outer);
          const rect = [...range.getClientRects()].filter(part => part.height > 0).at(-1);
          if (rect !== undefined) return { scroll: scrollports[0], scrollports, range, rect };
        };
        const current = () => request === pendingOpenRef.current && sessionId === access.currentSessionId()
          && JSON.stringify(access.currentAnnotations()[index]) === original;
        const unavailable = () => access.currentInput()?.notify?.('error', messages.unavailable);
        const show = () => {
          if (!current()) return;
          const target = locate();
          if (target === undefined) { unavailable(); return; }
          if (fromComposer && target.scrollports.some(scroll => {
            const bounds = readBounds(scroll);
            return target.rect.top < bounds.top || target.rect.bottom > bounds.bottom;
          })) { unavailable(); return; }
          openEditor({ ...annotation, sessionId, index, original, scroll: target.scroll, range: target.range, rect: target.rect });
        };
        if (!fromComposer) { show(); return; }
        window.requestAnimationFrame(() => {
          if (!current()) return;
          const target = locate();
          if (target === undefined) { unavailable(); return; }
          for (const scroll of target.scrollports) {
            const rect = [...target.range.getClientRects()].filter(part => part.height > 0).at(-1);
            if (rect !== undefined) scrollAnnotationIntoView(rect, scroll, readBounds(scroll));
          }
          window.requestAnimationFrame(show);
        });
      };
      useEffect(() => {
        access.openAnnotation = openAnnotation;
        return () => { if (access.openAnnotation === openAnnotation) delete access.openAnnotation; };
      }, [access, bar, language]);

      const save = (comment) => {
        const current = editor;
        if (current === null) return;
        const seed = current.seed;
        const input = access.currentInput();
        if (seed.sessionId !== access.currentSessionId()) {
          input?.notify?.('error', messages.wrongConversationSave);
          return;
        }
        if (input === undefined) return;
        const existing = access.currentAnnotations();
        if (seed.index !== undefined && JSON.stringify(existing[seed.index]) !== seed.original) {
          input.notify?.('error', messages.changedSave);
          return;
        }
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
          input.notify?.('error', messages.saveFailed);
          return;
        }
        setEditor(null);
        focusComposer();
      };

      const remove = () => {
        const current = editor;
        if (current === null || current.seed.index === undefined) return;
        const input = access.currentInput();
        if (current.seed.sessionId !== access.currentSessionId()) {
          input?.notify?.('error', messages.wrongConversationRemove);
          return;
        }
        if (input === undefined) return;
        const existing = access.currentAnnotations();
        if (JSON.stringify(existing[current.seed.index]) !== current.seed.original) {
          input.notify?.('error', messages.changedRemove);
          return;
        }
        if (!writeAnnotations(input, existing.filter((_, position) => position !== current.seed.index))) return;
        setEditor(null);
        focusComposer();
      };

      const floatingEditor = editor === null ? null : h('div', {
        ref: editorBoxRef,
        style: { position: editorScroll === undefined ? 'fixed' : 'absolute',
          top: `${String(editor.placed.top)}px`, left: `${String(editor.placed.left)}px`, zIndex: TRANSCRIPT_OVERLAY_Z },
      },
        h(AnnotationEditor, {
          locale: language,
          draft: editor.seed.text,
          limits: editorSize(readBounds(editorScroll)),
          comment,
          onCommentChange: setComment,
          onSave: save,
          onCancel: () => { setEditor(null); focusComposer(); },
          ...(editor.seed.index === undefined ? {} : { onRemove: remove }),
        }),
      );
      return h(React.Fragment, null,
        bar === null ? null : createPortal(h('div', {
          ref: barBoxRef,
          className: 'dsh-annotations-bar',
          role: 'toolbar',
          'aria-label': messages.add,
          style: { top: `${String(bar.placed.top)}px`, left: `${String(bar.placed.left)}px` },
          onMouseDown: event => event.preventDefault(),
        },
          h('button', { type: 'button', onClick: () => openEditor({ text: bar.text, anchor: bar.anchor, sessionId: bar.sessionId, range: bar.range, rect: bar.rect, scroll: bar.scroll, barPlaced: bar.placed }) },
            h(IconQuote), messages.add),
        ), bar.scroll),
        editorScroll === undefined ? floatingEditor : createPortal(floatingEditor, editorScroll),
      );
    }

    function focusComposer() {
      const seat = document.querySelector('[data-composer-seat] [contenteditable="true"]');
      if (seat instanceof HTMLElement) seat.focus();
    }

    // ---------------------------------------------------------------- registration

    function apply(ctx) {
      const locale = localeFace(ctx.locale);
      const access = createAccess(ctx);

      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.dshAnnotation = '';
        style.textContent = STYLES;
        document.head.append(style);
        return () => style.remove();
      }, 'dsh-annotations.styles');

      const codec = {
        clipboardText: (ref) => {
          const decoded = decodeChip(ref);
          return decoded === undefined ? '' : decoded.annotations.map(annotation => annotation.text).join('\n\n');
        },
        serialize: async (ref, signal) => {
          if (signal.aborted) throw signal.reason;
          const decoded = decodeChip(ref);
          return decoded === undefined ? '' : serializeAnnotations(decoded.annotations);
        },
      };
      for (const name of [SOURCE, LEGACY_SOURCE]) {
        ctx.effect(() => ctx.inputTriggers.registerSource({
          trigger: '@', name, order: 1_000, candidates: async () => [], onPick: () => undefined, codec,
        }), `dsh-annotations.reference-source.${name}`);
      }

      const slots = ctx.slots;

      ctx.effect(() => slots.inject('conversation.input.overlay', () => slots.register({
        name: 'conversation.input.overlay',
        id: 'dsh-annotations-dock',
        order: 40,
      }, () => h(AnnotationDock, { access, locale, onEdit: index => access.openAnnotation?.(index, true) }))), 'dsh-annotations.dock');

      ctx.effect(() => slots.inject('shell.overlay', () => slots.register({
        name: 'shell.overlay',
        id: 'dsh-annotations',
        order: 91,
      }, () => h(AnnotationOverlay, { access, locale }))), 'dsh-annotations.overlay');

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
      ctx.effect(() => { const dispose = shadow('user'); return () => dispose(); }, 'dsh-annotations.shadow-user');
      ctx.effect(() => { const dispose = shadow('steering'); return () => dispose(); }, 'dsh-annotations.shadow-steering');
    }

    return {
      inject: ['sessions', 'slots', 'conversation', 'inputTriggers', 'uiConversation', 'locale'],
      apply,
      __test: {
        localeFace,
        MESSAGES,
        annotationCount,
        offsetsOf,
        rangeEndingInHost,
        serializeAnnotations,
        parseAnnotationContext,
        extractAnnotationContent,
        chipPayload,
        decodeChip,
        occurrenceEditSpan,
        readAnnotations,
        writeAnnotations,
        placeFloating,
        editorSize,
        placeWithinBounds,
        placeNearPointer,
        scrollAnnotationIntoView,
        readBounds,
        placeInScroll,
        positionAtAnchor,
        placeMarker,
        placeDock,
        placeSentPill,
        sentPopoverBelow,
        editsAnnotationChip,
        preserveAnnotationOnDelete,
        clamp,
      },
    };
  },
});
