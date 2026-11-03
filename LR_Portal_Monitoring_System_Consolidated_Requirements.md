# LR Portal Monitoring System
## Consolidated Requirements and Implementation Guide

**Document purpose:** Consolidate two newly provided operational instructions into one implementation-ready specification for the existing LR Portal monitoring system.

**Scope:**  
- **Module 1:** School Download Monitoring and Quarterly Comparison  
- **Module 2:** Registered Member Monitoring, Transfer Tracking, and Individual Download Comparison

**Reference exports supplied:**
1. `user_count-zamboanga_sibugay-20261031.xls`
2. `deped-school-id-125509-user-details-20261031(1).xls`

**Baseline reference date:** October 31, 2026 (confirm the actual reporting period before importing).

---

# 1. Executive Summary

The LR Portal Monitoring System is intended to help administrators monitor LR Portal usage at both the **school level** and the **individual registered-member level**.

Administrators periodically export reports from the LR Portal and upload the Excel files into the existing system. The system validates each upload, stores it as a dated reporting snapshot, and compares it with the appropriate previous snapshot.

The system must answer two central questions:

1. **School-level:** How have downloads per school changed since the previous reporting period?
2. **Member-level:** Which members are new, missing, potentially duplicated, transferred to another school or district, or have changed their individual download activity?

The system must preserve historical uploads. A new upload must never silently overwrite the previous reporting snapshot.

## 1.1 Objectives

- Reduce manual comparison of LR Portal Excel exports.
- Identify increases and decreases in school downloads.
- Identify new, existing, missing, and potentially duplicate member accounts.
- Help administrators locate teachers who have updated their school or district.
- Compare individual member download counts across reporting periods.
- Flag accounts using email addresses that do not meet the configured DepEd email policy.
- Produce searchable, filterable, printable, and downloadable reports.
- Maintain an auditable history of uploads, comparisons, and verified changes.

## 1.2 Intended users

- System administrator
- Division or district monitoring personnel
- Authorized school-level personnel
- Report viewers, where access is permitted

Access to member personal information must be limited according to the user's assigned role and administrative scope.

---

# 2. System Structure

The application should contain two connected modules with shared upload, history, search, and reporting capabilities.

## 2.1 Module 1 — School Download Monitoring

Tracks the total downloads recorded for each school in each LR Portal export.

Main functions:
- Upload school-level Excel exports.
- Validate school records and required columns.
- Match schools using School ID.
- Compare current downloads with the previous reporting snapshot.
- Identify increased, decreased, and unchanged download counts.
- Identify newly appearing and missing school records.
- Display school, district, and division summaries where the source data supports them.
- Retain quarterly history and generate reports.

## 2.2 Module 2 — Registered Member Monitoring

Tracks individual LR Portal member accounts and their activity.

Main functions:
- Upload registered-member Excel exports.
- Compare member records across reporting periods.
- Identify new, existing, and missing members.
- Detect potential duplicate accounts.
- Find a member by name, email, or LR Portal member ID.
- Track changes in a member's school and district when source data is available.
- Compare individual download counts.
- Flag non-DepEd email addresses.
- Retain member snapshots and transfer history.
- Generate member and download reports.

## 2.3 Shared capabilities

Both modules should use:
- Upload history and file validation
- Reporting-period management
- Snapshot storage
- Comparison engine
- Search and filters
- Role-based access
- Audit logs
- Export to Excel and PDF
- Clear error and validation messages

---

# 3. Reference Excel Files and Data Mapping

The following structures were observed in the two supplied sample exports. The system should validate the actual headers in every uploaded file rather than assuming every future export will be identical.

## 3.1 File 1 — School-level export

**Sample filename:** `user_count-zamboanga_sibugay-20261031.xls`

Observed sample structure:
- Worksheet: `LR Portal Data`
- 498 school records, excluding the header
- 6 columns

