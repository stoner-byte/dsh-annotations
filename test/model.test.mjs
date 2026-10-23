import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = await readFile(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8');

let module;
globalThis.window = { __ModuleLoader__: { load: (value) => { module = value; } } };
new Function(source)();
globalThis.window = undefined;

const react = {
  createElement: () => null,
  Fragment: Symbol('Fragment'),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useSyncExternalStore: (_subscribe, get) => get(),
};
const api = module.factory((name) => {
  if (name === 'react') return react;
  if (name === 'react-dom') return { createPortal: node => node };
  throw new Error(`unexpected module ${name}`);
}).__test;

test('annotation payload survives the model-facing round trip', () => {
  const annotations = [
    { text: 'a < b & c', comment: 'why?' },
    { text: 'line1\nline2' },
  ];
  const xml = api.serializeAnnotations(annotations);
  const parsed = api.parseAnnotationContext(`${xml}\n\nMy real question`);
  assert.deepEqual(parsed, { annotations, start: 0, end: xml.length });
});

test('selection toolbar is agent-only and offers only the annotation action', () => {
  const overlay = source.split('function AnnotationOverlay(')[1].split('function focusComposer(')[0];
  assert.match(source, /descriptor\.source !== 'assistant'/);
  assert.match(overlay, /h\(IconQuote\), messages.add\)/);
  assert.doesNotMatch(overlay, /IconAsk|sidechat|sidebarRight/);
});

test('plain messages are not treated as annotations', () => {
  assert.equal(api.parseAnnotationContext('hello <annotation_context>'), undefined);
});

test('historical aside XML remains readable without changing its message text', () => {
  const annotations = [{ text: 'old selection', comment: 'old note' }];
  const xml = api.serializeAnnotations(annotations)
    .replace('<annotation_context>', '<aside_context>')
    .replace('</annotation_context>', '</aside_context>');
  assert.deepEqual(api.parseAnnotationContext(xml), { annotations, start: 0, end: xml.length });
  const parsed = api.extractAnnotationContent([{ type: 'text', text: `before${xml}after` }]);
  assert.deepEqual(parsed.annotations, annotations);
  assert.deepEqual(parsed.content, [{ type: 'text', text: 'beforeafter' }]);
  assert.equal(api.parseAnnotationContext(xml.replace('</aside_context>', '</annotation_context>')), undefined);
});

test('sent annotations render at the beginning, middle, or end without changing surrounding text', () => {
  const annotations = [{ text: 'a < b', comment: 'why & how' }];
  const xml = api.serializeAnnotations(annotations);
  for (const [before, after] of [['', ' qwe'], ['qe', 'after'], ['aats', '']]) {
    const text = `${before}${xml}${after}`;
    assert.deepEqual(api.parseAnnotationContext(text), {
      annotations, start: before.length, end: before.length + xml.length,
    });
  }
  assert.equal(api.parseAnnotationContext(`x${xml}y${xml}z`), undefined);
  assert.equal(api.parseAnnotationContext(xml.replace('</selected_text>', '</wrong_text>')), undefined);
  assert.equal(api.parseAnnotationContext(xml.replace('index="1"', 'index="2"')), undefined);
});

test('sent display strips only the XML span and preserves text blocks and attachments', () => {
  const xml = api.serializeAnnotations([{ text: 'passage' }]);
  const content = [
    { type: 'text', text: 'before', tone: 'keep' },
    { type: 'text', text: xml.slice(0, 22) },
    { type: 'text', text: `${xml.slice(22)} after` },
    { type: 'image', id: 'image-1' },
    { type: 'text', text: 'later' },
  ];
  const parsed = api.extractAnnotationContent(content);
  assert.deepEqual(parsed.annotations, [{ text: 'passage' }]);
  assert.deepEqual(parsed.content, [
    content[0], { type: 'text', text: '' }, { type: 'text', text: ' after' }, content[3], content[4],
  ]);
  assert.deepEqual(content[1], { type: 'text', text: xml.slice(0, 22) });
  assert.equal(api.extractAnnotationContent([
    { type: 'text', text: xml.slice(0, 22) }, content[3], { type: 'text', text: xml.slice(22) },
  ]), undefined);
});

