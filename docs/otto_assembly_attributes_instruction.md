# OTTO: инструкция по заполнению атрибутов сборки мебели

Дата: 2026-07-13

Источник: локальная OTTO-схема категорий, live-схема OTTO `/v5/products/categories` для проверенных мебельных категорий и реальные `raw_product` из XL attribute-fill batch.

## 1. Цель

Нужно автоматически заполнять OTTO-атрибуты, связанные со сборкой, монтажом, комплектом поставки и языком инструкции.

Главное правило: не делать ручную таблицу для каждой категории. У OTTO набор атрибутов зависит от `categoryGroup`, поэтому имплементация должна смотреть схему конкретной категории и заполнять только те поля, которые реально существуют для этой категории.

## 2. Универсальный алгоритм

Для каждого товара:

1. Взять `product_category`.
2. Найти соответствующую OTTO `categoryGroup`.
3. Загрузить атрибуты этой `categoryGroup`.
4. Проверить наличие следующих атрибутов:
   - `Aufbauhinweise`
   - `Montagehinweise`
   - `Montagehinweis`
   - `Art Montage`
   - `Lieferumfang`
   - `Sprachen Bedienungs-/Aufbauanleitung`
5. Заполнять только те атрибуты, которые есть в схеме категории.
6. Не добавлять атрибут повторно, если он уже есть у товара.
7. Не выдумывать значение, если в исходных данных нет основания.

## 3. Общий формат OTTO-атрибута

Все значения добавляются в `productDescription.attributes`.

Пример:

```json
{
  "name": "Aufbauhinweise",
  "values": ["Einfache Selbstmontage mit Aufbauanleitung"],
  "additional": true
}
```

Даже если значение одно, `values` должен быть массивом.

## 4. Значение каждого атрибута

### 4.1. `Sprachen Bedienungs-/Aufbauanleitung`

Это язык инструкции. Это не текст инструкции.

Использовать, если у товара есть `Bedienungsanleitung`, `Aufbauanleitung`, `Montageanleitung` или явно указано, что инструкция есть.

Рекомендуемое значение для наших товаров:

```json
{
  "name": "Sprachen Bedienungs-/Aufbauanleitung",
  "values": ["Deutsch (DE)"],
  "additional": true
}
```

Примеры значений из локальных OTTO-примеров:

- `Deutsch (DE)`
- `Englisch (EN)`
- `Französisch (FR)`
- `Italienisch (IT)`
- `Türkisch (TR)`

### 4.2. `Aufbauhinweise`

Главное поле для короткого текста о сборке.

Хорошие значения:

```json
{
  "name": "Aufbauhinweise",
  "values": ["Kein Aufbau notwendig"],
  "additional": true
}
```

```json
{
  "name": "Aufbauhinweise",
  "values": ["Einfache Selbstmontage mit Aufbauanleitung"],
  "additional": true
}
```

```json
{
  "name": "Aufbauhinweise",
  "values": ["Teilmontiert, nur Füße zu montieren"],
  "additional": true
}
```

```json
{
  "name": "Aufbauhinweise",
  "values": ["Eine zweite Person zum Aufbau wird empfohlen"],
  "additional": true
}
```

Не рекомендуется генерировать `Ja` или `Nein`, хотя такие значения встречаются в реальных данных. Лучше писать понятную немецкую фразу.

### 4.3. `Montagehinweise` и `Montagehinweis`

Это дополнительные монтажные указания.

Название зависит от категории:

- у `Tische` чаще используется `Montagehinweise`;
- у `Schränke`, `Sideboards`, `Regale` чаще используется `Montagehinweis`.

Имплементация должна выбирать только то имя, которое есть в схеме конкретной `categoryGroup`.

Пример:

```json
{
  "name": "Montagehinweise",
  "values": ["Montagematerial inklusive"],
  "additional": true
}
```

или:

```json
{
  "name": "Montagehinweis",
  "values": ["Montagematerial inklusive"],
  "additional": true
}
```

### 4.4. `Lieferumfang`

Это комплект поставки.

Если инструкция реально входит в комплект, можно добавить:

