import { z } from 'zod';

const id = z.string().min(1).max(512);

const modelSelection = z.strictObject({
  provider: id,
  model: id,
  reasoningEffort: id.optional(),
});

const errorCode = z.enum([
  'invalid_request',
  'parent_session_missing',
  'context_unavailable',
  'context_too_large',
  'aside_not_found',
  'aside_already_open',
  'prompt_failed',
  'model_failed',
  'interrupt_failed',
  'transport_error',
  'internal_error',
]);

const wireError = z.strictObject({
  code: errorCode,
  message: z.string(),
  recoverable: z.boolean(),
});

const value = (shape) => z.strictObject({ ok: z.literal(true), value: shape });
const failure = z.strictObject({ ok: z.literal(false), error: wireError });
const result = (shape) => z.union([value(shape), failure]);

const createRequest = z.strictObject({
  parentSessionId: id,
  atSeq: z.number().int().nonnegative(),
  selectedText: z.string().max(16384).optional(),
  modelSelection: modelSelection.optional(),
});

const createValue = z.strictObject({
  chatId: id,
  boundarySeq: z.number().int().nonnegative(),
  modelSelection,
});

const streamRequest = z.strictObject({
  chatId: id,
  requestId: id,
  text: z.string().min(1).max(65536),
});

const streamEvent = z.union([
  z.strictObject({ type: z.literal('started'), requestId: id }),
  z.strictObject({ type: z.literal('content'), text: z.string(), reasoning: z.string() }),
  z.strictObject({ type: z.literal('finished'), status: z.enum(['complete', 'stopped']) }),
  z.strictObject({ type: z.literal('error'), error: wireError }),
]);

const chatRequest = z.strictObject({ chatId: id });
const closeValue = z.strictObject({ closed: z.literal(true) });
const cancelValue = z.strictObject({ cancelled: z.literal(true) });

/**
 * One Host-to-Client invocation descriptor, in the same shape the Typert build
 * emits for decorated services. The Client mounts the same list through
 * `ctx.remote.$mount`, so both halves agree on wire identity and codecs.
 */
function descriptor(method, requestType, requestSchema, resultType, resultSchema, options = {}) {
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

export const ASIDE_INVOCATIONS = [
  descriptor('create', 'CreateRequest', createRequest, 'CreateResult', result(createValue), { cancellation: true }),
  descriptor('stream', 'StreamRequest', streamRequest, 'StreamEvent', streamEvent, { stream: true, cancellation: true }),
  descriptor('cancel', 'ChatRequest', chatRequest, 'CancelResult', result(cancelValue)),
  descriptor('close', 'ChatRequest', chatRequest, 'CloseResult', result(closeValue)),
];

export const TYPERT = {
  package: 'dsh-aside',
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: ASIDE_INVOCATIONS,
};

export default ASIDE_INVOCATIONS;