| Source column | Meaning | System use |
|---|---|---|
| SCHOOL ID | Unique school identifier | Primary school matching key |
| SCHOOL NAME | School name | Display and search |
| REGISTERED USERS | Registered users attributed to the school | School-level metric |
| ACTUAL USERS | Actual users attributed to the school | School-level metric |
| PARTICIPATION RATE | Participation percentage | School-level metric |
| DOWNLOADS | Recorded school downloads | Main comparison metric |

**Primary comparison key:** `SCHOOL ID`

The system should not match schools using school name alone because names can change, be abbreviated, or be entered inconsistently.

## 3.2 File 2 — Registered-member export

**Sample filename:** `deped-school-id-125509-user-details-20261031(1).xls`

Observed sample structure:
- Worksheet: `LR Portal Data`
- 7 member records, excluding the header
- 10 columns

| Source column | Meaning | System use |
|---|---|---|
| ID | LR Portal member/account identifier | Primary member matching key |
| LAST NAME | Member surname | Display and search |
| FIRST NAME | Member first name | Display and search |
| MIDDLE NAME | Member middle name | Display and search |
| GENDER | Member gender | Display only if necessary and authorized |
| STATUS | Account status | Account monitoring |
| EMAIL | Registered email address | Search and email-policy validation |
| PORTAL ROLE | Member role | Role-based reporting/filtering |
| TOTAL DOWNLOADS | Member's recorded downloads | Main individual comparison metric |
| REGISTERED | Registration date/time | Registration reporting |

**Primary comparison key:** `ID`

Secondary matching signals:
- Exact email address
- Normalized full name, used only to identify possible duplicates for manual review

Do not automatically merge or declare two accounts to be the same person based only on a matching name.

## 3.3 Important source-data limitation

The supplied member export does **not** include a school name, School ID, district, or division field.

Therefore:
- Member account comparison can be performed using the current member export.
- Individual download comparison can be performed using `TOTAL DOWNLOADS`.
- School and district transfer detection cannot be reliably completed from this member file alone.
- To implement transfer tracking, obtain a member export containing school/district assignment fields, another authoritative LR Portal report, or an approved administrator-maintained assignment source.
- Do not infer a teacher's current school from the filename or from a separate school-level aggregate export.

The system should display a clear message when transfer fields are unavailable.

---

# 4. Upload and Reporting-Period Workflow

## 4.1 First upload — Establish the baseline

For each module, the first valid upload establishes its initial baseline.

Suggested initial process:
1. Open the appropriate module.
2. Select the exported Excel file.
3. Select or confirm the reporting date/period.
4. Validate the file structure and records.
5. Review the import preview and validation warnings.
6. Confirm the import.
7. Save the file as a historical snapshot.

For the supplied sample files, October 31, 2026 may be used as the reference export date, subject to confirmation.

The first upload should not display an increase or decrease because there is no earlier snapshot to compare against. It should display baseline values.

## 4.2 Subsequent quarterly uploads

For every later reporting period:
1. Export the latest report from the LR Portal.
2. Open the relevant system module.
3. Upload the new Excel export.
4. Select the reporting date or quarter.
5. Validate the file and inspect the preview.
6. Select the correct previous snapshot for comparison.
7. Run the comparison.
8. Review warnings and differences.
9. Confirm and save the new snapshot and comparison result.
10. View, print, or export the report.

