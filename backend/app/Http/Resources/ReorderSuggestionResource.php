<?php

namespace App\Http\Resources;

use App\Data\ReorderSuggestion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ReorderSuggestion */
class ReorderSuggestionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'product' => ProductResource::make($this->stock->product),
            'usable_quantity' => $this->stock->usableQuantity,
            'level' => $this->stock->level,
            /** Average Monthly Consumption (issues per month); null without a complete month of history. */
            'amc_quantity' => $this->amcQuantity,
            /** Complete months the AMC is averaged over. */
            'amc_months_used' => $this->monthsUsed,
            /** Month of the AMC snapshot used (YYYY-MM-DD, first of month); null if none computed yet. */
            'amc_period_month' => $this->amcPeriodMonth,
            /** Usable stock divided by AMC; null without an AMC. */
            'months_of_stock' => $this->monthsOfStock,
            /** Target stock level: AMC x max months, or the product's max_stock_level without an AMC. */
            'max_stock_quantity' => $this->maxStockQuantity,
            /** @var 'amc'|'product_max' */
            'basis' => $this->basis,
            /** Max stock minus usable stock, never negative. */
            'suggested_quantity' => $this->suggestedQuantity,
        ];
    }
}