test('chip payload rejects a foreign version and keeps anchors', () => {
  const anchor = { nodeKey: 'user-3', nodeKind: 'user', turnKey: 'turn:2', seq: 7, startOffset: 4, endOffset: 12 };
  const ref = JSON.stringify(api.chipPayload('session-1', [{ text: 'passage', anchor }]));
  assert.deepEqual(api.decodeChip(ref), { sessionId: 'session-1', annotations: [{ text: 'passage', anchor }] });
  assert.equal(api.decodeChip(JSON.stringify({ version: 99, annotations: [] })), undefined);
  assert.equal(api.decodeChip('not json'), undefined);
});

test('a chip is one atomic editor span even behind another reference', () => {
  const snapshot = {
    draft: '[file] passage',
    draftRev: 4,
    occurrences: [
      { offset: 0, length: 6, label: '[file]', clipboardText: '[file]', source: 'file', occurrenceId: 'a' },
      { offset: 7, length: 7, label: '__dsh_aside_annotations__', clipboardText: 'passage', source: 'aside-annotations', occurrenceId: 'b' },
    ],
  };
  const span = api.occurrenceEditSpan(snapshot, snapshot.occurrences[1]);
  assert.deepEqual(span, { start: 2, end: 3, draftRev: 4 });
  const stale = { ...snapshot, draft: '[file] other' };
  assert.equal(api.occurrenceEditSpan(stale, stale.occurrences[1]), undefined);
});

test('closing the capsule clears only the annotation reference', () => {
  const snapshot = {
    draft: '[file] passage', draftRev: 4,
    occurrences: [
      { offset: 0, length: 6, label: '[file]', clipboardText: '[file]', source: 'file' },
      { offset: 7, length: 7, label: '__dsh_aside_annotations__', clipboardText: 'passage', source: 'aside-annotations' },
    ],
  };
  let removal;
  const input = { state: { getSnapshot: () => snapshot }, replaceText: (text, span) => { removal = { text, span }; return true; } };
  assert.equal(api.writeAnnotations(input, []), true);
  assert.deepEqual(removal, { text: '', span: { start: 2, end: 3, draftRev: 4 } });
});

test('old draft chips remain readable and edits use the renamed source', () => {
  const occurrence = { source: 'aside-annotations', label: '__dsh_aside_annotations__',
    ref: JSON.stringify(api.chipPayload('s', [{ text: 'old' }])), clipboardText: 'old', offset: 0, length: 3 };
  const snapshot = { draft: 'old', draftRev: 2, occurrences: [occurrence] };
  assert.deepEqual(api.readAnnotations(snapshot), [{ text: 'old', sessionId: 's' }]);
  let inserted;
  const input = { state: { getSnapshot: () => snapshot },
    insertReference: (reference, span) => { inserted = { reference, span }; return true; } };
  assert.equal(api.writeAnnotations(input, [{ text: 'new', sessionId: 's' }]), true);
  assert.deepEqual(inserted.span, { start: 0, end: 1, draftRev: 2 });
  assert.equal(inserted.reference.source, 'dsh-annotations');
  assert.equal(inserted.reference.label, '__dsh_annotations__');
  assert.deepEqual(api.readAnnotations({ occurrences: [{ ...inserted.reference }] }), [{ text: 'new', sessionId: 's' }]);
});

test('annotations are read from the chips and count once per payload', () => {
  const ref = JSON.stringify(api.chipPayload('s', [{ text: 'one' }, { text: 'two', comment: 'note' }]));
  const snapshot = {
    draft: 'onetwo', draftRev: 1,
    occurrences: [{ offset: 0, length: 6, label: '__dsh_aside_annotations__', clipboardText: 'one\n\ntwo', source: 'aside-annotations', occurrenceId: 'c' }],
  };
  snapshot.draft = 'one\n\ntwo';
  snapshot.occurrences[0].ref = ref;
  assert.deepEqual(api.readAnnotations(snapshot), [
    { text: 'one', sessionId: 's' },
    { text: 'two', comment: 'note', sessionId: 's' },
  ]);
});

