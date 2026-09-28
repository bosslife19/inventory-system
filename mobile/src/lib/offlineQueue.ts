import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { storage } from './storage';
import type { NewStockTransaction } from './types';

/**
 * The outbox: Stock Card entries recorded on this device and not yet
 * accepted by the server (mobile/CLAUDE.md rule 1). Every entry is written
 * here first, online or not, then sync.ts sends them one by one.
 *
 * Each item is its own action with its own client_reference (rule 2): the
 * server records it as a new ledger row, never a merged balance, and a
 * retry after a lost response returns the row already recorded.
 */

const KEY = 'inventory.outbox';

export type OutboxStatus = 'pending' | 'syncing' | 'failed';

export interface OutboxItem {
  /** Also sent as client_reference. */
  id: string;
  facilityId: number;
  body: NewStockTransaction;
  /** For display while unsynced. */
  productName: string;
  unit: string;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  /** Why the server refused it (status failed). */
  error?: string;
}

let items: OutboxItem[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function persist() {
  await storage.setItem(KEY, JSON.stringify(items));
}

function set(next: OutboxItem[]) {
  items = next;
  emit();
  return persist();
}

export async function loadOutbox(): Promise<void> {
  if (loaded) return;
  const raw = await storage.getItem(KEY);
  // An app killed mid-sync leaves items "syncing": they were never confirmed.
  items = raw ? (JSON.parse(raw) as OutboxItem[]).map((i) => (i.status === 'syncing' ? { ...i, status: 'pending' } : i)) : [];
  loaded = true;
  emit();
}

export function getOutbox(): OutboxItem[] {
  return items;
}

export function enqueue(entry: Omit<OutboxItem, 'id' | 'createdAt' | 'status' | 'attempts'>): OutboxItem {
  const id = Crypto.randomUUID();
  const item: OutboxItem = {
    ...entry,
    id,
    body: { ...entry.body, client_reference: id },
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
  };
  void set([...items, item]);
  return item;
}

export function updateItem(id: string, patch: Partial<OutboxItem>) {
  return set(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

export function removeItem(id: string) {
  return set(items.filter((i) => i.id !== id));
}

/** Put a refused entry back in the queue (e.g. after restocking made it valid). */
export function retryItem(id: string) {
  return updateItem(id, { status: 'pending', error: undefined });
}

export function clearOutbox() {
  return set([]);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The outbox, re-rendering on every change. */
export function useOutbox(): OutboxItem[] {
  return useSyncExternalStore(subscribe, getOutbox, getOutbox);
}
