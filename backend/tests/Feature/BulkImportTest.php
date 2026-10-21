<?php

use App\Enums\TransactionType;
use App\Models\Alert;
use App\Models\AuditEvent;
use App\Models\Facility;
use App\Models\FacilityProductAmc;
use App\Models\FacilityProductLevel;
use App\Models\Product;
use App\Models\StockBalance;
use App\Models\StockTransaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;

uses(RefreshDatabase::class);

beforeEach(function () {
    CarbonImmutable::setTestNow('2026-10-21 10:00:00');
    $this->h = hierarchyFixture();
    $this->u = $this->h['users'];
    $this->kawo = $this->h['facilities']['kawo'];
    $this->ors = Product::create([
        'name' => 'ORS', 'sku' => 'ORS', 'category' => 'Diarrhoea', 'unit_of_measure' => 'sachet',
        'requires_batch_tracking' => false, 'min_stock_level' => 40, 'max_stock_level' => 100, 'reorder_level' => 10,
    ]);
    $this->al = Product::create([
        'name' => 'Artemether-Lumefantrine', 'sku' => 'AL', 'category' => 'Antimalarials', 'unit_of_measure' => 'pack', 'pack_size' => 24,
        'requires_batch_tracking' => true, 'min_stock_level' => 20, 'max_stock_level' => 80, 'reorder_level' => 5,
    ]);

    /** POST a CSV (lines joined with \n) as $user. */
    $this->upload = fn (User $user, string $url, array $lines, bool $dryRun = false) => $this->actingAs($user, 'sanctum')
        ->post("/api/v1/{$url}", [
            'file' => UploadedFile::fake()->createWithContent('import.csv', implode("\n", $lines)),
            'dry_run' => $dryRun ? 'true' : 'false',
        ], ['Accept' => 'application/json']);
});

// ---------------------------------------------------------------- products

it('imports products all or nothing, after an optional check', function () {
    $file = [
        'Product code,Name,Category,Unit of measure,Pack size,Track batches,Cold chain,EOP,Min stock level,Max stock level',
        'amx250,Amoxicillin 250mg,Antibiotics,pack,10,yes,,20,50,"1,200"',
        'OXY10,Oxytocin 10IU,Maternal,ampoule,,no,yes,5,10,40',
    ];

    ($this->upload)($this->u['sdp'], 'imports/products', $file, dryRun: true)->assertOk()
        ->assertJsonPath('data.committed', false)
        ->assertJsonPath('data.failed_rows', 0)
        ->assertJsonPath('data.rows.0.label', 'AMX250 — Amoxicillin 250mg');
    expect(Product::count())->toBe(2);

    ($this->upload)($this->u['sdp'], 'imports/products', $file)->assertOk()->assertJsonPath('data.committed', true);

    $amx = Product::where('sku', 'AMX250')->sole();
    expect($amx->only(['pack_size', 'requires_batch_tracking', 'requires_cold_chain', 'max_stock_level', 'created_by']))
        ->toBe(['pack_size' => 10, 'requires_batch_tracking' => true, 'requires_cold_chain' => false, 'max_stock_level' => 1200, 'created_by' => $this->u['sdp']->id])
        ->and(Product::where('sku', 'OXY10')->value('requires_cold_chain'))->toBeTrue()
        ->and(AuditEvent::where('action', 'product.created')->count())->toBe(2);
});

it('reports every bad row by line and column, and writes nothing', function () {
    $res = ($this->upload)($this->u['sdp'], 'imports/products', [
        'product_code,name,category,unit_of_measure,eop,min_stock_level,max_stock_level',
        'NEW1,Good product,Misc,piece,1,5,10',
        'ORS,Already there,Misc,piece,1,5,10',
        'NEW2,Boxed,Misc,box,1,5,10',
        'NEW3,Bad EOP,Misc,piece,9,5,10',
        '',
        'NEW1,Same code twice in the file,Misc,piece,1,5,10',
    ])->assertOk()->assertJsonPath('data.committed', false)->assertJsonPath('data.total_rows', 5)->assertJsonPath('data.failed_rows', 4);

    $rows = collect($res->json('data.rows'))->keyBy('row');
    expect($rows[2]['ok'])->toBeTrue()
        ->and($rows[3]['errors'][0]['column'])->toBe('product_code')
        ->and($rows[4]['errors'][0]['column'])->toBe('pack_size')
        ->and($rows[5]['errors'][0]['column'])->toBe('eop')
        ->and($rows[7]['errors'][0]['column'])->toBe('product_code') // blank line 6 skipped, line numbers kept
        ->and(Product::count())->toBe(2)
        ->and(AuditEvent::where('action', 'product.created')->count())->toBe(0);
});

