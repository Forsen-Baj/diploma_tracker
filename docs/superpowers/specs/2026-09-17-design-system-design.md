# Diploma Tracker — Design System Design

Date: 2026-09-17
Status: approved
Parent design: `2026-09-15-diploma-tracker-system-design.md` (§7, phase 3)

## 1. Purpose

One visual language and one set of interface building blocks for every page, in two
languages. The look follows the KPI schedule application: a white ground, soft
lavender-grey rounded cards, a single blue accent, horizontal tab navigation and generous
whitespace. Phases 4 to 7 add roughly ten pages; they are built from these components
rather than styled one by one.

**Reference: [schedule.kpi.ua](https://schedule.kpi.ua/).** Diploma Tracker is built for the
same university, so it should look like a sibling of that application: the same colours,
font, navigation style, controls, cards and badges. That application only shows timetables,
so its screens are not copied. Its visual vocabulary is applied to forms, tables and
workflows it does not have. When this document and the reference disagree on a visual
detail, the reference wins.

The phase also fixes the contract by which the API reports errors, because bilingual
error messages depend on it.

## 2. Decisions

| Topic | Decision |
|---|---|
| Interface languages | Ukrainian and English, switchable |
| Default language | Ukrainian; the choice is remembered in the browser |
| Styling | Tailwind CSS v4 with design tokens declared in `@theme` |
| Accessible primitives | Headless UI (dialog, menu, listbox, switch, tabs) |
| Icons | lucide-react |
| Feedback on success | Toast notifications |
| Devices | Desktop only; minimum layout width 1024px |
| API errors | Stable error codes with English fallback text; the interface translates the code |
| Not included | Dark theme, phone layouts, loading skeletons |

## 3. Visual language

**Tokens** — declared once in the Tailwind entry stylesheet under `@theme`, so every utility
class and every component draws from the same values:

| Group | Tokens |
|---|---|
| Colour | `background` `#FFFFFF`; `surface` `#EFF0F8` (lavender-grey fills, segmented-control track, highlighted column); `surface-subtle` `#EEEEF7`; `border` `#AFB0BE`; `border-subtle` `#C7C8D5`; `text` `#000000`; `text-strong` `#141518`; `text-muted` `#808191`; `heading` `#14366C` (navy, section and column headings); `accent` `#006DB3` (blue: badges, primary actions, links); `accent-strong` `#004571` (hover, pressed); `accent-soft` `#949DFF` (lavender highlight); `accent-contrast` `#FFFFFF`; plus `success`, `warning`, `danger` tuned to sit beside the accent |
| Radius | `card` (20px, large outer cards), `control` (6–8px, inputs and segmented items), `pill` (full, badges and segmented tracks) |
| Shadow | `subtle` (`0 0 2px rgba(0,0,0,.12)`) for the selected segment; `inset` (`inset 0 0 8px rgba(136,136,136,.08)`) for tracks. Separation comes mostly from fills and thin borders, not shadows |
| Typography | Exo 2 (includes Cyrillic), as in the reference, self-hosted through `@fontsource/exo-2` with weights 400, 500, 600, 700; body 14px, secondary 12px, section titles 18px semibold |
| Spacing | Tailwind's default scale; page padding 32px, gap between cards 24px |

Colour values above were sampled from the reference application on 2026-09-17. Token names
are what components depend on; values may be tuned against the reference during
implementation.

**Layout** — content is centred with a maximum width of 1200px and a minimum of 1024px;
narrower windows scroll horizontally rather than reflow.

**Application shell** — as in the reference: the logo and application name at the top left,
the role's navigation as centred horizontal text tabs (the active tab bold with an underline,
no pill or background), the language switch (`UK` / `EN`) and a user menu with *Account* and
*Sign out* at the right, and a thin divider under the header. The sign-in and account-claim pages use a centred card
without the tab bar but keep the language switch.

## 4. Components

Located in `src/components/ui/`, each in its own file, each styled only with tokens.