```json
{
  "name": "Lieferumfang",
  "values": ["Aufbauanleitung"],
  "additional": true
}
```

Если `Lieferumfang` уже заполнен другими значениями, нужно добавлять `Aufbauanleitung` к существующему массиву, а не заменять весь комплект.

### 4.5. `Art Montage`

Это тип установки или монтажа. Это не текст инструкции.

Примеры:

```json
{
  "name": "Art Montage",
  "values": ["Freistehend"],
  "additional": true
}
```

```json
{
  "name": "Art Montage",
  "values": ["Wandmontage"],
  "additional": true
}
```

```json
{
  "name": "Art Montage",
  "values": ["stehend", "Wandmontage"],
  "additional": true
}
```

## 5. Матрица по основным мебельным группам

Эта матрица нужна как ориентир. В коде все равно проверять фактическую схему категории.

| CategoryGroup | Доступные поля |
| --- | --- |
| `Tische` | `Art Montage`, `Aufbauhinweise`, `Lieferumfang`, `Montagehinweise`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Sideboards` | `Art Montage`, `Aufbauhinweise`, `Lieferumfang`, `Montagehinweis`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Schränke` | `Art Montage`, `Aufbauhinweise`, `Lieferumfang`, `Montagehinweis`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Regale` | `Art Montage`, `Aufbauhinweise`, `Lieferumfang`, `Montagehinweis`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Sofas` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Sitzmöbel-Sets` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Betten` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Komplettbetten` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Stühle` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Sessel` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Hocker` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Sitzbänke` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Kastenmöbel-Sets` | `Art Montage`, `Aufbauhinweise`, `Lieferumfang`, `Montagehinweise`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Schlafzimmermöbel-Sets` | `Aufbauhinweise`, `Lieferumfang`, `Montagehinweise`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Arbeitsmöbel-Sets` | `Aufbauhinweise`, `Lieferumfang`, `Montagehinweise`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Leuchten` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Waschtische` | `Art Montage`, `Aufbauhinweise`, `Lieferumfang`, `Montagehinweis`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Badewannen` | `Art Montage`, `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Türen` | `Lieferumfang`, `Montagehinweise`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Spiegel` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |
| `Pflanzgefäße` | `Aufbauhinweise`, `Lieferumfang` |
| `Zaunelemente` | `Aufbauhinweise`, `Lieferumfang`, `Sprachen Bedienungs-/Aufbauanleitung` |

## 6. Рекомендованный allowlist для имплементации

В текущей логике AI-заполнения часть этих полей может не попадать в prompt, потому что у мебели они часто имеют `relevance=LOW`.

Нужно добавить отдельный allowlist и пропускать эти поля в AI-кандидаты, если они существуют в схеме категории:

```python
ASSEMBLY_ATTRIBUTE_NAMES = {
    "Aufbauhinweise",
    "Montagehinweise",
    "Montagehinweis",
    "Art Montage",
    "Lieferumfang",
    "Sprachen Bedienungs-/Aufbauanleitung",
}
```

Правило:

```python
if attr.name in ASSEMBLY_ATTRIBUTE_NAMES:
    include_attribute_even_if_low_relevance = True
```

Но это не значит, что AI обязан заполнить каждое поле. Это значит только, что AI получает право заполнить поле, если есть основание в исходных данных.

## 7. Рекомендованный словарь значений

Для `Aufbauhinweise`:

- `Kein Aufbau notwendig`
- `Einfache Selbstmontage`
- `Einfache Selbstmontage mit Aufbauanleitung`
- `Einfache Selbstmontage mit Anleitung`
- `Teilmontiert`
- `Teilmontiert, nur Füße zu montieren`
- `Teilweise montiert`
- `Vollständig montiert`
- `Eine zweite Person zum Aufbau wird empfohlen`

Для `Montagehinweise` / `Montagehinweis`:

- `Montagematerial inklusive`
- `Wandmontage erforderlich`
- `Montage nur gemäß Anleitung`

Для `Lieferumfang`:

- `Aufbauanleitung`
- `Montagematerial`
- `Beschläge`
- `Schrauben`

Для `Sprachen Bedienungs-/Aufbauanleitung`:

