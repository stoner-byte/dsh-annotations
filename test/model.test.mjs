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
  const parsed = api.parseAsideContext(`${api.serializeAnnotations(annotations)}\n\nMy real question`);
  assert.deepEqual(parsed, { annotations, message: 'My real question' });
});

test('client and host declare the same four methods', async () => {
  const host = await readFile(fileURLToPath(new URL('../lib/typert.js', import.meta.url)), 'utf8');
  for (const method of ['create', 'stream', 'cancel', 'close']) {
    assert.ok(source.includes(`wireInvocation('${method}'`), `client.js must declare ${method}`);
    assert.ok(host.includes(`descriptor('${method}'`), `lib/typert.js must declare ${method}`);
  }
});

test('plain messages are not treated as annotations', () => {
  assert.equal(api.parseAsideContext('hello <aside_context>'), undefined);
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
  const overlay = source.split('function AsideOverlay(')[1].split('function focusComposer(')[0];
  assert.match(source, /\.dsh-aside-marker\{position:absolute/);
  assert.match(overlay, /scroll.append\(marker\)/);
  assert.match(overlay, /for \(const marker of markers.values\(\)\) marker.remove\(\)/);
  assert.match(overlay, /scroll.style.position = previousPosition/);
  assert.doesNotMatch(overlay, /addEventListener\('scroll'|markers.map\(/);
});

test('transcript controls use scroll coordinates and composer editor stays fixed', () => {
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
  const overlay = source.split('function AsideOverlay(')[1].split('function focusComposer(')[0];
  assert.match(overlay, /bar === null \? null : createPortal\(h\('div'/);
  assert.match(overlay, /createPortal\(floatingEditor, editorScroll\)/);
  assert.match(overlay, /editorScroll === undefined \? 'fixed' : 'absolute'/);
  assert.match(overlay, /seed\.sessionId !== access\.currentSessionId\(\)/);
  assert.match(overlay, /event\.pointerType !== 'mouse'/);
  assert.doesNotMatch(overlay, /addEventListener\('scroll'/);
});

test('composer annotation preview opens on hover without click-to-toggle', () => {
  const dock = source.split('function AsideDock(')[1].split('function AsideMessages(')[0];
  assert.match(dock, /onMouseEnter: \(\) => setExpanded\(true\)/);
  assert.match(dock, /onMouseLeave: \(\) => setExpanded\(false\)/);
  assert.doesNotMatch(dock.split("className: 'dsh-aside-capsule'")[1].split("h('span'")[0], /onClick/);
  assert.match(dock, /className: 'dsh-aside-close'/);
  assert.match(dock, /onClick: clear/);
  assert.doesNotMatch(dock, /expanded \? '▾' : '▸'/);
});

test('composer entries and transcript badges share one floating editor', () => {
  const dock = source.split('function AsideDock(')[1].split('function AsideMessages(')[0];
  const overlay = source.split('function AsideOverlay(')[1].split('function focusComposer(')[0];
  const preview = source.split('function AsidePreview(')[1].split('function placeDock(')[0];
  assert.match(preview, /onEdit\(index, event.currentTarget.getBoundingClientRect\(\)\)/);
  assert.match(dock, /onEdit: \(index, rect\) => \{ setExpanded\(false\); onEdit\(index, rect\); \}/);
  assert.match(overlay, /access.openAnnotation = openAnnotation/);
  assert.match(overlay, /marker.addEventListener\('click', \(\) => access.openAnnotation\?\.\(index\)\)/);
  assert.match(overlay, /openEditor\(\{\s*text: annotation.text,/);
  assert.match(overlay, /rect: rect !== undefined && rect.bottom >= bounds.top && rect.top <= bounds.bottom \? rect : fallbackRect/);
  assert.doesNotMatch(source, /AsideDockHost|dsh-aside-dock-editor|--dsh-aside-editor-/);
});

test('composer and sent annotations share one hover preview layout', () => {
  const dock = source.split('function AsideDock(')[1].split('function AsideMessages(')[0];
  const sent = source.split('function AsideMessages(')[1].split('function contentText(')[0];
  const preview = source.split('function AsidePreview(')[1].split('function placeDock(')[0];
  assert.match(dock, /h\(AsidePreview, \{\s*annotations, locale, className: 'dsh-aside-list'/);
  assert.match(sent, /h\(AsidePreview, \{ annotations, locale, className: 'dsh-aside-card-body' \}\)/);
  assert.match(source, /\.dsh-aside-preview\{[^}]*width:min\(320px,calc\(100vw - 32px\)\)/);
  assert.match(source, /background:var\(--dsh-surface-raised,Canvas\)/);
  assert.match(source, /\.dsh-aside-preview-index\{[^}]*background:var\(--dsh-accent,#3b82f6\)/);
  assert.match(preview, /className: 'dsh-aside-preview-index' \}, String\(index \+ 1\)/);
  assert.doesNotMatch(preview, /messages.quote|messages.commentLabel|blockquote/);
  assert.match(dock, /window.innerWidth - 16 - dockRef.current.getBoundingClientRect\(\).left - list.offsetWidth/);
  assert.match(preview, /onRemove === undefined \? null/);
});

test('sent annotation is a hover pill positioned after attachments', () => {
  const sent = source.split('function AsideMessages(')[1].split('function contentText(')[0];
  assert.equal(api.placeSentPill({ top: 100 }, { bottom: 230 }), 138);
  assert.equal(api.sentPopoverBelow({ top: 50, bottom: 80 }, 150, 700), true);
  assert.equal(api.sentPopoverBelow({ top: 420, bottom: 450 }, 150, 700), false);
  assert.match(sent, /querySelector\('\[data-message-attachments\]'\)/);
  assert.match(sent, /onMouseEnter: \(\) => setExpanded\(true\)/);
  assert.match(sent, /onFocus: \(\) => setExpanded\(true\)/);
  assert.doesNotMatch(sent, /onClick: \(\) => setExpanded|▸|▾/);
  assert.match(source, /\[data-message-attachments\]\{margin-bottom:38px\}/);
  assert.doesNotMatch(source, /\.dsh-aside-card-pill\{[^}]*width:100%/);
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
  } finally {
    globalThis.document = previousDocument;
    globalThis.Range = previousRange;
  }
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
