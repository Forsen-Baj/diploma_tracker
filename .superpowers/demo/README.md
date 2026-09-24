# Demo data and walkthrough

`seed-demo.mjs` fills a freshly seeded database with a small Ukrainian faculty, so every screen
has something real to show. Run it once, with the API on :5000:

```
node .superpowers/demo/seed-demo.mjs
```

It never touches the seeded `FICS` / `SE` / `SEED-A` data, so the check scripts still pass
afterwards. Deadlines are counted from the day of the run. To start over, drop the database,
start the API (it re-seeds), and run the script again.

## Accounts

Every demo account's password is `Demo2026!`. The administrator is the seeded
`admin@diploma.local` (password in `backend/DiplomaTracker.Api/Services/DbSeeder.cs`).

| Role | Name | Sign-in | What this account shows |
|---|---|---|---|
| Викладач | Петренко Олена Василівна | `o.petrenko@diploma.local` | Reviewer of ІП-21 (three submissions waiting). Supervises four students and a student proposal. Has one pending topic request (Олійник). Can see the ІП-11 archive. |
| Викладач | Коваленко Андрій Миколайович | `a.kovalenko@diploma.local` | Reviewer of ІП-22, the group that is behind: overdue steps and a late submission waiting. |
| Викладач | Шевчук Ірина Олегівна | `i.shevchuk@diploma.local` | Reviewer of ІС-21. |
| Студент ІП-21 | Бондаренко Максим | `m.bondarenko@student.diploma.local` | Approved topic; step 1 approved (95); step 2 waiting for review. |
| Студент ІП-21 | Ткаченко Анна | `a.tkachenko@student.diploma.local` | Own topic proposal, approved; step 1 approved (88). |
| Студент ІП-21 | Мельник Дмитро | `d.melnyk@student.diploma.local` | Approved topic; step 1 was returned with a comment, then approved; step 2 waiting. |
| Студент ІП-21 | Кравченко Софія | `s.kravchenko@student.diploma.local` | **Topic request rejected without a comment** (the "My topic" check). She has no topic, so the steps page shows "you can start once your topic is approved" instead of the submit form. |
| Студент ІП-21 | Олійник Владислав | `v.oliinyk@student.diploma.local` | Topic request pending (Петренко has to decide); nothing submitted yet. |
| Студент ІП-21 | Лисенко Катерина | `k.lysenko@student.diploma.local` | Furthest ahead: steps 1-2 approved (100, 92), step 3 waiting. |
| Студент ІП-22 | Савченко Артем | `a.savchenko@student.diploma.local` | Step 1 submitted late and approved (75): the late figure counts one step. |
| Студент ІП-22 | Руденко Юлія | `y.rudenko@student.diploma.local` | Step 1 **overdue**, nothing submitted. |
| Студент ІП-22 | Мороз Олександр | `o.moroz@student.diploma.local` | Step 1 submitted late, waiting for review. |
| Студент ІП-22 | Павленко Дарина | `d.pavlenko@student.diploma.local` | Step 1 overdue. |
| Студент ІС-21 | Гончаренко Богдан | `b.honcharenko@student.diploma.local` | Approved topic; step 1 approved (90). |
| Студент ІС-21 | Литвиненко Вікторія | `v.lytvynenko@student.diploma.local` | Approved topic; step 1 waiting. |
| Студент ІС-21 | Захарченко Ілля | `i.zakharchenko@student.diploma.local` | No topic yet: the topics page with *Reserve* offered. |

Last year's group, **ІП-11** (2025/2026), did its work and was then archived and deleted. Its
two students worked on their own approved proposals. Their accounts and proposals are gone, and their files are in the **Archive**.

A student can submit work only while holding an approved topic, so every student with submissions above has one.

## Walkthrough (phase 8 handoff §6)

**Administrator** (`admin@diploma.local`)
- Dashboard:
  - the topic-selection bar, open with its deadline;
  - three backlog tiles (waiting, waiting late, overdue);
  - the structure tiles, which link to their pages;
  - the group table: sort by clicking a column header, and click a row to open that group's matrix — try ІП-22;
  - the group-progress card.
