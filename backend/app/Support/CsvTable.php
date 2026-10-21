<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

/**
 * An uploaded CSV as rows keyed by column name, for bulk imports. Made to
 * accept what spreadsheets actually save: a UTF-8 BOM, Windows-1252 text,
 * ";" as the separator (Excel in some locales), headers in any case with
 * spaces ("Product code" = product_code), and blank lines. Empty cells
 * become null. Problems with the file as a whole are a 422 on "file".
 */
class CsvTable
{
    /**
     * @param  list<string>  $columns  the columns the import knows
     * @param  list<string>  $required  columns that must be present in the header
     * @return array<int, array<string, string|null>> rows keyed by their line number in the file (header is line 1)
     */
    public static function read(string $path, array $columns, array $required, int $maxRows): array
    {
        $text = (string) file_get_contents($path);
        $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
        if (! mb_check_encoding($text, 'UTF-8')) {
            $text = mb_convert_encoding($text, 'UTF-8', 'Windows-1252');
        }

        $lines = preg_split('/\r\n|\n|\r/', $text);
        $first = $lines[0] ?? '';
        $separator = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';

        $stream = fopen('php://temp', 'r+');
        fwrite($stream, $text);
        rewind($stream);

        $header = null;
        $rows = [];
        $line = 0;
        while (($cells = fgetcsv($stream, null, $separator, '"', '')) !== false) {
            $line++;
            if ($cells === [null] || trim(implode('', $cells)) === '') {
                continue;
            }
            if ($header === null) {
                $header = array_map(self::columnName(...), $cells);
                self::checkHeader($header, $columns, $required);

                continue;
            }
            if (count($rows) >= $maxRows) {
                fclose($stream);
                self::fail("The file has more than {$maxRows} rows. Split it into smaller files.");
            }

            $row = [];
            foreach ($header as $i => $name) {
                if ($name === '') {
                    continue;
                }
                $value = isset($cells[$i]) ? trim($cells[$i]) : '';
                $row[$name] = $value === '' ? null : $value;
            }
            $rows[$line] = $row;
        }
        fclose($stream);

        if ($header === null) {
            self::fail('The file is empty. Download the template and fill it in.');
        }
        if ($rows === []) {
            self::fail('The file has a header row but no rows under it.');
        }

        return $rows;
    }

    /** "Product Code " → product_code; "Min stock level" → min_stock_level. */
    public static function columnName(?string $cell): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/', '_', strtolower(trim((string) $cell))), '_');
    }

    /** @param  list<string>  $header */
    private static function checkHeader(array $header, array $columns, array $required): void
    {
        $named = array_values(array_filter($header, fn ($c) => $c !== ''));
        if ($unknown = array_diff($named, $columns)) {
            self::fail('Unknown column'.(count($unknown) > 1 ? 's' : '').': '.implode(', ', $unknown).'. The columns are: '.implode(', ', $columns).'.');
        }
        if ($missing = array_diff($required, $named)) {
            self::fail('Missing column'.(count($missing) > 1 ? 's' : '').': '.implode(', ', $missing).'.');
        }
        if (count($named) !== count(array_unique($named))) {
            self::fail('A column appears twice in the header row.');
        }
    }

    private static function fail(string $message): never
    {
        throw ValidationException::withMessages(['file' => $message]);
    }
}