it('rejects a file whose header is wrong', function () {
    ($this->upload)($this->u['sdp'], 'imports/products', ['product_code,nmae', 'X,Y'])
        ->assertUnprocessable()->assertJsonValidationErrors(['file' => 'Unknown column: nmae']);
    ($this->upload)($this->u['sdp'], 'imports/products', ['product_code,name'])
        ->assertUnprocessable()->assertJsonValidationErrors('file');
});

it('reads semicolon-separated Excel files with a BOM', function () {
    ($this->upload)($this->u['admin'], 'imports/products', [
        "\xEF\xBB\xBFproduct_code;name;category;unit_of_measure;eop;min_stock_level;max_stock_level",
        'GLV;Gloves;Consumables;pair;10;50;200',
    ])->assertOk()->assertJsonPath('data.committed', true);

    expect(Product::where('sku', 'GLV')->value('unit_of_measure')->value)->toBe('pair');
});

it('serves the column guide for each import', function () {
    $this->actingAs($this->u['sdp'], 'sanctum')->getJson('/api/v1/imports/stock-entries')->assertOk()
        ->assertJsonPath('data.for_facility', true)
        ->assertJsonPath('data.columns.0', ['name' => 'product_code', 'required' => true, 'description' => 'Code of an active product in the catalog.', 'example' => 'AMX250']);
    $this->getJson('/api/v1/imports/nonsense')->assertNotFound();
});

// ---------------------------------------------------------------- facilities

it('lets admins import facilities by state and LGA name', function () {
    $file = [
        'state,lga,name,type,address,phone,latitude,longitude',
        'kaduna state,Zaria,Sabon Gari PHC,Health center,,,11.1,7.7',
        'Kaduna,Nowhere,Lost PHC,health_center,,,,',
        'Kaduna,Kaduna North,Kawo PHC,health_center,,,,',
    ];

    ($this->upload)($this->u['lga'], 'imports/facilities', $file)->assertForbidden();

    $rows = ($this->upload)($this->u['admin'], 'imports/facilities', $file)->assertOk()->json('data.rows');
    expect($rows[0])->toMatchArray(['ok' => true, 'label' => 'Sabon Gari PHC, Zaria LGA, Kaduna'])
        ->and($rows[1]['errors'][0])->toBe(['column' => 'lga', 'message' => 'No LGA called “Nowhere” in Kaduna.'])
        ->and($rows[2]['errors'][0]['message'])->toBe('There is already a facility with this name in that LGA.');

    ($this->upload)($this->u['admin'], 'imports/facilities', array_slice($file, 0, 2))->assertJsonPath('data.committed', true);
    expect(Facility::where('name', 'Sabon Gari PHC')->value('type'))->toBe('health_center');
});

// ---------------------------------------------------------------- accounts

it('imports accounts within the caller’s area and returns their passwords once', function () {
    $file = [
        'name,email,role,state,lga,facility,temporary_password',
        'Amina Bello,Amina@Kawo.test,Facility staff,Kaduna,Kaduna North,kawo phc,',
        'Musa Ali,musa@rimi.test,sdp_staff,Kaduna,Kaduna North,Rimi PHC,changeme123',
    ];

    $check = ($this->upload)($this->u['lga'], 'imports/users', $file, dryRun: true)->assertOk()->json('data.rows');
    expect($check[0])->not->toHaveKey('temporary_password');

    $rows = ($this->upload)($this->u['lga'], 'imports/users', $file)->assertOk()->assertJsonPath('data.committed', true)->json('data.rows');
    expect($rows[0]['temporary_password'])->toHaveLength(10)
        ->and($rows[1]['temporary_password'])->toBe('changeme123')
        ->and(User::where('email', 'amina@kawo.test')->value('facility_id'))->toBe($this->kawo->id)
        ->and(User::where('email', 'musa@rimi.test')->value('must_change_password'))->toBeTrue();

    // Outside the LGA officer's area, or a role they can't create.
    $rows = ($this->upload)($this->u['lga'], 'imports/users', [
        'name,email,role,state,lga,facility',
        'Tudun Staff,t@x.test,sdp_staff,Kaduna,Zaria,Tudun Wada PHC',
        'Officer,o@x.test,lga_officer,Kaduna,Zaria,',
    ])->json('data.rows');
    expect($rows[0]['errors'][0])->toBe(['column' => 'facility', 'message' => 'That facility is outside your LGA.'])
        ->and($rows[1]['errors'][0]['column'])->toBe('role');

    ($this->upload)($this->u['sdp'], 'imports/users', $file)->assertForbidden();
});

