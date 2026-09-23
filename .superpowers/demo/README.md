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
- Dashboard: waiting reviews and groups tiles; the five latest submissions to review; overdue steps with days overdue (Коваленко); supervised students; the group breakdown; group progress.
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

**Progress matrix** (any role that can see it): ІП-22 shows red *Overdue* badges for Руденко and Павленко, with the five-state legend under the table.
