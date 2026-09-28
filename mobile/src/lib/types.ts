// Aliases onto the generated API types — never hand-written interfaces
// (mobile/CLAUDE.md). Type-only imports, so Metro never bundles ../shared.
// Regenerate with ./scripts/codegen.sh after a backend contract change.
import type { components, paths } from '@shared/api';

type Schemas = components['schemas'];

export type User = Schemas['UserResource'];
export type UserRole = Schemas['UserRole'];
export type Facility = Schemas['FacilityResource'];
export type Product = Schemas['ProductResource'];
export type ProductStock = Schemas['ProductStockResource'];
export type BatchStock = Schemas['BatchStockResource'];
export type StockTransaction = Schemas['StockTransactionResource'];
export type TransactionType = Schemas['TransactionType'];
export type StockLevel = Schemas['StockLevel'];
export type AlertType = Schemas['AlertType'];
export type ExpiryStatus = Schemas['ExpiryStatus'];
export type NewStockTransaction = Schemas['StoreStockTransactionRequest'];
export type NewDeliveryNote = Schemas['StoreDeliveryNoteRequest'];
export type DeliveryNote = Schemas['DeliveryNoteResource'];
export type Alert = Schemas['AlertResource'];
export type AlertStatus = Schemas['AlertStatus'];
export type AlertSeverity = Schemas['AlertSeverity'];
export type ReorderSuggestion = Schemas['ReorderSuggestionResource'];

type ActivityResponse = NonNullable<
  paths['/facilities/{facility}/stock-activity']['get']['responses'][200]['content']['application/json']
>['data'];
// The generator can't see through the service's array shape for `weeks`.
export type ActivityWeek = { week_start: string; received: number; issued: number; other: number };
export type StockActivity = Omit<ActivityResponse, 'weeks'> & { weeks: ActivityWeek[] };

export type { paths };