test('whole-paragraph boundaries retain text offsets across inline controls', () => {
  const previousDocument = globalThis.document;
  const previousNodeFilter = globalThis.NodeFilter;
  const previousNode = globalThis.Node;
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  globalThis.Node = { TEXT_NODE: 3 };
  const visible = { nodeType: 3, nodeValue: 'abc', position: 0, parentElement: { closest: () => null } };
  const skipped = { nodeType: 3, nodeValue: 'x', position: 3, parentElement: { closest: () => ({}) } };
  const following = { nodeType: 3, nodeValue: 'def', position: 4, parentElement: { closest: () => null } };
  const firstParagraph = { boundaries: [0, 3] };
  const secondParagraph = { boundaries: [4, 7] };
  const position = (node, offset) => node.nodeType === 3 ? node.position + offset : node.boundaries[offset];
  globalThis.document = {
    createTreeWalker: () => {
      const nodes = [visible, skipped, following];
      return { nextNode: () => nodes.shift() ?? null };
    },
    createRange: () => ({
      setStart(node, offset) { this.position = position(node, offset); },
      collapse() {},
      comparePoint(node, offset) { return Math.sign(position(node, offset) - this.position); },
    }),
  };
  try {
    assert.deepEqual(api.offsetsOf({}, {
      startContainer: firstParagraph, startOffset: 0, endContainer: firstParagraph, endOffset: 1,
    }), { start: 0, end: 3 });
    assert.deepEqual(api.offsetsOf({}, {
      startContainer: firstParagraph, startOffset: 0, endContainer: secondParagraph, endOffset: 1,
    }), { start: 0, end: 6 });
    assert.deepEqual(api.offsetsOf({}, {
      startContainer: visible, startOffset: 1, endContainer: following, endOffset: 2,
    }), { start: 1, end: 5 });
    assert.equal(api.offsetsOf({}, {
      startContainer: skipped, startOffset: 0, endContainer: following, endOffset: 2,
    }), undefined);
  } finally {
    globalThis.document = previousDocument;
    globalThis.NodeFilter = previousNodeFilter;
    globalThis.Node = previousNode;
  }
});

test('a selection ending on the next message boundary stays in its own message', () => {
  const previousDocument = globalThis.document;
  const previousNodeFilter = globalThis.NodeFilter;
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  const last = { nodeValue: 'last paragraph', parentElement: { closest: () => null } };
  const control = { nodeValue: 'toolbar', parentElement: { closest: () => ({}) } };
  globalThis.document = { createTreeWalker: () => {
    const nodes = [last, control];
    return { nextNode: () => nodes.shift() ?? null };
  } };
  const range = {
    comparePoint: () => 0,
    cloneRange: () => ({
      setEnd(node, offset) { assert.equal(node, last); assert.equal(offset, last.nodeValue.length); },
      toString: () => 'last paragraph',
    }),
  };
  try {
    assert.equal(api.rangeEndingInHost(range, {}, 'last paragraph\n').text, 'last paragraph');
    assert.equal(api.rangeEndingInHost(range, {}, 'last paragraph and next message'), undefined);
    assert.equal(api.rangeEndingInHost({ ...range, comparePoint: () => 1 }, {}, 'last paragraph'), undefined);
  } finally {
    globalThis.document = previousDocument;
    globalThis.NodeFilter = previousNodeFilter;
  }
});

