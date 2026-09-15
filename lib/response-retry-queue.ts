export type RetryQueueItem = {
  sessionId: string;
  itemId: string;
  idempotencyKey: string;
};

export function pendingForSession<T extends RetryQueueItem>(queue: readonly T[], sessionId: string) {
  return queue.filter((item) => item.sessionId === sessionId);
}

export function findPendingItem<T extends RetryQueueItem>(queue: readonly T[], sessionId: string | undefined, itemId: string) {
  return queue.find((item) => item.sessionId === sessionId && item.itemId === itemId);
}

export function enqueuePending<T extends RetryQueueItem>(queue: readonly T[], item: T) {
  if (queue.some((current) => current.idempotencyKey === item.idempotencyKey || current.sessionId === item.sessionId && current.itemId === item.itemId)) {
    return [...queue];
  }
  return [...queue, item];
}

export function removePending<T extends RetryQueueItem>(queue: readonly T[], idempotencyKey: string) {
  return queue.filter((item) => item.idempotencyKey !== idempotencyKey);
}
