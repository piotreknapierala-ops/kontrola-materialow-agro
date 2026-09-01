# AGRO — kontrola materiałowa projektu (v0.1)

Statyczna aplikacja przeglądarkowa do raportu przed kompletacją KPLW.

## Uruchomienie

Najprościej wrzucić cały folder na GitHub Pages. `index.html`, `styles.css` i `app.js` muszą leżeć obok siebie.

Aplikacja korzysta z:
- SheetJS CE 0.20.3 (odczyt i eksport XLSX),
- libarchive.js 2.0.2 (próba rozpakowania 7z w przeglądarce).

Dane z arkuszy są przetwarzane po stronie przeglądarki. Aplikacja nie ma backendu.

## Logika v0.1

- Projekt jest normalizowany do formatu `P/000/00`.
- Nazwa projektu jest uczona z pola `Projekt26` i zapisywana w `localStorage`.
- Systemowe ruchy są rozpoznawane po prefiksach dokumentów: ZKP/KZKP, RW, ZDWP, KPLW.
- ZKP/KZKP i RW: ilość z `Zmiana ilości`.
- ZDWP jest informacyjne i nie jest dodawane do zużycia/stanu.
- KPLW jest wykrywane, ale pomijane w raporcie przed kompletacją.
- Zasoby są dzielone na `Produkcja wyposażenia` i `Materiały wyposażenia`.
- Dla zasobów `NrZAMP` (kolumna L) jest traktowany jako bieżące przypisanie do projektu, a `Projekt26` jako informacja o pochodzeniu. Pozwala to zachować przesunięcia z innych projektów bez gubienia ich w bilansie.
- Rozpiski Cięte/Laser 3D/Toczone są sumowane po indeksie. Jeżeli system prowadzi materiał w kg, aplikacja próbuje wyznaczyć kg/m z mas i długości w BOM.
- Laser 3D może być automatycznie wyłączony z kontroli materiałowej, gdy w ZDWP zostanie wykryta usługa `PALENIE LASEREM 3D`; można to ręcznie nadpisać.
- Laser 2D zawsze zakłada nasz materiał. Blachy są wiązane z indeksami systemowymi po grubości/gatunku, a konstrukcja daje minimalną masę netto detali. Bez rozkroju aplikacja nie uznaje nadwyżki nad masą detali automatycznie za błąd.

## Baza

Aplikacja uczy się lokalnie:
- numer projektu → nazwa,
- indeks → nazwa systemowa + jednostka.

Przyciski `Eksport bazy` / `Import bazy` pozwalają przenieść tę wiedzę na inny komputer lub przeglądarkę.
