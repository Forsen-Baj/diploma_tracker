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
| Викладач (ІПЗ), керівник напряму (ІПЗ) | Петренко Олена Василівна | `o.petrenko@diploma.local` | Supervises four students and a student proposal; has one pending topic request (Олійник); reads the ІП-11 archive; manages the three ІПЗ directions (switch to *Керівник напряму* in the user menu to approve their topic requests and to sit on their students' panels). |
| Викладач (ФІОТ) | Коваленко Андрій Миколайович | `a.kovalenko@diploma.local` | Supervises the ІП-22 students who are behind: overdue steps and a late submission waiting; extra reviewer on Бондаренко's step 2. |
| Викладач (ФІОТ), керівник напряму (ІСТ) | Шевчук Ірина Олегівна | `i.shevchuk@diploma.local` | Supervises ІС-21; extra reviewer in ІП-21; manages the ІСТ direction. |
| Нормоконтролер (ІП-21) | Гриценко Наталія Павлівна | `n.hrytsenko@diploma.local` | Standards controller of ІП-21's first two steps; approves without a mark, from the review queue. |
| Студент ІП-21 | Бондаренко Максим | `m.bondarenko@student.diploma.local` | Approved topic; step 1 approved (95); step 2 waiting for review. |
| Студент ІП-21 | Ткаченко Анна | `a.tkachenko@student.diploma.local` | Own topic proposal, approved; step 1 approved (88). |
| Студент ІП-21 | Мельник Дмитро | `d.melnyk@student.diploma.local` | Approved topic; step 1 was returned with a comment, then approved; step 2 waiting. |
| Студент ІП-21 | Кравченко Софія | `s.kravchenko@student.diploma.local` | **Topic request rejected without a comment** (the "My topic" check). She has no topic, so the steps page shows "you can start once your topic is approved" instead of the submit form. |
| Студент ІП-21 | Олійник Владислав | `v.oliinyk@student.diploma.local` | Topic request waiting for the administration: Петренко created the topic and manages its direction, so two of three approvals are in. |
| Студент ІП-21 | Лисенко Катерина | `k.lysenko@student.diploma.local` | Furthest ahead: steps 1-2 approved (100, 92), step 3 waiting. |
| Студент ІП-22 | Савченко Артем | `a.savchenko@student.diploma.local` | Step 1 submitted late and approved (75): the late figure counts one step. |
| Студент ІП-22 | Руденко Юлія | `y.rudenko@student.diploma.local` | Step 1 **overdue**, nothing submitted. Topic request **returned for changes** by the direction manager: *Edit and resubmit* on the topics page. |
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
- Dashboard: waiting reviews and groups tiles (Петренко's groups tile now counts every group of the
  students she works with as a teacher); the five latest submissions to review; overdue
  steps with days overdue (Коваленко) — *Overdue steps* lists a step nobody has submitted **or**
  one still `Returned` past its deadline, never a `Submitted` one; a **Waiting for review past the
  deadline** block for a `Submitted` step already past its deadline (the case *Overdue steps*
  deliberately excludes) — each row shows *Submitted late* only when the submission itself was
  late, otherwise "waiting N days past the deadline" for a submission that was on time and is only
  late because nobody has decided it yet; supervised students; the group breakdown (a group she
  only supervises a student in, not reviews, now counts just her own students, so the row agrees
  with her *Overdue steps* list and the group page's split); group progress. The *Your decision*
  tag on the Review tab only ever marks a step where the caller is the supervisor or an extra
  reviewer with an undecided seat — never an administrator standing in to decide.
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

- Бондаренко Максим, step 2: Петренко approved with 90 — she supervises the topic and manages its direction, so she holds one seat, as supervisor. Коваленко (extra reviewer) and Гриценко (standards control) still have to decide. *My work* shows "1 of 3 approved"; both find it in their review queues.
- Мельник Дмитро, step 1: Шевчук (extra) approved version 1 with 88 and the supervisor Коваленко returned it. On version 2 Петренко (direction manager) approved with 87, Гриценко (standards control) approved without a mark, and Коваленко's 85 completed the panel. The mark is the average of the three marks, 87. Шевчук's approval of version 1 still counted. Step 2 waits for all three seats ("0 of 3").
- Лисенко Катерина, step 2: approved by Коваленко (92), Петренко as direction manager (94), Шевчук as extra reviewer (89) and Гриценко (standards control, no mark); the mark is 92. Step 3 is not under standards control and waits for Петренко (direction manager) and Шевчук after Коваленко's approval ("1 of 3").
- A group's **progress matrix** splits into **My students** (the students the caller works with in the role they act in) and **Others**, which never open. Acting as teacher, Петренко's are the students she supervises; acting as direction manager, the students whose topic is in one of her directions.

### Documents

- Петренко: *For signing* holds Бондаренко's topic application; the navigation shows a badge.
- Лисенко: *My documents* shows the assignment sheet **Completed**. Its history reads: sent to Коваленко for signing, passed to Петренко with the signed copy, marked done with the final version.
- Мельник: *My documents* shows the request sent back by Коваленко with the remark at the top.
- Шевчук: *For signing* holds the department minute, which came via Коваленко's review.

## Walkthrough (phase 11)

- **Administrator:**
  - *Topics → Directions*: four directions with their managers and topic counts.
  - *Topics*: Олійник's request waits for the administration seat; approve it and the student has a topic.
  - *Steps → Group steps → ФІОТ → ІП-21*: Гриценко controls steps 1–2. Change or remove the controller on step 3.
  - *Staff*: each person's roles; open one to add or remove a role.
- **Петренко:**
  - *Directions*: her three directions; publish a topic for Коваленко.
  - *My topics*: requests in her directions with the three seats.
  - Her review queue includes Лисенко's and Мельник's steps as direction manager.
- **Гриценко:** the review queue lists Бондаренко's and Мельник's step 2; approve without a mark.
- **Руденко:** the topics page shows the return comment; *Edit and resubmit* sends it back to all three approvers.
- **Any student with a topic:** *My topic* shows the three approvals and the history.

## Walkthrough (phase 12)

- **Administrator:**
  - *Staff*: Петренко holds two roles in ІПЗ, Коваленко one for the whole ФІОТ, Гриценко one for ІП-21 only.
  - Open Шевчук and try to remove her *Керівник напряму* role: refused, with the ІСТ direction listed. Add Коваленко as *Нормоконтролер* for ІП-22 and remove it again.
  - *Groups*: no *Reviewers* section any more.
- **Петренко:** the user menu reads *Викладач*; switch to *Керівник напряму* — the tabs become Dashboard, Review, Groups, Directions, Documents, and the review queue lists the direction-manager seats (Лисенко, Мельник). Switch back.
- **Гриценко:** only Dashboard, Review, Groups and Documents; the Groups tab shows ІП-21, where no student opens in full.
- **Коваленко:** *Archive* is empty (ІП-11's students were Петренко's).