- `Deutsch (DE)`

Для `Art Montage`:

- `Freistehend`
- `Wandmontage`
- `stehend`
- `hängend`
- `stehend montierbar`
- `Keine Montage erforderlich`

## 8. Mapping из исходного текста

Если в исходных данных есть:

- `montiert`, `fertig montiert`, `assembled` -> `Aufbauhinweise = Vollständig montiert`
- `kein Aufbau`, `no assembly`, `ready to use` -> `Aufbauhinweise = Kein Aufbau notwendig`
- `Selbstmontage`, `self assembly` -> `Aufbauhinweise = Einfache Selbstmontage`
- `Aufbauanleitung`, `mit Anleitung`, `assembly instructions included` -> `Aufbauhinweise = Einfache Selbstmontage mit Aufbauanleitung`
- `Füße montieren`, `legs to attach` -> `Aufbauhinweise = Teilmontiert, nur Füße zu montieren`
- `zweite Person`, `two persons recommended` -> `Aufbauhinweise = Eine zweite Person zum Aufbau wird empfohlen`
- `Montagematerial inklusive`, `mounting material included` -> `Montagehinweise/Montagehinweis = Montagematerial inklusive`
- `Wandmontage`, `wall mounted` -> `Art Montage = Wandmontage`
- `freistehend`, `free standing` -> `Art Montage = Freistehend`
- `Bedienungsanleitung`, `Aufbauanleitung`, `Montageanleitung` -> `Sprachen Bedienungs-/Aufbauanleitung = Deutsch (DE)` и при наличии `Lieferumfang` можно добавить `Aufbauanleitung`

## 9. Пример результата для стола

Категория: `Couchtisch`, group `Tische`.

```json
[
  {
    "name": "Aufbauhinweise",
    "values": ["Einfache Selbstmontage mit Aufbauanleitung"],
    "additional": true
  },
  {
    "name": "Montagehinweise",
    "values": ["Montagematerial inklusive"],
    "additional": true
  },
  {
    "name": "Lieferumfang",
    "values": ["Aufbauanleitung"],
    "additional": true
  },
  {
    "name": "Sprachen Bedienungs-/Aufbauanleitung",
    "values": ["Deutsch (DE)"],
    "additional": true
  }
]
```

## 10. Пример результата для шкафа

Категория: `Kleiderschrank`, group `Schränke`.

```json
[
  {
    "name": "Aufbauhinweise",
    "values": ["Einfache Selbstmontage mit Aufbauanleitung"],
    "additional": true
  },
  {
    "name": "Montagehinweis",
    "values": ["Montagematerial inklusive"],
    "additional": true
  },
  {
    "name": "Lieferumfang",
    "values": ["Aufbauanleitung"],
    "additional": true
  },
  {
    "name": "Sprachen Bedienungs-/Aufbauanleitung",
    "values": ["Deutsch (DE)"],
    "additional": true
  }
]
```

## 11. Пример результата для дивана

Категория: `Ecksofa`, group `Sofas`.

```json
[
  {
    "name": "Aufbauhinweise",
    "values": ["Teilmontiert, nur Füße zu montieren"],
    "additional": true
  },
  {
    "name": "Lieferumfang",
    "values": ["Aufbauanleitung"],
    "additional": true
  },
  {
    "name": "Sprachen Bedienungs-/Aufbauanleitung",
    "values": ["Deutsch (DE)"],
    "additional": true
  }
]
```

## 12. Проверки перед отправкой в OTTO

Перед submit:

1. Атрибут существует в схеме `categoryGroup`.
2. Имя атрибута написано точно как в OTTO.
3. `values` является массивом строк.
4. Значения не пустые.
5. Атрибут не дублируется.
6. Для `Montagehinweis` / `Montagehinweise` выбрано правильное имя из схемы.
7. `Lieferumfang` не перезаписывает существующие значения.
8. `Sprachen Bedienungs-/Aufbauanleitung` не используется как текст инструкции.
9. `Art Montage` не используется как текст инструкции.
10. Нет значений `Ja` / `Nein` в `Aufbauhinweise`, если можно заменить их нормальной фразой.

