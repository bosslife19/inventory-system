<?php

namespace App\Enums;

/**
 * What the paid plan unlocks (docs/ROLES_AND_PERMISSIONS.md, "Plans").
 * Everything else — Stock Cards, the LGA / State / Federal dashboards,
 * alerts in the app, reports, the catalog — is free. A request needing one
 * answers 402 with code feature_unavailable when the organization's plan lacks it.
 */
enum Feature: string
{
    /** CSV imports of products, facilities, accounts, levels and Stock Card entries. */
    case BulkImports = 'bulk_imports';
    /** Capturing delivery notes (the mobile scan); confirming one dispatched by a store stays free. */
    case DeliveryScanning = 'delivery_scanning';
    /** More than one active account per role (on the free plan: one admin, one federal officer, one state officer, ...). */
    case MultipleAccounts = 'multiple_accounts';
    /** More than one open facility (SDP); the free plan has one. Stores don't count. */
    case MultipleFacilities = 'multiple_facilities';
    /** Push notifications to phones (alerts, digests, reorder requests); in-app notifications stay free. */
    case PushNotifications = 'push_notifications';
    /** Stores dispatching down the chain, and reorder requests up it. */
    case SupplyChain = 'supply_chain';

    public function label(): string
    {
        return match ($this) {
            self::BulkImports => 'Bulk CSV imports',
            self::DeliveryScanning => 'Delivery note scanning',
            self::MultipleAccounts => 'More than one account per role',
            self::MultipleFacilities => 'More than one facility',
            self::PushNotifications => 'Push notifications',
            self::SupplyChain => 'Dispatches and reorder requests',
        };
    }
}
