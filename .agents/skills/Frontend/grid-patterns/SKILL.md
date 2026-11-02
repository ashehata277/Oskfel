---
name: grid-patterns
description: >
  Enforces the Syncfusion EJ2 Angular Grid patterns used across this repo. Use this skill
  whenever adding a new grid, modifying an existing grid, working with ListParamBase,
  CustomGridColumns, grid sorting/filtering/pagination, column visibility/chooser, row
  selection, row commands, aggregates, toolbar exports, or persisting grid state to
  localStorage. Also trigger on "add a grid", "new grid", "grid-container", "Syncfusion
  grid", "dataQueried", "ListParamBase", or references to LocalStorageService grid keys.
---

# Grid Patterns

Every grid in this app is a `<grid-container>` (or `<grid-container-v2>` for `dataBound`
events) wrapping Syncfusion EJ2 Angular Grids. State (sort/filter/page) lives in a single
`ListParamBase` object, persisted per-team to localStorage, and sent to the API on every
change. Deviating from this pattern breaks state restoration and multi-tenant isolation.

## Architecture Rules

### 1. Container Choice

| Component             | Path                                                                    | Use when                                                     |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `<grid-container>`    | `src/app/shared/syncfusion-grid/container/container.component.ts`       | Default — use for all new grids                              |
| `<grid-container-v2>` | `src/app/shared/syncfusion-grid/container-v2/container-v2.component.ts` | Only if you need `dataBound` output or improved context menu |

### 2. Column Definitions — `CustomGridColumns`

**Path:** `src/app/shared/syncfusion-grid/interfaces/custom-grid-columns.ts`

Always include a hidden primary-key column and mark it out of the column chooser:

```typescript
columnsList: CustomGridColumns[] = [
  { key: 'id', header: 'ID', isPrimary: true, visible: false, showInColumnChooser: false },
  { key: 'checkbox', type: 'checkbox', header: 'Select', width: 90, allowSorting: false, allowFiltering: false },
  { key: 'code', header: 'Code', width: 110 },
  { key: 'rate', header: 'Labour Rate', width: 110, textAlign: 'Right', type: 'number', format: 'N2' },
  { key: 'lift', header: 'Lift', width: 110, filter: { type: 'CheckBox' } },
  { key: 'dateOfWork', header: 'Date', type: 'date', format: 'MM/dd/yyyy', width: 120 },
];
```

For custom cell rendering use `formatValueFunction: (field, data) => string` rather than a
template — keeps columns declarative and serializable.

### 3. State — `ListParamBase`

**Path:** `src/app/shared/list-param-base.ts`

Single object carries `getAllData`, `excludeDeletedItems`, `pagingData`, `sortingData`,
`searchData` (legacy — prefer `filterList`), `filterList`, `searchList`, `teamName` (set
by container, never manually). The grid emits it via `(dataQueried)`; the component
persists pieces of it and forwards it to the API.

```typescript
listParamBase: ListParamBase = {
  getAllData: false,
  excludeDeletedItems: true,
  filterList: [],
  searchList: [],
  pagingData: { currentPage: 1, pageSize: 20 },
  sortingData: {} as SortingData,
};
```

### 4. Data Flow (must follow this order)

```
User sorts/filters/pages
  -> grid-container fires (dataQueried) with updated ListParamBase
  -> Component.onDataQueried(event)
       1. Save listParamBase reference
       2. Persist filterList  -> localStorage
       3. Persist sortingData -> localStorage
       4. Call API with listParamBase
  -> API returns IPaginatedResult<T>
  -> Bind result to [data] input on grid-container
```

Pagination resets to page 1 automatically on filter/sort change — the container handles
this; don't reimplement it in the component.

## Sorting

`SortingData` = `{ field, sortingType: SortingTypesEnum, fields? }`, where
`SortingTypesEnum.Ascending = 1`, `Descending = 2`.

