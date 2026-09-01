# AGRO — kontrola materiałowa projektu (v0.2)

Statyczna aplikacja przeglądarkowa do raportu materiałowego przed kompletacją KPLW.

## Co zmieniono w v0.2

- stała baza 17 696 unikatowych indeksów (`indeksy.json`) z nazwą, jednostką systemową i kategorią,
- raport główny pokazuje tylko różnice / pozycje wymagające reakcji,
- eksport Excel również nie zawiera pozycji OK,
- małe nadwyżki są ignorowane według tolerancji zależnych od kategorii i jednostki,
- dla kategorii `złączne` w sztukach: dopuszczalna nadwyżka do 5%, minimum 2 szt., maksymalnie 10 szt.; niedobór pozostaje rygorystyczny,
- dla pozostałych pozycji w sztukach: nadwyżka do 2%, minimum 1 szt., maksymalnie 5 szt.,
- dla kg/m/m2/m3/t/l: nadwyżka do 2% (minimum 0,1 jednostki),
- dla blach masa z konstrukcji nadal jest traktowana jako minimum i ma osobną logikę weryfikacji.

Przykład: konstrukcja wymaga 250 śrub, a pod projektem jest 260 szt. — status OK i pozycja nie trafia do raportu różnic. 249 szt. — niedobór i pozycja trafia do raportu.

## Publikacja GitHub Pages

W katalogu głównym repozytorium powinny znajdować się obok siebie:

- `index.html`
- `styles.css`
- `app.js`
- `indeksy.json`
- `README.md`

Dane z wgrywanych arkuszy są analizowane lokalnie w przeglądarce. Aplikacja nie ma backendu.
