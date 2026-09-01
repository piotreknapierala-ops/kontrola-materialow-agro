# AGRO — kontrola materiałowa projektu (v0.6)

Statyczna aplikacja przeglądarkowa do raportu materiałowego przed kompletacją KPLW.

## Co zmieniono w v0.3

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


## v0.6 — archiwa bez rozpakowywania

- bezpośredni odczyt ZIP, 7z, RAR, TAR/TGZ/GZ w przeglądarce,
- z paczek pobierane są tylko XLS/XLSX/XLSB/CSV,
- worker libarchive uruchamiany jest przez lokalny `blob:` — omija blokadę cross-origin GitHub Pages,
- użytkownik nie musi ręcznie wyciągać Exceli z paczek konstrukcyjnych.

## Zmiana v0.6 — rozpiski profili/prętów

- Kolumna `Ilość` jest liczbą odcinków z danym rozkrojem.
- Kolumna `Odpad` jest odpadem przypadającym na jeden odcinek.
- Oczekiwane zużycie długości: `(długość handlowa - odpad) × Ilość`.
- Dla `Laser 3D` pozycje z długością `5800 mm` są magazynowo liczone jako `6000 mm`.
- Jeżeli jednostka systemowa to `kg`, najpierw liczona jest prawidłowa długość netto wg powyższej reguły, a następnie mnożona przez `kg/m`.


## v0.6 — folder projektu i zwiększenia ilości
- Można przeciągnąć cały folder projektu wraz z podfolderami albo użyć przycisku „Wybierz cały folder projektu”.
- Foldery datowane zawierające zwiększenia ilości są traktowane addytywnie: baza + zwiększenie 1 + zwiększenie 2.
- Ścieżka podfolderu jest zachowana w źródle, więc pliki o tej samej nazwie z różnych dat nie są uznawane za ten sam plik.
- Archiwa 7z/ZIP/RAR znalezione wewnątrz folderu są obsługiwane tak samo jak archiwa wrzucone pojedynczo.
