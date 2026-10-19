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
            /** Average Monthly Consumption (issues per month): the facility's entered AMC while its history is shorter than the AMC window, else the computed one; null with neither. */
            'amc_quantity' => $this->amcQuantity,
            /**
             * 'entered' = typed in by the facility, 'computed' = from its issues.
             *
             * @var 'computed'|'entered'|null
             */
            'amc_source' => $this->amcSource,
            /** Complete months of the facility's own history the computed AMC is averaged over. */
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
