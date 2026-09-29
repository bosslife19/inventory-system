<?php

namespace App\Providers;

use App\Contracts\PushSender;
use App\Services\Push\FcmPushSender;
use App\Services\Push\NullPushSender;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\SecurityScheme;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // FCM when a service account is configured; otherwise push is a no-op.
        $this->app->singleton(PushSender::class, function () {
            $path = config('services.firebase.credentials');

            return is_string($path) && is_file($path) ? new FcmPushSender($path) : new NullPushSender;
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // OpenAPI spec for shared/types codegen: Sanctum bearer tokens on every route
        // (login opts out with @unauthenticated).
        Scramble::configure()->withDocumentTransformers(function (OpenApi $openApi) {
            $openApi->secure(SecurityScheme::http('bearer'));
        });
    }
}
