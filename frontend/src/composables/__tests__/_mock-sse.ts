/**
 * Test helper: a controllable mock for `globalThis.fetch` that emits
 * SSE-formatted chunks on demand. Supports abort — if the caller
 * aborts the AbortSignal it passed to `fetch`, any in-flight `read()`
 * promise rejects with AbortError, and any subsequent `read()` entered
 * after the signal has already fired also rejects immediately. This
 * mirrors real-browser `ReadableStreamDefaultReader.read()` behavior.
 */

import { vi, type Mock } from "vitest";

export interface SSEMock {
  fetchMock: Mock;
  /** Push one SSE event (object gets JSON-stringified and prefixed with "data: "). */
  emit: (payload: Record<string, unknown>) => void;
  /** Close the stream normally (reader's next read returns done:true). */
  finish: () => void;
  /** True once the caller's AbortSignal fires. */
  aborted: () => boolean;
}

export function mockSSEFetch(): SSEMock {
  const pending: Uint8Array[] = [];
  let finished = false;
  let wasAborted = false;
  let abortSignal: AbortSignal | null = null;
  let resolveNext:
    | ((v: { value?: Uint8Array; done: boolean }) => void)
    | null = null;
  let rejectNext: ((e: Error) => void) | null = null;

  const reader = {
    read: () =>
      new Promise<{ value?: Uint8Array; done: boolean }>((resolve, reject) => {
        // Match real-browser behavior: if the signal already fired
        // before this read() was entered, reject immediately instead
        // of waiting for data that will never come.
        if (abortSignal?.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        if (pending.length) {
          resolve({ value: pending.shift()!, done: false });
          return;
        }
        if (finished) {
          resolve({ value: undefined, done: true });
          return;
        }
        resolveNext = resolve;
        rejectNext = reject;
      }),
    releaseLock: () => {},
    cancel: async () => {},
  };

  const fetchMock = vi.fn(async (_url: string, opts: RequestInit = {}) => {
    abortSignal = opts.signal ?? null;
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        wasAborted = true;
        if (rejectNext) {
          const err = new DOMException("aborted", "AbortError");
          rejectNext(err);
          rejectNext = null;
          resolveNext = null;
        }
      });
    }
    return {
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    } as unknown as Response;
  });

  function emit(payload: Record<string, unknown>): void {
    const chunk = new TextEncoder().encode(
      `data: ${JSON.stringify(payload)}\n\n`,
    );
    if (resolveNext) {
      resolveNext({ value: chunk, done: false });
      resolveNext = null;
      rejectNext = null;
    } else {
      pending.push(chunk);
    }
  }

  function finish(): void {
    finished = true;
    if (resolveNext) {
      resolveNext({ value: undefined, done: true });
      resolveNext = null;
      rejectNext = null;
    }
  }

  return { fetchMock, emit, finish, aborted: () => wasAborted };
}
