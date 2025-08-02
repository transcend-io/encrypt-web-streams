/* eslint-disable @typescript-eslint/no-non-null-assertion */

/** Equivalent to `Promise.withResolvers()` which is an ES2024 feature */
export const promiseWithResolvers = <T>(): PromiseWithResolvers<T> => {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
};