// ---------------------------------------------------------------- per-facility levels and AMCs

it('imports a facility’s own levels and starting AMCs', function () {
    $file = [
        'product_code,eop,min_stock_level,max_stock_level,starting_amc',
        'ors,15,60,150,',
        'AL,,,,12.5',
        'AL,3,2,10,',
        'NOPE,1,2,3,',
    ];

    ($this->upload)($this->u['sdp'], "facilities/{$this->h['facilities']['rimi']->id}/imports/product-levels", $file)->assertForbidden();

    $rows = ($this->upload)($this->u['sdp'], "facilities/{$this->kawo->id}/imports/product-levels", $file)->json('data.rows');
    expect($rows[2]['errors'][0]['column'])->toBe('eop')
        ->and($rows[3]['errors'][0]['column'])->toBe('product_code');

    ($this->upload)($this->u['sdp'], "facilities/{$this->kawo->id}/imports/product-levels", array_slice($file, 0, 3))
        ->assertJsonPath('data.committed', true)
        ->assertJsonPath('data.rows.0.label', 'ORS — min 60, EOP 15, max 150');

    expect(FacilityProductLevel::where('facility_id', $this->kawo->id)->sole()->only(['product_id', 'reorder_level']))
        ->toBe(['product_id' => $this->ors->id, 'reorder_level' => 15])
        ->and((float) FacilityProductAmc::where('facility_id', $this->kawo->id)->sole()->amc_quantity)->toBe(12.5);
});

// ---------------------------------------------------------------- stock entries

it('records opening stock through the ledger, in file order', function () {
    $url = "facilities/{$this->kawo->id}/imports/stock-entries";
    $file = [
        'product_code,type,quantity,date,batch_no,expiry_date,received_from_or_issued_to,voucher_no,comments',
        'ORS,physical inventory,10,20/10/2026,,,,,Opening balance',
        'AL,receipt,30,2026-10-20,al01,30/06/2027,State store,SIV-1,',
        'AL,issue,12,2026-10-21,AL01,,Ward A,,',
    ];

    // A check writes nothing, and raises no alert even though ORS sits at its EOP.
    ($this->upload)($this->u['sdp'], $url, $file, dryRun: true)->assertJsonPath('data.failed_rows', 0);
    expect(StockTransaction::count())->toBe(0)->and(Alert::count())->toBe(0);

    ($this->upload)($this->u['sdp'], $url, $file)->assertJsonPath('data.committed', true)
        ->assertJsonPath('data.rows.0.label', 'ORS: physical inventory 10, balance 10')
        ->assertJsonPath('data.rows.2.label', 'AL batch AL01: issue 12, balance 18');

    expect(StockBalance::where(['facility_id' => $this->kawo->id, 'product_id' => $this->al->id])->value('quantity_on_hand'))->toBe(18)
        ->and(StockTransaction::where('transaction_type', TransactionType::PhysicalCount)->value('comments'))->toBe('Opening balance')
        ->and(Alert::where('product_id', $this->ors->id)->count())->toBe(1); // raised once the import committed
});

it('refuses stock rows the ledger would refuse', function () {
    $rows = ($this->upload)($this->u['sdp'], "facilities/{$this->kawo->id}/imports/stock-entries", [
        'product_code,type,quantity,date,batch_no,received_from_or_issued_to',
        'ORS,issue,5,2026-10-21,,Ward A',
        'AL,receipt,5,2026-10-21,,CMS',
        'ORS,receipt,5,2026-12-01,,CMS',
        'ORS,swap,5,2026-10-21,,CMS',
    ])->assertJsonPath('data.committed', false)->json('data.rows');

    expect($rows[0]['errors'][0])->toBe(['column' => 'quantity', 'message' => 'Insufficient stock: 0 on hand.'])
        ->and($rows[1]['errors'][0]['column'])->toBe('batch_no')
        ->and($rows[2]['errors'][0]['column'])->toBe('date')
        ->and($rows[3]['errors'][0]['column'])->toBe('type');

    ($this->upload)($this->u['lga'], "facilities/{$this->kawo->id}/imports/stock-entries", ['product_code,type,quantity,date', 'ORS,receipt,1,2026-10-21'])
        ->assertForbidden();
});
