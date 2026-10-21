<?php

use App\Http\Middleware\EnsureOrganizationMember;
use App\Http\Middleware\EnsureOwner;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // API clients get a 401, not a redirect to a login page that doesn't exist.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/');
        // Set (or, for the owner, clear) the Tenant before route model binding, so another organization's {facility} / {product} / {user} is a 404.
        $middleware->prependToPriorityList(SubstituteBindings::class, EnsureOrganizationMember::class);
        $middleware->prependToPriorityList(SubstituteBindings::class, EnsureOwner::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Always JSON errors ({message, errors}) under /api, regardless of Accept header.
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
    })->create();
