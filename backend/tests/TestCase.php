<?php

namespace Tests;

use App\Models\Organization;
use App\Support\Tenant;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Schema;

abstract class TestCase extends BaseTestCase
{
    /**
     * Fixtures are made as the organization the migrations create (on the
     * paid plan), the way its members' requests run; tests about other
     * organizations wrap their fixtures in Tenant::run().
     */
    protected function setUp(): void
    {
        parent::setUp();

        if (Schema::hasTable('organizations') && ($first = Organization::query()->orderBy('id')->value('id'))) {
            Tenant::set($first);
        }
    }
}
