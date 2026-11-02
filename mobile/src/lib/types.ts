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
export type AppNotification = Schemas['NotificationResource'];
export type ReorderRequest = Schemas['ReorderRequestResource'];
export type ReorderRequestStatus = Schemas['ReorderRequestStatus'];
export type NewReorderRequest = Schemas['StoreReorderRequestRequest'];
export type NewDispatch = Schemas['StoreDispatchRequest'];
export type FulfilBody = Schemas['FulfilReorderRequestRequest'];
export type DeliveryNoteStatus = Schemas['DeliveryNoteStatus'];

type ReportResponse = NonNullable<paths['/reports/{report}']['get']['responses'][200]['content']['application/json']>;
export type ReportResult = ReportResponse['data'];

type ActivityResponse = NonNullable<
  paths['/facilities/{facility}/stock-activity']['get']['responses'][200]['content']['application/json']
>['data'];
// The generator can't see through the service's array shape for `weeks`.
export type ActivityWeek = { week_start: string; received: number; issued: number; other: number };
export type StockActivity = Omit<ActivityResponse, 'weeks'> & { weeks: ActivityWeek[] };

export type { paths };

// Organizations and plans (docs/API_CONTRACT.md: Platform)
export type Membership = Schemas['MembershipResource'];
export type Feature = Membership['features'][number];
export type Platform = NonNullable<paths['/platform']['get']['responses'][200]['content']['application/json']>['data'];

// Area dashboards (docs/API_CONTRACT.md: Rollups) and the officer tools around them.
export type FacilityStockSummary = Schemas['FacilityStockSummaryResource'];
export type AreaStockSummary = Schemas['AreaStockSummaryResource'];
export type ProductRollup = Schemas['ProductRollupResource'];
export type AuditEvent = Schemas['AuditEventResource'];
export type AuditCategory = AuditEvent['category'];
export type NewUser = Schemas['StoreUserRequest'];
export type UpdateUser = Schemas['UpdateUserRequest'];

type Json<P extends keyof paths> = NonNullable<
  paths[P] extends { get: { responses: { 200: { content: { 'application/json': infer B } } } } } ? B : never
>;
export type LgaSummary = Json<'/lgas/{lga}/stock-summary'>['data'];
export type StateSummary = Json<'/states/{state}/stock-summary'>['data'];
export type FederalSummary = Json<'/federal/stock-summary'>['data'];
export type FacilityStatusCounts = LgaSummary['facility_status'];
/** What every rollup level has in common — the shared RollupView renders this. */
export type RollupSummary = Pick<LgaSummary, 'child_count' | 'facility_count' | 'facility_counts' | 'facility_status' | 'products'> & {
  children: FacilityStockSummary[] | AreaStockSummary[];
};