Example schedule (adjust to the organization's actual reporting calendar):

| Reporting snapshot | Example export date |
|---|---|
| Baseline | October 31, 2026 |
| Next snapshot | January 31, 2027 |
| Next snapshot | April 30, 2027 |
| Next snapshot | July 31, 2027 |
| Next snapshot | October 31, 2027 |

The system should allow an administrator to select the actual reporting period rather than hard-code these dates.

## 4.3 Upload safeguards

- Detect an identical file or repeated upload for the same reporting period.
- Warn before importing a duplicate snapshot.
- Do not double-count records or downloads because a file was uploaded twice.
- Allow an authorized administrator to cancel an upload before committing it.
- Preserve the original file name, upload time, uploader, reporting period, and import result.
- Do not overwrite an earlier snapshot when a corrected file is uploaded. Record the correction and its reason.
- Provide a preview of accepted, rejected, and warning-level records before final import.

---

# 5. Module 1 — School Download Monitoring Requirements

## 5.1 School comparison

For each school matched by `SCHOOL ID`, compare the current `DOWNLOADS` value with the selected previous snapshot.

**Formula:**

`Download Difference = Current Downloads - Previous Downloads`

Interpretation:
- Positive result: downloads increased.
- Negative result: downloads decreased.
- Zero: no change.

Example (illustrative values only):

| School | Previous downloads | Current downloads | Difference |
|---|---:|---:|---:|
| Alegria ES | 52 | 70 | +18 |
| Alicia Central ES | 80 | 95 | +15 |
| Bella ES | 27 | 20 | -7 |
| Calades ES | 2,470 | 2,600 | +130 |

The example current values are fictional and are not results from a later LR Portal export.

## 5.2 School comparison categories

- **Increased:** Current downloads are greater than previous downloads.
- **Decreased:** Current downloads are lower than previous downloads.
- **No change:** Current downloads equal previous downloads.
- **New school record:** School ID exists in the current snapshot but not the previous snapshot.
- **Missing school record:** School ID exists in the previous snapshot but not the current snapshot.
- **Invalid/unmatched:** Record cannot be reliably matched or has an invalid School ID.

A missing record must not automatically be interpreted as a closed school. It may reflect a change in export scope, missing data, or a data-quality issue.

## 5.3 School dashboard

Recommended indicators:
- Total schools in the selected snapshot
- Total downloads
- Total registered users
- Total actual users
- Schools with increased downloads
- Schools with decreased downloads
- Schools with no change
- New school records
- Missing school records

Recommended table columns:
- School ID
- School name
- Previous downloads
- Current downloads
- Difference
- Percentage change, where meaningful
- Comparison status

Percentage change formula:

`Percentage Change = (Difference / Previous Downloads) × 100`

If previous downloads are zero, show `N/A` rather than dividing by zero. If both values are zero, the system may show 0% or “No change,” provided the convention is consistent.

## 5.4 School filters and reports

Allow filtering by available source fields, such as:
- School ID
- School name
- District
- Division
- Increase/decrease/no change
- Reporting period

District and division filters must only be shown when the data source provides a reliable school-to-district/division mapping.

---

# 6. Module 2 — Registered Member Monitoring Requirements

## 6.1 Member comparison

Match member records primarily using the LR Portal `ID`.

For each upload, classify records as:

| Category | Rule |
|---|---|
| New member | Member ID is present in current snapshot but not previous snapshot |
| Existing member | Member ID appears in both snapshots |
| Missing member | Member ID appears in previous snapshot but not current snapshot |
| Potential duplicate | Two or more records have suspiciously matching identity details |
| Updated profile | A matched member's profile fields changed |
| Status changed | A matched member's account status changed |

A missing member only means the account is absent from the uploaded file. It does not prove that the person left DepEd, transferred, or deleted their account.

## 6.2 Duplicate-account detection

Use a cautious duplicate-detection process.

**Recommended checks, in order:**
1. Duplicate `ID` within the same uploaded file — treat as a data-integrity error requiring review.
2. Same normalized email used by multiple member IDs — flag as a potential duplicate or shared-email issue.
3. Same normalized full name associated with multiple member IDs — flag for manual review.
4. Similar names with different emails — optionally flag as a lower-confidence possible match.

Normalization may include trimming spaces, standardizing letter case, and removing accidental repeated whitespace. Do not discard meaningful name characters.

Each potential duplicate should show:
- Member IDs
- Full names
- Email addresses
- Account statuses
- Registration dates
- Matching reason
- Review status

Suggested review statuses:
- Pending review
- Confirmed duplicate
- Not a duplicate
- Resolved/merged outside the monitoring system

The monitoring system should not merge or delete LR Portal accounts unless a separate authorized workflow explicitly supports that action.

## 6.3 Find a teacher/member

Provide a global **Find Member** feature.

Search fields:
- LR Portal member ID
- First name
- Last name
- Middle name
- Full name
- Email address

Search results should show:
- Member ID
- Full name
- Email
- Account status
- Portal role
- Registration date
- Latest known school and district, if available
- Latest download count
- Last reporting snapshot in which the member appeared

A result should open a member detail page containing profile changes, download history, and school-assignment history where supported by source data.

## 6.4 Teacher school/district transfer tracking

The system should detect a transfer when the same member ID appears in consecutive snapshots with a changed school or district assignment.

Required source fields:
- Member ID
- School ID or another stable school identifier
- School name
- District identifier or name
- Effective date or profile update date, if available

Recommended transfer record:

| Field | Description |
|---|---|
| Member ID | Stable member identifier |
| Member name | Member's full name |
| Previous school | Earlier assignment |
| Previous district | Earlier district |
| Current school | New assignment |
| Current district | New district |
| Detected period | Snapshot where the change was detected |
| Profile update date | Source-provided date, if available |
| Verification status | Pending, verified, or rejected |
| Notes | Administrator's explanation |

Transfer workflow:
1. Import the latest member export or assignment source.
2. Match the member using LR Portal ID.
3. Compare the previous and current school/district fields.
4. If the assignment differs, create a transfer-change event.
5. Display the previous and current assignment.
6. Allow authorized personnel to verify the change.
7. Preserve both the previous and current assignment in history.

Do not overwrite the old assignment without preserving it in history.

**If school/district fields are missing:** Show “Transfer information unavailable in this export.” Do not guess a destination school.

## 6.5 Individual download comparison

Compare each matched member's `TOTAL DOWNLOADS` value across snapshots.

**Formula:**

`Member Download Difference = Current Total Downloads - Previous Total Downloads`

Example (illustrative values only):

| Member | Previous downloads | Current downloads | Difference |
|---|---:|---:|---:|
| Member A | 19 | 35 | +16 |
| Member B | 29 | 29 | 0 |
| Member C | 0 | 15 | +15 |
| Member D | 2 | 1 | -1 |

The actual report should use member names and IDs from the uploaded data, subject to access permissions.

Display:
- Increased downloads
- Decreased downloads
- No change
- Zero downloads
- Top download counts
- Total member downloads for the snapshot

**Critical interpretation check:** Confirm whether `TOTAL DOWNLOADS` is cumulative or period-specific.

- If cumulative, subtracting the previous snapshot from the current snapshot estimates downloads added between exports.
- If period-specific, compare the period totals directly; do not describe the difference as newly accumulated downloads.
- If the source changes its counting method, flag the comparison as potentially invalid.

## 6.6 DepEd email validation

The system should check each member's `EMAIL` against an administrator-configured email policy.

For example, if the approved domain is `deped.gov.ph`, an address ending in that domain may be classified as matching the configured domain policy.

Recommended classifications:
- **DepEd-domain match:** Address matches an approved domain.
- **Non-DepEd domain:** Address does not match an approved domain.
- **Invalid/missing email:** Address is blank or fails basic email-format validation.
- **Needs verification:** Domain or address requires manual review.

Requirements:
- Store approved email domains in system settings.
- Support more than one approved domain if the organization authorizes them.
- Compare domains case-insensitively.
- Trim accidental spaces.
- Do not treat a display name or text containing “deped” as proof of an official email.
- Flag non-approved domains without automatically deleting or deactivating the member.
- Allow an authorized administrator to mark an account as reviewed and record a note.

Suggested warning:

> Non-DepEd email detected. This member is registered using an email address outside the configured approved DepEd domains. Please verify the account and advise the member if an update is required.

**Scope limitation:** If the system only imports LR Portal exports, it can detect and report non-DepEd email addresses. It cannot prevent registration on the LR Portal unless it is integrated with, or controls, the registration process.

---

# 7. Comparison Engine and Data Rules

## 7.1 Snapshot-based comparison

Every successful upload should create an immutable snapshot containing:
- Snapshot ID
- Module/source type
- Original file name
- Reporting period
- Export date, if known
- Upload timestamp
- Uploader account
- Record count
- Validation summary
- Import status
- File checksum or equivalent duplicate-file identifier, where feasible

Comparison records should reference the two snapshots being compared.

## 7.2 Comparison selection

The system should:
- Default to the immediately preceding valid snapshot for the same module and reporting scope.
- Allow authorized users to select another previous snapshot.
- Prevent comparisons across incompatible data scopes without a warning.
- Show both snapshot dates clearly.
- Preserve old comparison results when later files are uploaded.

For example, a district-specific member export should not be compared against a division-wide export without a clear scope warning.

## 7.3 Missing and new records

For every comparison:
- List new records.
- List missing records.
- List matched records.
- List changed fields.
- Identify invalid or unmatched records.
- Explain that missing records may result from export scope or data-quality differences.

## 7.4 Data validation

Validate:
- Required worksheet and column headers
- Required identifiers
- Duplicate IDs within a file
- Blank or malformed identifiers
- Numeric download values
- Negative download values
- Valid email format
- Date formats
- Unexpected or renamed columns
- Empty files and files with no usable records

The import preview should distinguish:
- Accepted records
- Rejected records
- Warnings requiring review

Do not silently convert invalid values to zero. Preserve the source value in the validation log and require correction or an explicit approved handling rule.

---

# 8. Recommended User Interface

## 8.1 Main navigation

Suggested navigation structure:

1. Dashboard
2. School Download Monitoring
   - Upload School Export
   - School Comparison
   - School History
3. Registered Member Monitoring
   - Upload Member Export
   - Member Comparison
   - Find a Member
   - Duplicate Accounts
   - Transfer History
   - Individual Download Monitoring
   - Email Validation
4. Reports
5. Upload History
6. Audit Logs
7. Settings

## 8.2 Dashboard

Show separate school-level and member-level summaries.

**School summary:**
- Schools monitored
- Total downloads
- Increased/decreased/no-change schools
- New/missing school records

**Member summary:**
- Registered members in latest snapshot
- New/missing members
- Potential duplicate accounts
- Members with changed profiles
- Verified/pending transfers
- Non-DepEd email accounts
- Individual download changes

Every dashboard figure should identify the snapshot or comparison period it represents.

## 8.3 Tables and status indicators

Tables should support:
- Search
- Sorting
- Pagination
- Filters
- Export
- Clear status labels

Use status labels consistently:
- Increased
- Decreased
- No change
- New
- Missing
- Existing
- Potential duplicate
- Transfer detected
- Pending verification
- Verified
- Non-DepEd email

Provide a text label as well as color so that the meaning is not dependent on color alone.

---

# 9. Reports and Exports

## 9.1 School reports

Recommended reports:
- Quarterly school download comparison
- Schools with increased downloads
- Schools with decreased downloads
- Schools with no change
- New and missing school records
- School download history

## 9.2 Member reports

Recommended reports:
- Registered-member comparison
- New and missing members
- Potential duplicate accounts
- Member profile changes
- Teacher transfer history
- Individual download comparison
- Non-DepEd email accounts
- Zero-download members

## 9.3 Report information

Each report should include:
- Report title
- Reporting period
- Previous and current snapshot dates
- Date generated
- Filters applied
- Total records
- Summary counts
- Detailed comparison table
- Notes about missing or unavailable source fields

Reports should be printable and exportable to Excel and PDF, subject to the user's permissions.

---

# 10. Security, Privacy, and Auditability

Member exports contain personal information. Apply appropriate safeguards.

Requirements:
- Role-based access control
- Limit access to member email addresses and personal details
- Restrict district/school users to their authorized scope
- Protect uploaded files and stored snapshots
- Use secure authentication and authorization
- Record upload, comparison, review, and export actions
- Avoid exposing personal information in public URLs or logs
- Define an appropriate data-retention policy
- Provide controlled correction procedures
- Do not expose member information to unauthorized users

Audit logs should record:
- Who performed the action
- What action was performed
- When it occurred
- Which snapshot or member record was affected
- Previous and new values for authorized profile-change reviews
- Any reason or note entered by the administrator

---

# 11. Suggested Data Model

The following is a logical data model. Adapt names and relationships to the existing application's database and architecture.

| Entity | Purpose |
|---|---|
| users | System users and roles |
| schools | School reference records |
| districts | District reference records |
| uploads | Uploaded files and import metadata |
| snapshots | Immutable reporting snapshots |
| school_snapshot_records | School values for each snapshot |
| member_snapshot_records | Member values for each snapshot |
| comparisons | Comparison jobs between two snapshots |
| school_comparison_results | Per-school comparison results |
| member_comparison_results | Per-member comparison results |
| duplicate_review_cases | Potential duplicate-account cases |
| member_assignment_history | Historical school/district assignments |
| transfer_events | Detected and reviewed transfer changes |
| email_validation_results | Email policy checks |
| audit_logs | Administrative activity history |

## 11.1 Important relationships

- One upload creates one snapshot after successful import.
- A snapshot contains many school or member records, depending on the module.
- A comparison references one previous snapshot and one current snapshot.
- Each comparison can produce many school or member comparison results.
- A member may have many historical snapshot records.
- A member may have multiple school assignment records over time.
- A detected transfer should be linked to the member and the snapshots that revealed the change.

Keep member records and school records connected through stable identifiers wherever the source data provides them.

---

# 12. Business Rules and Edge Cases

1. **Repeated upload:** Do not double-count or silently create duplicate records.
2. **Corrected export:** Preserve the earlier snapshot and record the correction.
3. **New school/member:** Classify as new in the comparison.
4. **Missing school/member:** Flag as missing; do not assume closure, resignation, or transfer.
5. **Duplicate member ID:** Reject or quarantine the affected records for review.
6. **Shared email:** Flag for review; do not automatically merge accounts.
7. **Name change:** Match using member ID and record the changed name.
8. **School transfer:** Detect only when reliable assignment fields are available.
9. **District change:** Preserve the previous and new district values.
10. **Zero previous downloads:** Avoid division by zero in percentage calculations.
11. **Invalid downloads:** Do not silently treat invalid or blank values as zero.
12. **Missing school/district fields:** Show transfer tracking as unavailable for that source.
13. **Different export scope:** Warn before comparing files covering different schools or districts.
14. **Member absent from current file:** Mark missing in that snapshot, not permanently deleted.
15. **Email domain policy change:** Apply the policy version used for each validation so historical results remain explainable.

---

# 13. Acceptance Criteria

The enhancement is ready for operational use when the following tests pass.

## Module 1 — School Download Monitoring

- [ ] System accepts the supplied school export format.
- [ ] System recognizes the expected six columns.
- [ ] System imports the 498 sample school records successfully, subject to validation.
- [ ] System uses School ID for matching.
- [ ] First upload is saved as a baseline.
- [ ] Second upload produces correct increased/decreased/no-change results.
- [ ] New and missing school records are identified.
- [ ] Previous snapshots remain available.
- [ ] Repeated uploads do not double-count data.
- [ ] Reports can be filtered and exported.

## Module 2 — Registered Member Monitoring

- [ ] System accepts the supplied member export format.
- [ ] System recognizes the expected ten columns.
- [ ] System imports the seven sample member records successfully, subject to validation.
- [ ] System uses member ID as the primary matching key.
- [ ] New, existing, and missing members are identified.
- [ ] Potential duplicates are flagged with a reason.
- [ ] Find Member supports ID, name, and email search.
- [ ] Individual download differences are calculated correctly.
- [ ] Non-approved email domains are flagged according to configurable policy.
- [ ] Transfer tracking works when school/district assignment fields are available.
- [ ] Transfer history preserves previous assignments.
- [ ] Missing source fields produce a clear limitation message.
- [ ] Member information is protected by role-based access.
- [ ] Reports can be filtered and exported.

## Cross-module requirements

- [ ] Upload history is available.
- [ ] Snapshot dates and reporting periods are visible.
- [ ] Comparison scope is validated.
- [ ] Audit logs record important administrative actions.
- [ ] Excel/PDF reports show the correct comparison period.
- [ ] No historical snapshot is silently overwritten.

---

# 14. Recommended Implementation Order

Implement these enhancements in stages so the existing application can be extended safely.

## Phase 1 — Review and stabilize existing uploads

- Review current upload logic.
- Confirm how school and member exports are distinguished.
- Validate required columns and data types.
- Add upload history and snapshot storage.
- Prevent duplicate imports.

## Phase 2 — School comparison improvements

- Confirm School ID matching.
- Implement school download differences.
- Add new/missing school detection.
- Add school comparison dashboard and reports.

## Phase 3 — Member comparison

- Implement member ID matching.
- Add new/existing/missing classifications.
- Add duplicate detection and review workflow.
- Add profile-change detection.

## Phase 4 — Find Member and transfer tracking

- Build the Find Member search.
- Obtain or add a reliable school/district assignment source.
- Implement assignment history.
- Detect and review transfers.
- Display previous and current school/district.

## Phase 5 — Individual downloads and email validation

- Implement individual download comparisons.
- Confirm whether member download totals are cumulative.
- Configure approved DepEd email domains.
- Flag non-approved domains.
- Add member download and email-validation reports.

## Phase 6 — Security, testing, and release

- Verify role-based permissions.
- Test import and comparison edge cases.
- Test historical records and corrected uploads.
- Validate printable/exportable reports.
- Review audit logs.
- Conduct user acceptance testing with authorized personnel.

---

# 15. Questions to Confirm Before Finalizing Implementation

The following items require confirmation from the LR Portal data owner or system administrator.

1. **Download counting:** Are school `DOWNLOADS` and member `TOTAL DOWNLOADS` cumulative totals or period-specific totals?
2. **Member assignment source:** Can the LR Portal provide an export containing member ID, School ID, school name, and district?
3. **Export scope:** Will member exports be uploaded per school, per district, or for the entire division?
4. **Email policy:** Which exact email domains are officially approved for DepEd member registration?
5. **Transfer verification:** Should detected transfers be automatically accepted, or must an authorized administrator verify each one?
6. **Missing members:** Should a missing member remain classified as missing until they reappear, or should the system have an additional inactive/unverified status?
7. **Reporting calendar:** What reporting periods and cutoff dates will the administrators use?

Do not block development of features that can already be implemented. The first, second, and third questions primarily affect comparison interpretation and transfer functionality.

---

# 16. Final System Workflow

The intended end-to-end workflow is:

```text
LR PORTAL
   |
   | Export school data
   | Export registered-member data
   v
LR PORTAL MONITORING SYSTEM
   |
   +-------------------------------+
   |                               |
   v                               v
SCHOOL DOWNLOAD MODULE       MEMBER MONITORING MODULE
   |                               |
   v                               v
Validate school file          Validate member file
   |                               |
   v                               v
Save school snapshot          Save member snapshot
   |                               |
   v                               v
Compare School IDs            Compare Member IDs
   |                               |
   v                               v
Calculate download change     Detect new/missing members
   |                          Detect potential duplicates
   |                          Find profile changes
   |                          Track transfers (if data exists)
   |                          Compare member downloads
   |                          Validate email domains
   |                               |
   +---------------+---------------+
                   |
                   v
            DASHBOARD & REPORTS
                   |
                   v
       REVIEW / PRINT / EXPORT / HISTORY
```

# 17. Final Recommendation

Treat this as an enhancement to the existing LR Portal Monitoring System, not as a separate application.

The two modules should share one historical snapshot and comparison architecture while maintaining separate data rules for school records and member records.

The most important implementation principles are:

1. Preserve every valid historical upload.
2. Match schools and members using stable identifiers.
3. Distinguish missing records from actual account or employment changes.
4. Never infer a teacher's transfer without reliable school-assignment data.
5. Validate email addresses against a configurable approved-domain policy.
6. Keep comparison results traceable to the exact files and reporting periods used.
7. Protect member information through access controls and audit logs.

**Expected outcome:** Administrators can upload the latest LR Portal exports and quickly understand school download performance, member registration changes, possible duplicate accounts, teacher movements, individual download activity, and email-policy exceptions—all from one monitoring application.
