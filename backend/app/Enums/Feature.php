<?php

namespace App\Enums;

/**
 * What the paid plan unlocks (docs/ROLES_AND_PERMISSIONS.md, "Plans").
 * Everything else — Stock Cards, alerts in the app, reports, accounts,
 * the catalog — is free. A route behind one answers 402 with code
 * feature_unavailable when the organization's plan lacks it.
 */
enum Feature: string
{
    /** CSV imports of products, facilities, accounts, levels and Stock Card entries. */
    case BulkImports = 'bulk_imports';
    /** Capturing delivery notes (the mobile scan); confirming one dispatched by a store stays free. */
    case DeliveryScanning = 'delivery_scanning';
    /** Push notifications to phones (alerts, digests, reorder requests); in-app notifications stay free. */
    case PushNotifications = 'push_notifications';
    /** LGA / State / Federal rollup dashboards. */
    case Rollups = 'rollups';
    /** Stores dispatching down the chain, and reorder requests up it. */
    case SupplyChain = 'supply_chain';

    public function label(): string
    {
        return match ($this) {
            self::BulkImports => 'Bulk CSV imports',
            self::DeliveryScanning => 'Delivery note scanning',
            self::PushNotifications => 'Push notifications',
            self::Rollups => 'LGA, State and Federal dashboards',
            self::SupplyChain => 'Dispatches and reorder requests',
        };
    }
}
