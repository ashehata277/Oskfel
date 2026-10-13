---
name: tslint-member-ordering
description: >
  Enforces this repo's TSLint member-ordering and class-body layout from Frontend/tslint.json.
  Use whenever creating or editing an Angular class (component, service, directive, pipe, guard,
  dialog), adding fields, constructor params, getters, lifecycle hooks, or methods. Also trigger
  on "member-ordering", "tslint", "class member order", "property order", "ordering props",
  "static-field", "instance-field", or a TSLint member-ordering failure.
---

# TSLint member ordering (Baton app)

Source of truth: `tslint.json` `member-ordering`. Do not invent a stricter Angular style-guide
order. `object-literal-sort-keys` and `ordered-imports` are **off** — do not alphabetize object
keys or import lists.

## Required class-body order

```
static-field
instance-field
static-method
instance-method
```

`constructor` is not listed in `tslint.json`. In this repo put it **after instance fields and
before instance methods** (lifecycle + public + private methods).

## What counts as what

| Group           | Includes                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| static-field    | `static` properties, `static readonly`                                                                 |
| instance-field  | `@Input` / `@Output`, `readonly`, injected-as-field, `public`/`private` properties, field initializers |
| static-method   | `static` methods                                                                                       |
| instance-method | `constructor`, getters/setters, lifecycle (`ngOnInit`…), public methods, then private methods          |

Do not interleave methods and fields. Do not put a method above an instance field.

## Example

```ts
export class ExampleComponent implements OnInit {
  static readonly DEFAULT_PAGE = 10;

  @Input() title: string;
  readonly plans = PLANS;
  selectedRow: TeamSettings;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: ExampleService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.service.load();
  }

  save(): void {
    this.service.save().subscribe({
      next: () => this.toastService.showSuccess('Saved', 'Record saved'),
      error: (err) => this.toastService.showError('Save failed', err.message),
    });
  }

  private load(): void {}
}
```

## Do not

- Alphabetize `@Component({...})` keys beyond matching the neighbouring file
- Reorder imports (`ordered-imports` is false)
- Sort object-literal keys (`object-literal-sort-keys` is false)
- Move `constructor` above fields
- Place private methods above public lifecycle hooks when adding new members — keep
  `ngOnInit` / public API first, then `private`
