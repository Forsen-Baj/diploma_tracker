# Prompt: design phase 8 — Hardening and polish

Paste the block below into a new session to run `superpowers:brainstorming` for phase 8. Phase 8
is built **after phase 6**; this prompt produces its design document and then its plan.

---

> Use `superpowers:brainstorming` to design phase 8 "Hardening and polish" of the Diploma
> Tracker, then `superpowers:writing-plans` for its implementation plan. First read
> `docs/superpowers/PROJECT_MEMORY.md` in full and follow it (how work is run, agent presets,
> environment, gotchas, decisions not to reopen), then the system design
> `docs/superpowers/specs/2026-09-15-diploma-tracker-system-design.md` and every increment
> design in `docs/superpowers/specs/` that the items below touch. Ask me every decision with
> clickable options; write drafts to their files and ask me to review the file, never a preview.
> The design must read as a description of the system as a designed whole, not as a list of
> fixes to earlier code. Save it as `docs/superpowers/specs/<date>-hardening-and-polish-design.md`
> and the plan as `docs/superpowers/plans/<date>-hardening-and-polish.md`, commit each on the
> working branch as one bare title line, then stop.
>
> The scope below was settled by the owner on 2026-09-19. Do not add to it or reopen it; where
> an item says "ask", ask. If the phase grows too large for one plan, propose a split into
> 8a/8b before writing the plan.
>
> **Security and access**
> 1. **Security logging.** Define which events are logged (sign-in success and failure, access
>    refusals, password changes and resets, archiving and deactivation, administrator actions,
>    file downloads — upload decisions and downloads are already logged by the workflow
>    service), the fields each carries (ids, never passwords, tokens or file contents), and the
>    level. Ask me whether a stored, administrator-visible audit trail is wanted or structured
>    log lines are enough.
> 2. **Administrator password length.** Administrators may today set an 8-character password
>    for themselves. Give administrators a stronger minimum; ask me the number.
> 3. **Sign-in state checked on every request.** A token must stop working at once — 401 — when
>    its user is archived or deactivated, instead of staying valid for up to 60 minutes. Keep
>    it simple: one per-request check of the user's state, no token revocation lists. A
>    deactivated user whose access is reset (`ClaimReopened`) must re-claim the account first
>    and can sign in only after that; design the whole path end to end.
> 4. **Upload container validation.** Today the content check is four bytes of ZIP magic, so a
>    `.jar` passes as a `.docx`. Open the stream as a `ZipArchive`, require
>    `[Content_Types].xml` plus a `word/` (docx) or `ppt/` (pptx) part, and cap entry count and
>    compression ratio so the check is not itself a zip-bomb target. Owner's condition: only if
>    it stays simple — say so if it does not. The submission design's §5 must stop implying the
>    supporting-file blocklist covers a disguised `.jar`.
> 5. **Existence oracles.** `studentTask.notFound` vs `studentTask.notYours` (and the submission
>    pair) reveal whether an id exists. Make a foreign resource answer exactly like a missing
>    one — the file endpoint already does — and amend the submission design's §7, which
>    currently mandates both codes.
>
> **Features and UX**
> 6. **Step template reordering.** Drag-and-drop reordering of step templates per faculty on the
>    Steps page. `Order` is unique per faculty and an update already shifts neighbours; design
>    the reorder operation (one request for the new order, atomic) and its keyboard alternative.
> 7. **Archive of orphaned uploads.** When a group is deleted its submitted files stay on disk
>    with nothing pointing at them. The owner wants an archive an administrator can manage, and
>    has **not yet pictured it** — interview me before proposing anything. Start from: what
>    sends files to the archive (group deletion only, or also student archiving, a removed
>    step, a replaced version); what is kept with them (student, group, step, version, mark,
>    decision); who can see it; how it is browsed (by academic year, group, student); single
>    download or a zip per group; whether anything can be restored; retention and purge rules;
>    disk-usage visibility.
> 8. **Topic page, two gaps.** A topic rejection carrying no comment shows the student nothing
>    on *My topic* (the block is tied to the comment). A page left open across the global
>    selection deadline keeps offering reserve/cancel until something re-renders
>    (`selectionClosedRaw` is computed only at render); the API refuses regardless.
> 9. **Dashboards to spec §8.** The student dashboard should show the most recent decision; the
>    teacher dashboard should show the progress of visible groups, not only their count.
> 10. **Late count.** The *Late submissions* figure counts versions (two late versions of one
>     step count twice). Change it to count late steps, and rename the label to match; amend
>     the submission design accordingly.
>
> **Performance**
> 11. `IsSelectionOpenAsync` re-reads `PlatformSettings` on every call.
> 12. `TopicService` repeats five identical correlated subqueries per topic row.
> 13. List reads use `Include` rather than projecting to DTOs in the query (`GroupService`,
>     `DepartmentService`).
> 14. The review queue is unpaginated — an administrator receives every undecided submission.
>     Design paging (and the queue page's controls) for a real cohort.
>
> **Data**
> 15. A student's topic lives in two places — `StudentProfile.TopicId` and the `Approved`
>     reservation — which can drift. Choose one source of truth.
> 16. When a new faculty collides with two different existing faculties at once (one on name,
>     one on short name), the 409 message may name the short name rather than the name.
> 17. Student-number normalisation keeps internal spaces and does not fold Latin/Cyrillic
>     lookalikes (`KB123` vs `КВ123`), so a duplicate student can be created. Define the
>     canonical form and how existing numbers migrate.
> 18. A group whose students are all archived cannot be deleted, because archived students
>     still point at it. Decide where they go (ties into item 7).
>
> **Repository**
> 19. **Check-script cleanup.** The check scripts leave about 15 unarchived test students per
>     full run (and `RF Step …` step templates) in the seeded group `SEED-A`, crowding the
>     progress matrix. Every script must leave the seeded data as it found it.
> 20. **`.gitattributes`.** Pin line endings so editing tools stop flipping files between CRLF
>     and LF. Four files are genuinely CRLF in history (`Services/GroupService.cs`,
>     `Services/GroupTaskService.cs`, `DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs`,
>     `Migrations/AppDbContextModelSnapshot.cs`) and `test-backlog.md` is mixed; decide the
>     target and do the renormalisation as its own commit.
>
> **Out of scope (owner's decision, 2026-09-19):** rate limiting stays built and switched off;
> identity proof during registration stays as is; faculties and departments stay readable by
> any signed-in user; the phase 5 walkthrough notes are dropped; the accessibility pass stays
> parked pending the owner's consultation.