test('the toolbar prefers above, flips below, and stays inside the viewport', () => {
  const bounds = { top: 100, bottom: 700, left: 0, right: 800 };
  const above = api.placeFloating({ top: 300, bottom: 320, left: 40, right: 200 }, { width: 320, height: 36 }, bounds);
  assert.equal(above.placement, 'above');
  assert.equal(above.top, 300 - 36 - 18);
  assert.equal(above.left, 40);

  const below = api.placeFloating({ top: 110, bottom: 130, left: 40, right: 200 }, { width: 320, height: 36 }, bounds);
  assert.equal(below.placement, 'below');
  assert.equal(below.top, 148);

  const right = api.placeFloating({ top: 300, bottom: 320, left: 790, right: 800 }, { width: 320, height: 36 }, bounds);
  assert.equal(right.left, 800 - 320 - 8);

  const editor = api.placeFloating({ top: 300, bottom: 320, left: 40, right: 200 }, { width: 320, height: 150 }, bounds);
  assert.equal(editor.top, 300 - 150 - 18);
});

test('badge uses scroll-content coordinates inside the scrollport', () => {
  const scroll = {
    getBoundingClientRect: () => ({ top: 80, left: 100 }),
    clientTop: 1, clientLeft: 2, scrollTop: 260, scrollLeft: 0,
  };
  assert.deepEqual(api.placeMarker({ top: 335, right: 739 }, scroll), { top: 492, left: 641 });
  scroll.scrollTop += 100;
  assert.deepEqual(api.placeMarker({ top: 235, right: 739 }, scroll), { top: 492, left: 641 });
  const overlay = source.split('function AnnotationOverlay(')[1].split('function focusComposer(')[0];
  assert.match(source, /\.dsh-annotations-marker\{position:absolute;z-index:1;/);
  assert.match(overlay, /scroll.append\(marker\)/);
  assert.match(overlay, /for \(const marker of markers.values\(\)\) marker.remove\(\)/);
  assert.match(overlay, /scroll.style.position = previousPosition/);
  assert.doesNotMatch(overlay, /addEventListener\('scroll'|markers.map\(/);
});

test('transcript controls use scroll coordinates and detached editor falls back to fixed', () => {
  const scroll = {
    getBoundingClientRect: () => ({ top: 80, left: 100, right: 500, bottom: 700 }),
    clientTop: 1, clientLeft: 2, scrollTop: 260, scrollLeft: 40,
  };
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { querySelector: selector => selector === '[data-composer-seat]'
    ? { getBoundingClientRect: () => ({ top: 660 }) } : scroll };
  globalThis.window = { innerHeight: 800, innerWidth: 1200 };
  try {
    assert.deepEqual(api.readBounds(scroll), { top: 80, bottom: 660, left: 100, right: 500 });
    assert.deepEqual(api.readBounds(), { top: 80, bottom: 660, left: 0, right: 1200 });
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
  assert.deepEqual(api.placeInScroll({ top: 235, left: 400 }, scroll), { top: 414, left: 338 });
  scroll.scrollTop += 100;
  assert.deepEqual(api.placeInScroll({ top: 135, left: 400 }, scroll), { top: 414, left: 338 });
  const box = { style: {} };
  api.positionAtAnchor(box, { top: 135, left: 400 }, scroll, { top: -54, left: 2 });
  assert.deepEqual(box.style, { top: '360px', left: '340px' });
  const overlay = source.split('function AnnotationOverlay(')[1].split('function focusComposer(')[0];
  assert.match(overlay, /bar === null \? null : createPortal\(h\('div'/);
  assert.match(overlay, /createPortal\(floatingEditor, editorScroll\)/);
  assert.match(overlay, /editorScroll === undefined \? 'fixed' : 'absolute'/);
  assert.match(overlay, /seed\.sessionId !== access\.currentSessionId\(\)/);
  assert.match(overlay, /event\.pointerType !== 'mouse'/);
  assert.doesNotMatch(overlay, /addEventListener\('scroll'/);
});

test('composer annotation preview opens on hover without click-to-toggle', () => {
  const dock = source.split('function AnnotationDock(')[1].split('function AnnotationMessages(')[0];
  assert.match(dock, /onMouseEnter: \(\) => setExpanded\(true\)/);
  assert.match(dock, /onMouseLeave: \(\) => setExpanded\(false\)/);
  assert.doesNotMatch(dock.split("className: 'dsh-annotations-capsule dsh-annotations-card-pill'")[1].split("h('svg'")[0], /onClick/);
  assert.match(dock, /className: 'dsh-annotations-capsule-text'/);
  assert.match(dock, /h\('path', \{ d: 'M5 3\.75h10/);
  assert.match(source, /\.dsh-annotations-dock:hover \.dsh-annotations-capsule-text,[^}]+mask-image:linear-gradient/);
  assert.match(source, /\.dsh-annotations-close\{[^}]+z-index:1;[^}]+border-radius:50%/);
  assert.doesNotMatch(source, /dsh-annotations-capsule-count|padding:0 31px/);
  assert.match(dock, /className: 'dsh-annotations-close'/);
  assert.match(dock, /onClick: clear/);
  assert.doesNotMatch(dock, /expanded \? '▾' : '▸'/);
});

test('composer entries scroll to loaded text and share the badge editor', () => {
  const dock = source.split('function AnnotationDock(')[1].split('function AnnotationMessages(')[0];
  const overlay = source.split('function AnnotationOverlay(')[1].split('function focusComposer(')[0];
  const preview = source.split('function AnnotationPreview(')[1].split('function placeDock(')[0];
  const scroll = { scrollTop: 300 };
  api.scrollAnnotationIntoView({ top: 900, bottom: 920 }, scroll, { top: 100, bottom: 700 });
  assert.equal(scroll.scrollTop, 800);
  api.scrollAnnotationIntoView({ top: 380, bottom: 420 }, scroll, { top: 100, bottom: 700 });
  assert.equal(scroll.scrollTop, 800);
  api.scrollAnnotationIntoView({ top: 50, bottom: 70 }, scroll, { top: 100, bottom: 700 });
  assert.equal(scroll.scrollTop, 450);
  assert.match(preview, /onEdit\(index\)/);
  assert.match(dock, /onEdit: \(index\) => \{ setExpanded\(false\); onEdit\(index\); \}/);
  assert.match(source, /onEdit: index => access.openAnnotation\?\.\(index, true\)/);
  assert.match(overlay, /access.openAnnotation = openAnnotation/);
  assert.match(source, /sessionId === undefined \? null : document.querySelector\(`/);
  assert.match(source, /document.querySelector\('\[data-conversation-scroll\]'\)\?\.closest\('\[data-conversation-session\]'\)/);
  assert.match(overlay, /marker.addEventListener\('click', \(\) => access.openAnnotation\?\.\(index\)\)/);
  assert.match(overlay, /for \(const scroll of target.scrollports\)/);
  assert.match(overlay, /scrollAnnotationIntoView\(rect, scroll, readBounds\(scroll\)\)/);
  assert.match(overlay, /window.requestAnimationFrame\(show\)/);
  assert.match(overlay, /JSON.stringify\(access.currentAnnotations\(\)\[index\]\) === original/);
  assert.match(overlay, /openEditor\(\{ \.\.\.annotation, sessionId, index, original, scroll: target.scroll, range: target.range, rect: target.rect \}\)/);
  assert.doesNotMatch(overlay, /fallbackRect/);
  assert.doesNotMatch(source, /AnnotationDockHost|dsh-annotations-dock-editor|--dsh-annotations-editor-/);
});

test('composer and sent annotations share one hover preview layout', () => {
  const dock = source.split('function AnnotationDock(')[1].split('function AnnotationMessages(')[0];
  const sent = source.split('function AnnotationMessages(')[1].split('function contentText(')[0];
  const preview = source.split('function AnnotationPreview(')[1].split('function placeDock(')[0];
  assert.match(dock, /h\(AnnotationPreview, \{\s*annotations, locale, className: 'dsh-annotations-list'/);
  assert.match(sent, /h\(AnnotationPreview, \{ annotations, locale, className: 'dsh-annotations-card-body' \}\)/);
  assert.match(source, /\.dsh-annotations-preview\{[^}]*width:min\(320px,calc\(100vw - 32px\)\)/);
  assert.match(source, /\.dsh-annotations-dock:has\(\.dsh-annotations-list\),\.dsh-annotations-card:has\(\.dsh-annotations-card-body\)\{z-index:6\}/);
  assert.match(source, /background:var\(--dsh-surface-raised,Canvas\)/);
  assert.match(source, /\.dsh-annotations-preview-index\{[^}]*background:var\(--dsh-accent,#3b82f6\)/);
  assert.match(preview, /className: 'dsh-annotations-preview-index' \}, String\(index \+ 1\)/);
  assert.doesNotMatch(preview, /messages.quote|messages.commentLabel|blockquote/);
  assert.match(dock, /window.innerWidth - 16 - dockRef.current.getBoundingClientRect\(\).left - list.offsetWidth/);
  assert.match(preview, /onRemove === undefined \? null/);
});

test('preview shows full quote and comment within one scrollable height limit', () => {
  const preview = source.split('function AnnotationPreview(')[1].split('function placeDock(')[0];
  assert.match(preview, /title: annotation.text/);
  assert.match(preview, /title: annotation.comment/);
  assert.doesNotMatch(preview, /truncated|expandedIndex|preview-expand|scrollHeight/);
  assert.match(source, /\.dsh-annotations-preview\{[^}]+max-height:360px;\s*overflow:auto/);
  assert.match(source, /\.dsh-annotations-preview-quote,\.dsh-annotations-preview-comment\{white-space:pre-wrap;overflow-wrap:anywhere/);
  assert.doesNotMatch(source, /-webkit-line-clamp|\.dsh-annotations-preview-row-expanded|\.dsh-annotations-preview-expand\{/);
});

test('sent annotation is a hover pill positioned after attachments', () => {
  const sent = source.split('function AnnotationMessages(')[1].split('function contentText(')[0];
  assert.equal(api.placeSentPill({ top: 100 }, { bottom: 230 }), 138);
  assert.equal(api.sentPopoverBelow({ top: 50, bottom: 80 }, 150, 700), true);
  assert.equal(api.sentPopoverBelow({ top: 420, bottom: 450 }, 150, 700), false);
  assert.match(sent, /querySelector\('\[data-message-attachments\]'\)/);
  assert.match(sent, /onMouseEnter: \(\) => setExpanded\(true\)/);
  assert.match(sent, /onFocus: \(\) => setExpanded\(true\)/);
  assert.match(sent, /const resize = new ResizeObserver\(place\)/);
  assert.doesNotMatch(sent, /onClick: \(\) => setExpanded|▸|▾/);
  assert.match(source, /\[data-message-attachments\]\{margin-bottom:38px\}/);
  assert.doesNotMatch(source, /\.dsh-annotations-card-pill\{[^}]*width:100%/);
});

test('editor keeps the hidden annotation chip when Backspace or a selection reaches it', () => {
  const previousDocument = globalThis.document;
  const previousRange = globalThis.Range;
  globalThis.Range = { START_TO_END: 1, START_TO_START: 2 };
  globalThis.document = { createRange: () => ({ selectNode() {} }) };
  try {
    const chip = { contains: () => false };
    const editor = { querySelectorAll: () => [chip] };
    const caret = (position, gap) => ({
      collapsed: true, startContainer: null,
      compareBoundaryPoints: () => position,
      cloneRange: () => ({ setStartAfter() {}, setEndBefore() {}, toString: () => gap }),
    });
    assert.equal(api.editsAnnotationChip(editor, caret(1, ''), 'Backspace'), true);
    assert.equal(api.editsAnnotationChip(editor, caret(1, 'text'), 'Backspace'), false);
    assert.equal(api.editsAnnotationChip(editor, caret(-1, ''), 'Backspace'), false);
    assert.equal(api.editsAnnotationChip(editor, caret(-1, ''), 'Delete'), true);
    assert.equal(api.editsAnnotationChip(editor, caret(1, 'text'), 'deleteSoftLineBackward'), true);
    assert.equal(api.editsAnnotationChip(editor, caret(1, '  '), 'deleteWordBackward'), true);
    assert.equal(api.editsAnnotationChip(editor, caret(1, 'text'), 'deleteWordBackward'), false);
    assert.equal(api.editsAnnotationChip(editor, { collapsed: false, intersectsNode: () => true }, 'insertText'), true);
    assert.equal(api.editsAnnotationChip(editor, { collapsed: false, intersectsNode: () => false }, 'deleteByCut'), false);
    assert.match(source, /\['keydown', 'beforeinput', 'paste', 'cut', 'dragstart', 'drop'\]/);
  } finally {
    globalThis.document = previousDocument;
    globalThis.Range = previousRange;
  }
});

test('ordinary delete skips the hidden chip, including full-select and grapheme boundaries', () => {
  const ref = JSON.stringify(api.chipPayload('s', [{ text: 'passage' }]));
  const occurrence = { source: 'aside-annotations', ref, label: '__dsh_aside_annotations__',
    clipboardText: 'passage', offset: 3, length: 7 };
  const snapshot = { draft: 'a👩‍💻passageb', draftRev: 8, phase: 'plain', occurrences: [
    { ...occurrence, offset: 6 },
  ] };
  let selection;
  const calls = [];
  const input = {
    state: { getSnapshot: () => snapshot }, caretSpan: () => selection,
    replaceText: (text, span) => { calls.push(['text', text, span]); return true; },
    insertReference: (value, span) => { calls.push(['reference', value, span]); return true; },
  };
  selection = { start: 0, end: 8 }; // a + five UTF-16 units for the emoji + one chip + b
  assert.equal(api.preserveAnnotationOnDelete(input, 'Backspace'), true);
  assert.deepEqual(calls.pop(), ['reference', {
    source: occurrence.source, ref, label: occurrence.label, clipboardText: occurrence.clipboardText,
  }, { start: 0, end: 8, draftRev: 8 }]);
  selection = { start: 7, end: 7 };
  assert.equal(api.preserveAnnotationOnDelete(input, 'Backspace'), true);
  assert.deepEqual(calls.pop(), ['text', '', { start: 1, end: 6, draftRev: 8 }]);
  selection = { start: 6, end: 6 };
  assert.equal(api.preserveAnnotationOnDelete(input, 'Delete'), true);
  assert.deepEqual(calls.pop(), ['text', '', { start: 7, end: 8, draftRev: 8 }]);
  selection = { start: 1, end: 8 };
  assert.equal(api.preserveAnnotationOnDelete(input, 'Delete'), false);
  assert.equal(calls.length, 0);
});

test('full-select span counts other references as one editor position', () => {
  const note = { source: 'aside-annotations', ref: 'note-ref', label: '__dsh_aside_annotations__',
    clipboardText: 'passage', offset: 9, length: 7 };
  const snapshot = { draft: '[file] abpassagecd', draftRev: 9, phase: 'plain', occurrences: [
    { source: 'file', ref: 'file-ref', label: '[file]', clipboardText: '[file]', offset: 0, length: 6 }, note,
  ] };
  let span;
  const input = { state: { getSnapshot: () => snapshot }, caretSpan: () => ({ start: 0, end: 7 }),
    insertReference: (value, at) => { span = at; assert.equal(value.ref, note.ref); return true; } };
  assert.equal(api.preserveAnnotationOnDelete(input, 'Delete'), true);
  assert.deepEqual(span, { start: 0, end: 7, draftRev: 9 });
});

test('composer annotation sits beside an image or below a crowded attachment rail', () => {
  const card = { left: 100, top: 100, right: 500 };
  const rail = { right: 500, bottom: 230 };
  const image = { right: 184, bottom: 230, width: 64 };
  const dock = { width: 140, height: 30 };
  assert.deepEqual(api.placeDock(card, rail, image, dock),
    { left: 94, top: 100, inline: true });
  assert.deepEqual(api.placeDock({ ...card, right: 280 }, { ...rail, right: 280 }, image, dock),
    { left: 14, top: 138, inline: false });
  assert.deepEqual(api.placeDock(card, undefined, undefined, dock),
    { left: 14, top: 8, inline: false });
});
