# Approval needed: dropping the local database (phase 8, task 19)

Read this, then answer the question in the chat. Nothing happens until you do.

## What I am asking for

Permission to run, on **this machine only**:

```
dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development
```

then delete `backend/DiplomaTracker.Api/Migrations/`, regenerate the single `InitialCreate`
migration, and start the API so it recreates the schema and re-seeds.

## Why it is necessary

Three tasks in this phase changed the database schema:

| Task | Change |
|---|---|
| 4 | `StudentProfile.StudentNumberCanonical` — a new column, and the uniqueness moves onto it |
| 6 | `ArchivedGroups`, `ArchivedGroupReviewers`, `ArchivedFiles` — three new tables |
| 7 | `DocumentTemplate.RowVersion` — a new concurrency column |

This project keeps **exactly one migration**, `InitialCreate`, regenerated whenever the schema
changes, because nothing is deployed. `Migrations/` has deliberately not been touched since task 4,
which is why the API has not been startable for the whole of this session — that is expected and
planned, not a fault.

Regenerating it gives the migration a new id. SQL Server's `__EFMigrationsHistory` in
`DiplomaTrackerDb` still records the old one, so the API would try to create `Faculties` a second
time and fail on startup. The database has to go.

## What you lose

Everything currently in `DiplomaTrackerDb` on this machine.

**Recreated automatically by the seeder on the next start:**

- the three accounts `admin@diploma.local`, `teacher@diploma.local`, `student@diploma.local`
- faculty `FICS`, department `SE`, group `SEED-A`
- the eight step templates
- the seeded student, number `SEED-0001`

**Not recreated — gone for good:**

- any group, student, topic, reservation, submission, uploaded file record or document template
  you created by hand while testing phases 1-6
- anything an earlier check-script run left behind
- any password you changed away from the seeded ones

Uploaded **files on disk** under `backend/DiplomaTracker.Api/App_Data/uploads` are not deleted by
this, but the rows pointing at them are, so they become orphans. Say the word and I will clear that
folder too; I will not touch it otherwise.

## The other machine

`C:\GIT\diploma_tracker` will hit the same wall the first time it pulls this branch and starts the
API. It has to run the same `dotnet ef database drop --force` once. I will put this in the task 19
report and in `PROJECT_MEMORY.md` so it is not a surprise.

## What this does not touch

- No git history is rewritten. Nothing is pushed. Nothing is merged.
- No remote or shared database exists in this project — `DiplomaTrackerDb` is local to this PC.
- Your working tree is untouched by the drop itself.

## If you say no

Task 19 cannot complete, and neither can task 17's steps 4-5, because both need a running API.
I would stop there and write a handoff covering tasks 1-17, with the database drop left as the
first thing the next session does. The code would still be finished and verified as far as a
compiler and a type-checker can verify it — but no end-to-end check script and no browser
walkthrough would have run.
