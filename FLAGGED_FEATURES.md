# Flagged Features — Pending Data Requirements

> **Status:** FLAGGED — not implemented until source XLS provides required columns.
> **Checked on:** 2026-09-23 on `main` @ `66cdb28`
> **Files inspected:** `public/samples/sample-utilization.xls`, `public/samples/sample-registered.xls`, `LR PORTAL REGISTERED USER deped-school-id-125509-user-details-20260916.xls`, `LR PORTAL UTILIZATION user_count-zamboanga_sibugay-20260916.xls`

**Evidence command:**
```js
// node -e with XLSX.read
// Utilization header: ["SCHOOL ID","SCHOOL NAME","REGISTERED USERS","ACTUAL USERS","PARTICIPATION RATE","DOWNLOADS",""]
// Registered header: ["ID","LAST NAME","FIRST NAME","MIDDLE NAME","GENDER","STATUS","EMAIL","PORTAL ROLE","TOTAL DOWNLOADS","REGISTERED",""]
// hdr.includes("district") === false for all files
```

---

## 1. Teachers with monthly download (and number of downloads)

- **Ask:** Per-teacher `MONTH` + `DOWNLOADS` breakdown (e.g., teacher A = 12 downloads in Sep, 5 in Aug).
- **Current XLS:** `TOTAL DOWNLOADS` is single aggregate per teacher (`sample-registered.xls:9`), `REGISTERED` is account creation date, not download month. No `MONTH`, `DOWNLOAD_DATE`, `UPLOAD_COUNT` column exists. `src/App.tsx:216-235` can only show `totalUsers/active/totalDownloads` + `byRole/byGender`; monthly trend at `src/App.tsx:262-275` is synthetic from totals.
- **System now:** Shows total per teacher in Detailed Data table (`src/App.tsx:941-963`) + generic monthly `REGISTERED` trend (`src/App.tsx:325` `userRegTrend`), not true per-teacher monthly downloads.
- **Flag:** Cannot compute until LR Portal export adds a column like `MONTH` or `DOWNLOAD_DATE` or `DOWNLOADS_SEP_2026`. If available, implementation = group by `TEACHER + MONTH` and add `Teacher Monthly Downloads` bar/line view under User Analysis.

## 2. School with most downloads

- **Ask:** Rank schools by downloads.
- **Current XLS:** `DOWNLOADS` column exists in utilization file (499 rows), so answerable.
- **System now:** ✅ **DONE** — `src/App.tsx:243-250` `rankingData` + `src/App.tsx:565-585` Top 10 + `src/App.tsx:698-709` vertical bar chart, selectable metric (`DOWNLOADS | REGISTERED USERS | ACTUAL USERS | PARTICIPATION RATE`). No further data needed.

## 3. District with most downloads

- **Ask:** Rank districts by total downloads.
- **Current XLS:** No `DISTRICT` / `DIVISION` / `CLUSTER` column in any header (checked above). Cannot group.
- **System now:** ❌ **NOT IMPLEMENTED** — `detectType()` (`src/App.tsx:46-53`) and `calcSchoolKPIs()` (`src/App.tsx:101`) only handle school-level, no district aggregation. Charts at `src/App.tsx:565` and `699` are school-only.
- **Flag:** Needs source XLS to include `DISTRICT` (or a mapping file `school_id → district`). Once present, implementation = `Map<district, sum(DOWNLOADS)>` + `District Ranking` view (mirror of school ranking), ~20 lines in `src/App.tsx` + new `View="district"` tab.

## 4. Filter registered user with DepEd and non-DepEd account

- **Ask:** Toggle/list `DepEd` vs `Non-DepEd` accounts.
- **Current XLS:** No explicit `ACCOUNT TYPE` column. All 7 sample rows have `PORTAL ROLE="DepEd Personnel"` and `EMAIL=@deped.gov.ph`. So a filter would currently return only one group. `src/App.tsx:223` groups `byRole` only, not DepEd dichotomy.
- **System now:** ⚠️ **PARTIAL** — doable today by deriving: `isDepEd = EMAIL.endsWith("@deped.gov.ph") || PORTAL ROLE.includes("DepEd")`. Not yet wired as a filter UI.
- **Flag:** Implement as `DepEd / Non-DepEd / All` select under User Analysis once confirmed the rule with owner (is `@deped.gov.ph` authoritative, or does `PORTAL ROLE` have values like `"Non-DepEd"` / `"Guest"`?). ~10 lines: new state `depEdFilter` + `filtered` memo (`src/App.tsx:182`) predicate.

## 5. List of input/upload teacher vs portal enrollment

- **Ask:** Compare teachers who actually uploaded/input vs total portal enrollments (registered).
- **Current XLS:** Utilization gives school-level `REGISTERED USERS` vs `ACTUAL USERS` (counts, not teacher list). Registered gives teacher list with `TOTAL DOWNLOADS` but no `UPLOADS` / `INPUT_COUNT` column, and no `ENROLLMENT` flag. Closest proxy is `TOTAL DOWNLOADS > 0` = uploader, but not accurate to "input/upload". `src/App.tsx:111` `activeSchools = downloads>0` and `src/App.tsx:216` `activeUsers = STATUS=="active"` are related but not this comparison.
- **System now:** ❌ **NOT IMPLEMENTED** — no `Uploaded` vs `Enrolled` table. Dashboard KPIs (`src/App.tsx:519-523`) show registered vs actual at school level, not teacher upload list.
- **Flag:** Needs XLS to include `UPLOADS` or `INPUTS` per teacher, or confirmation that `TOTAL DOWNLOADS>0` should be treated as "uploaded". Implementation = new `Upload vs Enrollment` table in User/Data view: `enrolled = all rows`, `withUpload = rows.filter(toNumber(TOTAL DOWNLOADS)>0 || toNumber(UPLOADS)>0)`, listing names + counts.

---

## Next Steps (when data available)

1. Provide one XLS sample that includes `DISTRICT`, `MONTH`/`DOWNLOAD_DATE`, `ACCOUNT TYPE` or `UPLOADS` if the portal can export them, or confirm derived rules:
   - District from school mapping?
   - Month from which column?
   - DepEd = email domain vs role?
   - Upload = downloads>0 vs separate column?
2. File will be added to `.gitignore` pattern `LR PORTAL*.xls` already (so keep private) — share private sample via same naming, will parse generically (`src/App.tsx:54-82` `parseWorkbook` handles any header).
3. Once confirmed, flagged items will be moved to `update.md` MUST HAVE and implemented in a single commit.

## References

- Audit: `src/App.tsx:46,101,182,216,243,262,325,565,699,941`
- Build: `vite.config.ts:11`, `package.json:8` (`tsc -b && vite build`)
- Ignored private data: `.gitignore:26` `LR PORTAL*.xls`