Set a default via `[defaultSort]` (Syncfusion's own shape, not `SortingData`):

```typescript
readonly defaultSort = { columns: [{ field: 'dateOfWork', direction: 'Descending' }] };
```

Restore prior sort from localStorage and bind to `[sortOptions]`:

```typescript
const storedSort = this.localStorageService.getByTeam(LocalStorageKeys.MyGridSorts) as SortingData;
this.sortOptions = storedSort?.field
  ? { columns: [{ field: storedSort.field, direction: SortingTypesEnum[storedSort.sortingType] }] }
  : null;
```

Persist in `onDataQueried`: `this.localStorageService.setByTeam(LocalStorageKeys.MyGridSorts, event.listParamBase.sortingData)`.

## Filtering

`SearchData` = `{ searchValue, operator: FilterOperatorEnum, field, isDateTimeFilter? }`.
`FilterOperatorEnum` covers Like/Contain/Equal/NotEqual/GreaterThan/LessThan/
GreaterThanOrEqual/LessThanOrEqual/In/StartWith/EndWith/Between.

- **Default menu filter** — no column config needed; container provides operators per type.
- **CheckBox filter** — `{ key: 'status', filter: { type: 'CheckBox' } }`.
- **Custom filter bar template** — set `filterBarTemplate` on the column; container
  auto-applies a red-underline indicator when active.
- **Custom filter UI** (dropdown etc.) — build an `IFilter` with `ui.create/write/read`
  hooks (see `staffTypeFilter` pattern using `DropDownList` + `createElement`).

Restore via `getByTeam(LocalStorageKeys.MyGridFilters)` into `[defaultFilters]`; persist
via `setByTeam(LocalStorageKeys.MyGridFilters, event.listParamBase.filterList)`.

## Pagination

`PagingData` = `{ currentPage?, pageSize? }`. Always pass `[pageSize]` and `[pageSizes]`:

```html
<grid-container [allowPaging]="true" [pageSize]="20" [pageSizes]="['20','50','100','200','500']"></grid-container>
```

## localStorage Keys

**Path:** `src/app/shared/localStorage/localStorageKeys.ts`

Every new grid adds exactly three keys, following `<GridName>Filters`,
`<GridName>Sorts`, `<GridName>ColumnsVisibilitySettings`. Always go through
`LocalStorageService.setByTeam/getByTeam` — direct `localStorage.setItem/getItem` bypasses
team scoping and leaks state across tenants.

## Column Visibility (Column Chooser)

```typescript
{ key: 'remarks', header: 'Remarks', visible: false, showInColumnChooser: true }
```

Handle `(columnChooserSettingsChanged)`, map to `ColumnVisibilitySettings[]`, persist with
the `ColumnsVisibilitySettings` key, and restore the same shape in the constructor.

## Row Selection

```typescript
selectionOptions: SelectionSettingsModel = {
  mode: 'Row',
  type: 'Multiple',
  checkboxOnly: true,
  persistSelection: true,
};
```

Track selections across pages with a `Set<string>` of ids plus a `Map<string, T>` for the
actual objects, updated in `(rowSelected)`/`(rowDeselected)` — `persistSelection` alone
does not give you access to the selected objects across pages.

## Row Commands

```typescript
commands: CommandModel[] = [
  { title: 'Edit', buttonOption: { iconCss: 'fas fa-pen', click: (data) => this.openEditModal(data) } },
  { title: 'Delete', buttonOption: { iconCss: 'fas fa-trash', click: (data) => this.confirmDelete(data) } },
];
```

## Aggregates (Footer Totals)

**Path:** `src/app/shared/syncfusion-grid/interfaces/aggregate-model.ts`

```typescript
aggregates: IAggregateModel[] = [
  { type: 'Sum', columns: ['wageCost', 'labourCost'] },
  { type: 'Count', columns: ['id'] },
];
```

Container computes aggregates from current page data only. For totals across all pages,
listen to `(totalsQueried)` instead of relying on `[aggregates]`.

## Toolbar, Exports, Grid Instance

```html
<grid-container
  [showAdd]="true"
  [showSearchBar]="true"
  [showColumnChooser]="true"
  [showExcelExport]="true"
  [showPdfExport]="true"
  [showCsvExport]="true"
  (addRecord)="openAddModal()"
  (gridInstance)="setGridInstance($event)"
></grid-container>
```

Capture the instance to call imperative methods: `showSpinner()`, `hideSpinner()`,
`refresh()`, `clearFiltering()`, `clearSorting()`, `excelExport()`, `pdfExport()`,
`csvExport()`.

## Row & Cell Styling

```typescript
onRowDataBound(args: RowDataBoundEventArgs): void {
  if ((args.data as MyItem).isArchived) args.row.classList.add('archived-row');
}

onQueryCellInfo(args: QueryCellInfoEventArgs): void {
  if (args.column?.field === 'status' && args.data.isOverdue) (args.cell as HTMLElement).style.color = 'red';
}
```

Prefer a CSS class over inline styles where possible so theme tokens still apply.

---

## Anti-Patterns (existing grids do these — do NOT copy them)

Most grid components in this repo were assembled by copy-pasting an earlier one, so the same
bugs are replicated across many files (the typo'd helper `getSotredGridSorts` — "Sotred" — is
the fingerprint, present in 6+ components). When you touch a grid, fix these; when you write a
new one, avoid them from the start:

1. **Direct `localStorage.setItem/getItem` + manual `JSON.stringify/parse`** — bypasses team
   scoping, leaks state across teams, and `JSON.parse(null)` throws when the key is absent.
   Always use `LocalStorageService.setByTeam/getByTeam` (it does the serialization, the team
   prefix, and a try/catch returning `null`). Seen in materials requests grid, pricing
   stock-items/material catalogue, resources staff-directory grid.
2. **Stored filters/sorts retrieved but never applied to `listParamBase`** — the UI shows them
   via `[defaultFilters]`/`[sortOptions]` but the first API call goes out empty. Assign restored
   state to BOTH `listParamBase.filterList`/`.sortingData` AND the grid inputs.
3. **Missing `hideSpinner()` in the error callback** — spinner sticks forever on a failed
   request, blocking the whole grid. Always subscribe with `{ next, error }` and call
   `grid?.hideSpinner()` in both.
4. **`setTimeout(() => {...}, 10)` wrapping every `showSpinner` + API call** — a fragile
   change-detection workaround masking "grid called before it's mounted". Capture the instance
   via `(gridInstance)`, call `grid?.showSpinner()` guarded, and move an initial load to
   `ngAfterViewInit` instead of delaying it.
5. **`this.listParamBase = {} as ListParamBase`** — the cast silences the compiler but
   `listParamBase.pagingData.currentPage` throws at runtime. Initialize with the full object
   literal from the state template above.
6. **`loadingSpinnerService.show()` called again where `.hide()` was meant** — spinner never
   clears on success. Mirror show/hide in `{ next, error }`.
7. **Missing hidden `isPrimary` id column** — Syncfusion can't uniquely identify rows, breaking
   persistent selection, row commands, and context menus. Always first column:
   `{ key: 'id', header: 'ID', isPrimary: true, visible: false, showInColumnChooser: false }`.

Root cause is copy-paste with no shared base class or `GridStateService`. If you find yourself
duplicating the save/restore boilerplate again, that's the signal to extract typed helpers
(`getGridFilters<T>(key)`, `getGridSort(key)`) rather than paste a seventh copy.

---

## Checklist for Adding a New Grid

- [ ] Define `columnsList: CustomGridColumns[]` — include a hidden `isPrimary` id column
- [ ] Add `ListParamBase` with initial state
- [ ] Add `defaultSort` with appropriate field and direction
- [ ] Add three localStorage keys in `localStorageKeys.ts`: `Filters`, `Sorts`, `ColumnsVisibilitySettings`
- [ ] Restore filters & sort from localStorage in constructor
- [ ] Implement `onDataQueried` — persist state, then call API
- [ ] Bind `[data]` to `IPaginatedResult<T>` from the API
- [ ] Use `LocalStorageService.setByTeam/getByTeam` — never direct `localStorage` calls
- [ ] Pass `[pageSize]` and `[pageSizes]` inputs
- [ ] Add `(gridInstance)` output if you need spinner control

## Key Files Reference

| Purpose                                     | Path                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Grid container (primary)                    | `src/app/shared/syncfusion-grid/container/container.component.ts`       |
| Grid container v2                           | `src/app/shared/syncfusion-grid/container-v2/container-v2.component.ts` |
| Column interface                            | `src/app/shared/syncfusion-grid/interfaces/custom-grid-columns.ts`      |
| Grid state interfaces                       | `src/app/shared/list-param-base.ts`                                     |
| Event models (`DataQueriedEvent`)           | `src/app/shared/syncfusion-grid/interfaces/filter-event.model.ts`       |
| Aggregate models (`IAggregateModel`)        | `src/app/shared/syncfusion-grid/interfaces/aggregate-model.ts`          |
| localStorage keys                           | `src/app/shared/localStorage/localStorageKeys.ts`                       |
| LocalStorageService                         | `src/app/shared/local-storage.service.ts`                               |
| Paginated result model (`IPaginatedResult`) | `src/app/shared/syncfusion-grid/interfaces/paginated-result.model.ts`   |

For the full component + template example (constructor restore, `onDataQueried`, HTML
bindings for every input/output), see `GRID_PATTERNS.md` at the repo root.
