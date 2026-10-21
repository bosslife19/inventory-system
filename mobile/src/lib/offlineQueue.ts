import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { formatDate, formatQty, transactionLabel } from './format';
import { storage } from './storage';
import type { FulfilBody, NewDeliveryNote, NewDispatch, NewReorderRequest, NewStockTransaction } from './types';

/**
 * The outbox: Stock Card entries, delivery notes, reorder requests, starting AMCs, and a store's
 * dispatches and fulfilled requests made on this device
 * and not yet accepted by the server (mobile/CLAUDE.md rule 1). Everything
 * is written here first, online or not, then sync.ts sends them one by one.
 *
 * Each item is its own action with its own client_reference (rule 2): the
 * server records new ledger rows, never a merged balance, and a retry after
 * a lost response returns what was already recorded.
 */

const KEY = 'inventory.outbox';

export type OutboxStatus = 'pending' | 'syncing' | 'failed';

interface Base {
  /** Also sent as client_reference. */
  id: string;
  facilityId: number;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  /** Why the server refused it (status failed). */
  error?: string;
}

export type OutboxItem = Base &
  (
    | { kind: 'transaction'; body: NewStockTransaction; productName: string; unit: string }
    | { kind: 'delivery_note'; body: NewDeliveryNote }
    | { kind: 'reorder_request'; body: NewReorderRequest; supplierName: string }
    | { kind: 'amc'; productId: number; body: EnteredAmc; productName: string; unit: string }
    | { kind: 'dispatch'; body: NewDispatch; destinationName: string }
    | { kind: 'fulfil'; requestId: number; requestNumber: string; body: FulfilBody; requesterName: string }
  );

type NewItem =
  | { kind: 'transaction'; facilityId: number; body: NewStockTransaction; productName: string; unit: string }
  | { kind: 'delivery_note'; facilityId: number; body: NewDeliveryNote }
  | { kind: 'reorder_request'; facilityId: number; body: NewReorderRequest; supplierName: string }
  | { kind: 'amc'; facilityId: number; productId: number; body: EnteredAmc; productName: string; unit: string }
  | { kind: 'dispatch'; facilityId: number; body: NewDispatch; destinationName: string }
  | { kind: 'fulfil'; facilityId: number; requestId: number; requestNumber: string; body: FulfilBody; requesterName: string };

/** A starting AMC to set, or null to clear the one entered (reorder suggestions go back to the computed AMC). */
export interface EnteredAmc {
  amc_quantity: number | null;
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
  items = raw
    ? (JSON.parse(raw) as OutboxItem[]).map((i) => ({
        ...i,
        // Items saved before delivery notes existed are transactions.
        kind: i.kind ?? 'transaction',
        // An app killed mid-sync leaves items "syncing": they were never confirmed.
        status: i.status === 'syncing' ? 'pending' : i.status,
      }) as OutboxItem)
    : [];
  loaded = true;
  emit();
}

export function getOutbox(): OutboxItem[] {
  return items;
}

export function enqueue(entry: NewItem): OutboxItem {
  const id = Crypto.randomUUID();
  const item = {
    ...entry,
    id,
    body: { ...entry.body, client_reference: id },
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
  } as OutboxItem;
  // A starting AMC is a setting, not a ledger row: a newer one for the same product replaces any still waiting.
  const superseded = (i: OutboxItem) =>
    entry.kind === 'amc' && i.kind === 'amc' && i.status !== 'syncing' && i.facilityId === entry.facilityId && i.productId === entry.productId;
  void set([...items.filter((i) => !superseded(i)), item]);
  return item;
}

export function updateItem(id: string, patch: Partial<Base>) {
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

/** Products an unsynced item will change on this Stock Card (a reorder request changes none until it arrives; a dispatch issues them). */
export function productIdsOf(item: OutboxItem): number[] {
  if (item.kind === 'reorder_request' || item.kind === 'amc') return [];
  return item.kind === 'transaction' ? [item.body.product_id] : item.body.items.map((l) => l.product_id);
}

/** How an item reads in lists: title, detail line, and a quantity figure. */
export function describe(item: OutboxItem): { title: string; detail: string; figure: string } {
  if (item.kind === 'transaction') {
    return {
      title: `${transactionLabel(item.body.transaction_type)} · ${item.productName}`,
      detail: `${formatDate(item.body.transaction_date)}${item.body.batch_no ? ` · ${item.body.batch_no}` : ''}`,
      figure: `${formatQty(item.body.quantity)} ${item.unit}`,
    };
  }
  if (item.kind === 'amc') {
    return {
      title: `Starting AMC · ${item.productName}`,
      detail: formatDate(item.createdAt.slice(0, 10)),
      figure: item.body.amc_quantity === null ? 'cleared' : `${formatQty(item.body.amc_quantity)} ${item.unit}/month`,
    };
  }
  const n = item.body.items.length;
  if (item.kind === 'dispatch') {
    return {
      title: `Dispatch · ${item.destinationName}`,
      detail: `${formatDate(item.body.dispatched_date)} · ${n} line${n === 1 ? '' : 's'}`,
      figure: `${n} line${n === 1 ? '' : 's'}`,
    };
  }
  if (item.kind === 'fulfil') {
    return {
      title: `Fulfil ${item.requestNumber} · ${item.requesterName}`,
      detail: `${formatDate(item.body.dispatched_date)} · ${n} line${n === 1 ? '' : 's'}`,
      figure: `${n} line${n === 1 ? '' : 's'}`,
    };
  }
  if (item.kind === 'reorder_request') {
    return {
      title: `Reorder request · ${item.supplierName}`,
      detail: `${formatDate(item.createdAt.slice(0, 10))} · ${n} product${n === 1 ? '' : 's'}`,
      figure: `${n} product${n === 1 ? '' : 's'}`,
    };
  }
  return {
    title: `Delivery${item.body.delivery_note_no ? ` ${item.body.delivery_note_no}` : ''} · ${item.body.source}`,
    detail: `${formatDate(item.body.received_date)} · ${n} line${n === 1 ? '' : 's'}`,
    figure: `${n} line${n === 1 ? '' : 's'}`,
  };
}