| Component | Responsibility |
|---|---|
| `AppShell` | Top bar, tab navigation for the current role, language switch, user menu, page container |
| `TabNav` | Centred horizontal text tabs bound to routes; the active tab is bold and underlined |
| `SegmentedControl` | Two to four mutually exclusive options on a `surface` pill track, the selected option a white rounded segment (e.g. filters, view switches), matching the reference's week switch |
| `PageHeader` | Page title, optional description, optional action buttons on the right |
| `Card` | White container with a thin `border-subtle` outline and `card` radius, optional title and actions |
| `Button` | Variants `primary`, `secondary`, `ghost`, `danger`; sizes `sm`, `md`; optional leading icon; loading state that disables the button |
| `TextField`, `Textarea`, `Select`, `FileInput`, `Checkbox` | Label, control, hint and error text wired with `aria-describedby`; `Select` built on Headless UI Listbox |
| `Switch` | On/off control built on Headless UI Switch, with a visible label |
| `DataTable` | Column definitions, row rendering, empty state and loading state; horizontal scroll inside the card when columns exceed the width |
| `Badge` | Short pill-shaped status label in tones `neutral`, `info` (accent blue with white text, like the reference's time badges), `success`, `warning`, `danger` |
| `Modal`, `ConfirmDialog` | Headless UI Dialog with focus trapping; `ConfirmDialog` asks for confirmation of destructive actions |
| `Toast` | `ToastProvider` and `useToast()`; success, error and info toasts that dismiss themselves after a few seconds |
| `EmptyState` | Icon, message and optional action for empty lists |

Status badges map domain states to tones in one place, so a status looks the same on every
page.

## 5. Languages

- **Library:** `react-i18next`.
- **Resources:** `src/i18n/uk.json` and `src/i18n/en.json`, nested keys grouped by area
  (`common`, `nav`, `auth`, `faculties`, `groups`, …, `errors`). The resource type is
  derived from `uk.json`, so a key used in code but missing from the resources fails
  type-checking.
- **Default and persistence:** Ukrainian on first visit; the switch writes the choice to
  `localStorage` under `dt.language` and updates `<html lang>`.
- **Formatting:** dates and numbers use `Intl` with the active locale.
- **Scope:** interface text only. Data entered by users — faculty names, topic titles,
  comments — is shown as entered.

## 6. API error contract

**Shape** — every error response body is:

```json
{ "code": "faculty.nameTaken", "message": "Faculty with the same name already exists." }
```

- `code` is stable, dot-separated `area.reason`, and is what the interface translates.
- `message` is English text for logs, API clients and a fallback when a translation is
  missing.
- Model-validation failures use `code: "validation.failed"` and add
  `fields: { "<fieldName>": ["<rule>"] }`, where rules are `required`, `maxLength`,
  `format` and similar. Forms validate the same rules in the browser first, so this
  response is a safety net rather than the usual path.
- Rate-limited requests use `code: "request.tooMany"`; unexpected server failures use
  `code: "server.unexpected"` with no internal detail.

**Backend**
- Services keep the `(T? result, string? error)` pattern; the error value is an error code.
  Codes and their English messages are defined together in one error catalogue per area
  (e.g. `AcademicStructureErrors`).
- Controllers choose the HTTP status from the code through one shared mapping, not by
  comparing message text.
- A single exception handler and the model-validation response factory emit the same shape.

**Frontend**
- `apiClient` turns every error response into `ApiError { status, code, message, fields? }`.
- Pages show `t('errors.' + code)`, falling back to `message` when no translation exists,
  and `errors.network` when no response arrived.

Every endpoint that exists when this phase starts, including the onboarding endpoints,
adopts the contract in this phase.

## 7. Applying the system

All existing pages are rebuilt on the shell, components and translation keys: sign-in,
account claim, account, dashboards, faculties, groups, group details, students, teachers,
task templates, and the student task pages. Behaviour and routes are unchanged. The
previous global stylesheets are replaced by the Tailwind entry stylesheet.

## 8. Delivery and verification

Order within the phase: foundation (Tailwind, fonts, tokens, i18n setup, error contract in
backend and `apiClient`), then components, then page migration. Automated checks: backend
build, frontend `tsc`, lint and production build, and a scripted check that representative
error responses carry `code` and `message`. The owner reviews the result visually once the
pages are migrated. Unit tests for the components and the error mapping are recorded in
`docs/superpowers/test-backlog.md`.

## 9. Not included

- Dark theme.
- Phone and tablet layouts.
- Loading skeletons (loading states use a spinner or text).
- Translation of user-entered data.
- Per-user language stored on the account.
