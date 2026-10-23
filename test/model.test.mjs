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
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useSyncExternalStore: (_subscribe, get) => get(),
};
const api = module.factory((name) => {
  if (name === 'react') return react;
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

test('badge sits above the end of selected text', () => {
  assert.deepEqual(api.placeMarker({ top: 335, right: 739 }, { width: 1280, height: 577 }),
    { top: 313, left: 743 });
});

test('composer annotation preview opens on hover without click-to-toggle', () => {
  const dock = source.split('function AsideDock(')[1].split('function AsideMessages(')[0];
  assert.match(dock, /onMouseEnter: \(\) => setExpanded\(true\)/);
  assert.match(dock, /onMouseLeave: \(\) => setExpanded\(false\)/);
  assert.doesNotMatch(dock.split("className: 'dsh-aside-capsule'")[1].split("h('span'")[0], /onClick/);
});

test('composer annotation sits beside an image or below a crowded attachment rail', () => {
  const card = { left: 100, top: 100, right: 500 };
  const rail = { right: 500, bottom: 230 };
  const image = { right: 184, bottom: 230, width: 64 };
  const dock = { width: 140, height: 30 };
  assert.deepEqual(api.placeDock(card, rail, image, dock),
    { left: 94, top: 100, editorTop: 138, inline: true });
  assert.deepEqual(api.placeDock({ ...card, right: 280 }, { ...rail, right: 280 }, image, dock),
    { left: 14, top: 138, editorTop: 174, inline: false });
  assert.deepEqual(api.placeDock(card, undefined, undefined, dock),
    { left: 14, top: 8, editorTop: 44, inline: false });
});