- *Archive*: ІП-11, with its files grouped by student, step and version. Download a file, then *Purge* (the dialog names the file count).
- *Groups*: the delete dialog now says how many archived students' accounts would be deleted and how many files would be archived. On a group with active students it says it cannot be deleted. Cancel either way.
- *Steps*: pick ФІОТ, drag a row, and use the ↑/↓ arrows. The order is saved at once and rolled back if the save fails.
- *Review queue*: page controls, the group filter and the late filter.

**Teacher** (Петренко; Коваленко for overdue)
- Dashboard: waiting reviews and groups tiles (Петренко's groups tile now counts every group she
  reviews or supervises a student in — ІП-21 plus whichever other group holds one of her
  supervised students, not reviewed groups alone); the five latest submissions to review; overdue
  steps with days overdue (Коваленко) — *Overdue steps* lists a step nobody has submitted **or**
  one still `Returned` past its deadline, never a `Submitted` one; a **Waiting for review past the
  deadline** block for a `Submitted` step already past its deadline (the case *Overdue steps*
  deliberately excludes) — each row shows *Submitted late* only when the submission itself was
  late, otherwise "waiting N days past the deadline" for a submission that was on time and is only
  late because nobody has decided it yet; supervised students; the group breakdown (a group she
  only supervises a student in, not reviews, now counts just her own students, so the row agrees
  with her *Overdue steps* list and the group page's split); group progress. The *Your decision*
  tag on the Review tab only ever marks a step where the caller is the supervisor or an extra
  reviewer with an undecided seat — never a group reviewer's watch access, and never an
  administrator standing in to decide.
- Archive: ІП-11 without a purge button (Петренко).
- Steps: the list without drag handles.
- Review: return a submission with a comment, approve one with a mark.

**Student**
- Dashboard: topic card, progress summary and latest decision. Лисенко has the richest one; Савченко shows the late count.
- *My topic*:
  - Кравченко's rejection with no comment renders as a proper block, not a bare title;
  - Олійник's is pending.
- *My steps* (Кравченко): no submit form, just the message that work starts once the topic is approved.
- *Topics* (Захарченко, who has no topic): leave the page open past the selection deadline and *Reserve* disappears by itself. To see this quickly, move the deadline to a minute ahead on the administrator's *Settings* page.
- *Topics* (any student with an approved topic, e.g. Бондаренко): neither *Reserve* nor *Propose* is offered any more — a short note explains that only an administrator can change an approved topic now (`PUT /api/students/{id}/topic` is Admin-only; a supervisor cannot).

**Progress matrix** (any role that can see it): ІП-22 shows red *Overdue* badges for Руденко and Павленко, with the five-state legend under the table.

### Review panels

- Бондаренко Максим, step 2: Петренко (supervisor) approved with 90; Коваленко, an extra reviewer, still has to decide. *My work* shows "1 of 2 approved"; Коваленко finds it in the review queue.
- Мельник Дмитро, step 1: Петренко (extra) approved version 1, the supervisor Коваленко returned it, and version 2 completed the panel. The mark is the average, 87. Петренко's approval of version 1 still counted.
- Лисенко Катерина, step 2: approved by Коваленко (92) and Шевчук (89), mark 91. Step 3 waits for Петренко and Шевчук after Коваленко's approval ("1 of 3").
- A group's reviewer (for ІП-21, Петренко) sees the group's progress and every step page, and can add extra reviewers, but decides only where they sit on the panel. The group's **progress matrix** (not the plain student list further down the page, which still lists everyone unsplit) now splits into **My students** (Петренко's own supervised students, or any student whose step she sits on the panel for) and **Others** — the others still open read-only: no Approve/Return form and no *Your decision* tag. If a reviewer supervises nobody in the group and sits on no panel there, only the **Others** table shows — no empty *My students* table above it.

### Documents

- Петренко: *For signing* holds Бондаренко's topic application; the navigation shows a badge.
- Лисенко: *My documents* shows the assignment sheet **Completed**. Its history reads: sent to Коваленко for signing, passed to Петренко with the signed copy, marked done with the final version.
- Мельник: *My documents* shows the request sent back by Коваленко with the remark at the top.
- Шевчук: *For signing* holds the department minute, which came via Коваленко's review.
