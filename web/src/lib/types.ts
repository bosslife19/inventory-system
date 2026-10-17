// Aliases onto the generated API types — never hand-written interfaces.
// Regenerate with ./scripts/codegen.sh after a backend contract change.
import type { components, paths } from '@shared/api'

type Schemas = components['schemas']

export type User = Schemas['UserResource']
export type UserRole = Schemas['UserRole']
export type Facility = Schemas['FacilityResource']
export type Product = Schemas['ProductResource']
export type UnitOfMeasure = Schemas['UnitOfMeasure']
export type ProductLevel = Schemas['ProductLevelResource']
export type SaveProductLevels = Schemas['SaveProductLevelsRequest']
export type StockLevels = Schemas['ProductStockResource']['levels']
export type State = Schemas['StateResource']
export type Lga = Schemas['LgaResource']
export type ProductStock = Schemas['ProductStockResource']
export type BatchStock = Schemas['BatchStockResource']
export type StockTransaction = Schemas['StockTransactionResource']
export type TransactionType = Schemas['TransactionType']
export type StockLevel = Schemas['StockLevel']
export type AlertType = Schemas['AlertType']
export type ExpiryStatus = Schemas['ExpiryStatus']
export type NewStockTransaction = Schemas['StoreStockTransactionRequest']
export type FacilityStockSummary = Schemas['FacilityStockSummaryResource']
export type ProductRollup = Schemas['ProductRollupResource']
export type FlagCounts = FacilityStockSummary['flag_counts']
export type Alert = Schemas['AlertResource']
export type ReorderSuggestion = Schemas['ReorderSuggestionResource']
export type AreaStockSummary = Schemas['AreaStockSummaryResource']
export type DeliveryNote = Schemas['DeliveryNoteResource']
export type DeliveryNoteStatus = Schemas['DeliveryNoteStatus']
export type NewDeliveryNote = Schemas['StoreDeliveryNoteRequest']
export type NewDispatch = Schemas['StoreDispatchRequest']
export type ReorderRequest = Schemas['ReorderRequestResource']
export type ReorderRequestStatus = Schemas['ReorderRequestStatus']
export type NewReorderRequest = Schemas['StoreReorderRequestRequest']
export type FulfilReorderRequest = Schemas['FulfilReorderRequestRequest']
export type StoreLevel = Schemas['StoreLevel']
export type NewUser = Schemas['StoreUserRequest']
export type AuditEvent = Schemas['AuditEventResource']
export type UpdateUser = Schemas['UpdateUserRequest']
export type NewProduct = Schemas['SaveProductRequest']
export type NewFacility = Schemas['SaveFacilityRequest']
export type FacilityType = NonNullable<NewFacility['type']>

type Json<P extends keyof paths> = NonNullable<
  paths[P] extends { get: { responses: { 200: { content: { 'application/json': infer B } } } } } ? B : never
>
export type LgaSummary = Json<'/lgas/{lga}/stock-summary'>['data']
export type StateSummary = Json<'/states/{state}/stock-summary'>['data']
export type FederalSummary = Json<'/federal/stock-summary'>['data']
export type FacilityStatusCounts = LgaSummary['facility_status']
/** What every rollup level has in common — the shared RollupDashboard renders this. */
export type RollupSummary = Pick<
  LgaSummary,
  'child_count' | 'facility_count' | 'facility_counts' | 'facility_status' | 'products'
> & { children: FacilityStockSummary[] | AreaStockSummary[] }
export type AlertSeverity = Schemas['AlertSeverity']
export type AlertStatus = Schemas['AlertStatus']

// The generator can't see through the service's array shape for `weeks`, so
// narrow it to what StockActivityService returns (docs/API_CONTRACT.md).
type ActivityResponse = NonNullable<
  paths['/facilities/{facility}/stock-activity']['get']['responses'][200]['content']['application/json']
>['data']
export type ActivityWeek = { week_start: string; received: number; issued: number; other: number }
export type StockActivity = Omit<ActivityResponse, 'weeks'> & { weeks: ActivityWeek[] }
