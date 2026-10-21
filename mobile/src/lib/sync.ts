import type { QueryClient } from '@tanstack/react-query';
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { ApiError, api, unwrap } from './api';
import { getOutbox, removeItem, updateItem } from './offlineQueue';

/**
 * Flushes the outbox to POST /facilities/{id}/stock-transactions (and
 * /delivery-notes for reviewed delivery scans, /reorder-requests, and
 * PUT / DELETE /product-amcs/{product} for starting AMCs, /dispatches and
 * /reorder-requests/{id}/fulfil for a store's issues down the chain), oldest
 * first (the Stock Card is written in date order). Runs when an entry is
 * queued, when connectivity returns, when the app comes to the foreground,
 * and every 30s while anything is waiting.
 *
 * - 201 / 200 (already recorded via client_reference): drop from the outbox.
 * - 4xx (e.g. insufficient stock because another device issued first):
 *   mark failed with the server's reason; staff retry or discard it.
 * - No response / 5xx: leave pending and stop; try again later.
 */

let running = false;
let queryClient: QueryClient | null = null;
let lastSyncedAt: string | null = null;
let online = true;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setSyncQueryClient(client: QueryClient) {
  queryClient = client;
}

export async function flushOutbox(): Promise<void> {
  if (running) return;
  running = true;
  emit();
  let synced = 0;

  try {
    for (const item of getOutbox()) {
      if (item.status !== 'pending') continue;
      await updateItem(item.id, { status: 'syncing', attempts: item.attempts + 1 });
      try {
        const params = { path: { facility: item.facilityId } };
        if (item.kind === 'transaction') {
          await unwrap(api.POST('/facilities/{facility}/stock-transactions', { params, body: item.body }));
        } else if (item.kind === 'amc') {
          const path = { path: { facility: item.facilityId, product: item.productId } };
          const { amc_quantity } = item.body;
          if (amc_quantity === null) {
            const { response, error } = await api.DELETE('/facilities/{facility}/product-amcs/{product}', { params: path });
            if (!response.ok) throw new ApiError(response.status, error);
          } else {
            await unwrap(api.PUT('/facilities/{facility}/product-amcs/{product}', { params: path, body: { amc_quantity } }));
          }
        } else if (item.kind === 'dispatch') {
          await unwrap(api.POST('/facilities/{facility}/dispatches', { params, body: item.body }));
        } else if (item.kind === 'fulfil') {
          // No client_reference here: a repeat after a lost response is refused ("already fulfilled") instead of issuing twice.
          await unwrap(
            api.POST('/reorder-requests/{reorderRequest}/fulfil', { params: { path: { reorderRequest: item.requestId } }, body: item.body }),
          );
        } else if (item.kind === 'reorder_request') {
          await unwrap(api.POST('/facilities/{facility}/reorder-requests', { params, body: item.body }));
        } else {
          await unwrap(api.POST('/facilities/{facility}/delivery-notes', { params, body: item.body }));
        }
        await removeItem(item.id);
        synced++;
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429) {
          const first = Object.values(err.errors)[0]?.[0];
          await updateItem(item.id, { status: 'failed', error: first ?? err.message });
          continue;
        }
        // Offline, server down, or session expired: keep it and stop for now.
        await updateItem(item.id, { status: 'pending' });
        break;
      }
    }
  } finally {
    running = false;
    if (synced > 0) {
      lastSyncedAt = new Date().toISOString();
      // Balances, history, alerts and rollups all change server-side.
      await queryClient?.invalidateQueries();
    }
    emit();
  }
}

/** Queue a flush without waiting for it. */
export function requestSync() {
  void flushOutbox();
}

export interface SyncState {
  running: boolean;
  online: boolean;
  lastSyncedAt: string | null;
}

let snapshot: SyncState = { running, online, lastSyncedAt };
function getSnapshot(): SyncState {
  if (snapshot.running !== running || snapshot.online !== online || snapshot.lastSyncedAt !== lastSyncedAt) {
    snapshot = { running, online, lastSyncedAt };
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Mount once inside the signed-in app: wires every sync trigger. */
export function useSyncTriggers() {
  useEffect(() => {
    const setOnline = (next: boolean) => {
      const wasOffline = !online;
      online = next;
      emit();
      if (next && wasOffline) requestSync();
    };

    void getNetworkStateAsync().then((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false));
    const net = addNetworkStateListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false));
    const app = AppState.addEventListener('change', (state) => state === 'active' && requestSync());
    const timer = setInterval(() => {
      if (getOutbox().some((i) => i.status === 'pending')) requestSync();
    }, 30_000);

    requestSync();
    return () => {
      net.remove();
      app.remove();
      clearInterval(timer);
    };
  }, []);
}
