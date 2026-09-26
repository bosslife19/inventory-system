// Aliases onto the generated API types — never hand-written interfaces.
// Regenerate with ./scripts/codegen.sh after a backend contract change.
import type { components } from '@shared/api'

type Schemas = components['schemas']

export type User = Schemas['UserResource']
export type UserRole = Schemas['UserRole']
export type Facility = Schemas['FacilityResource']
export type Product = Schemas['ProductResource']
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
