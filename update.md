# MONTHLY DATA VISUALIZATION SYSTEM

## System Requirements & Visual Design Specification

**Purpose:**
Transform the existing Excel-based monthly reports into a visual monitoring system that allows users to quickly understand large amounts of data, identify changes, compare schools/users, and drill down into detailed records.

---

# 1. SYSTEM OBJECTIVE

The system must make large monthly datasets easy to understand without requiring the user to manually inspect hundreds of rows.

The system should answer these questions immediately:

1. How many schools are included?
2. How many users are registered?
3. How many users are actually active/participating?
4. What is the participation rate?
5. How many resources/downloads were recorded?
6. Which schools have the highest activity?
7. Which schools have low or no activity?
8. How has the situation changed compared with previous months?
9. Which users/records are contributing to the reported figures?
10. Can the user easily locate a specific school or user?

---

# 2. CORE SYSTEM STRUCTURE

The workbook should contain the following major sections:

```text
MONTHLY VISUALIZATION SYSTEM
│
├── 01. DASHBOARD
│
├── 02. MONTHLY OVERVIEW
│
├── 03. SCHOOL ANALYSIS
│
├── 04. USER ANALYSIS
│
├── 05. MONTHLY TRENDS
│
├── 06. RANKINGS
│
├── 07. DETAILED DATA
│
└── 08. DATA INPUT / UPDATE
```

The user should primarily interact with the **Dashboard**.

The other sheets provide supporting information and detailed records.

---

# 3. DASHBOARD

## Purpose

The Dashboard is the main visual page.

A user should be able to open the workbook and understand the current month's overall status without opening the detailed tables.

---

## 3.1 Dashboard Header

The top section should contain:

**SYSTEM NAME**

> Learning Resource Portal
> Monthly Visual Report

Then display:

- Reporting Month
- Reporting Year
- Last Updated Date
- Optional data status

Example:

```text
LEARNING RESOURCE PORTAL
MONTHLY VISUAL REPORT

September 2026
Last Updated: September 30, 2026
```

---

# 4. KEY PERFORMANCE INDICATORS

The dashboard must contain large KPI cards.

Minimum KPIs:

### KPI 1 — Total Schools

Number of schools included in the current reporting period.

Example:

```text
TOTAL SCHOOLS
498
```

---

### KPI 2 — Registered Users

Total number of registered users.

```text
REGISTERED USERS
8,303
```

---

### KPI 3 — Active / Actual Users

Number of users who actually participated or performed the defined activity.

```text
ACTIVE USERS
0
```

---

### KPI 4 — Participation Rate

Calculated from the appropriate registered/actual user figures.

```text
PARTICIPATION RATE
0%
```

The exact formula must follow the organization's existing definition.

---

### KPI 5 — Total Downloads / Activity

Total recorded downloads or equivalent activity metric.

```text
TOTAL DOWNLOADS
7.36M
```

---

# 5. KPI CHANGE INDICATORS

Whenever previous-month data exists, the KPI should also display the change.

Example:

```text
DOWNLOADS

7.36M
▲ 26.4% vs August
```

Possible indicators:

- Increase
- Decrease
- No change

The percentage should be calculated automatically.

Do not manually type the change values.

---

# 6. MONTHLY TREND

The system must allow comparison between months.

Minimum period:

```text
January
February
March
April
May
June
July
August
September
...
```

Recommended metrics:

- Registered Users
- Active Users
- Participation Rate
- Downloads
- Schools

---

## 6.1 Trend Visualization

Use line charts for metrics that change over time.

Example:

```text
MONTHLY DOWNLOAD TREND

Jan  ●
     │
Feb  │   ●
     │
Mar  │      ●
     │
Apr  │         ●
     │
May  │             ●
     └────────────────────
```

The chart should automatically update when a new month is added.

---

# 7. SCHOOL ANALYSIS

The system must have a dedicated School Analysis section.

This section is responsible for visualizing school-level performance.

---

## 7.1 School Summary

Display:

- Total schools
- Schools with activity
- Schools without activity
- Average activity per school
- Highest activity
- Lowest activity

Example:

```text
SCHOOL SUMMARY

498 Total Schools

Active Schools       250
Inactive Schools     248
Average Downloads    14,784
Highest              3,171,425
Lowest               0
```

The definitions of "active" and "inactive" should follow the organization's approved criteria.

---

# 8. TOP SCHOOL RANKING

The system should display a Top 10 list.

Default ranking:

**Top 10 Schools by Downloads**

Example:

```text
RANK   SCHOOL                         DOWNLOADS

1      School A                      3,171,425
2      School B                      2,883,841
3      School C                        660,143
4      School D                        238,705
5      School E                         96,506
...
```

The ranking should update automatically.

---

# 9. SCHOOL RANKING FILTER

The ranking should ideally be switchable.

Possible ranking metrics:

```text
RANK BY:

[ Downloads ▼ ]

• Downloads
• Registered Users
• Active Users
• Participation Rate
```

This allows the same system to answer different questions without creating multiple dashboards.

---

# 10. SCHOOL ACTIVITY DISTRIBUTION

The system should group schools according to activity.

Example:

```text
SCHOOL ACTIVITY

High Activity       █████████
Moderate Activity   █████████████
Low Activity        █████████████████
No Activity         █████
```

The thresholds must be defined according to the organization's actual reporting requirements.

Do not create arbitrary categories without documenting their definitions.

---

# 11. SCHOOL DETAIL TABLE

The system must retain the detailed school-level data.

Recommended fields:

| Field              | Description                   |
| ------------------ | ----------------------------- |
| School ID          | Unique school identifier      |
| School Name        | Official school name          |
| Registered Users   | Number registered             |
| Actual Users       | Number actually participating |
| Participation Rate | Calculated percentage         |
| Downloads          | Total downloads               |
| Status             | Activity classification       |
| Reporting Month    | Month of record               |

---

# 12. CONDITIONAL FORMATTING

The detailed school table should use visual indicators.

For example:

### Downloads

Use data bars:

```text
School A   ████████████████████ 3.17M
School B   █████████████████    2.88M
School C   ████                   660K
School D   ██                     239K
School E   ▏                       52
```

This makes large differences immediately visible.

---

## Participation Rate

Use a visual scale such as:

```text
HIGH       → positive indicator
MEDIUM     → warning indicator
LOW        → attention indicator
NONE       → critical/zero indicator
```

The exact thresholds must be documented.

---

# 13. USER ANALYSIS

A separate User Analysis section should summarize the user-level data.

Do not place thousands of user records directly on the dashboard.

Instead summarize them.

---

## 13.1 User KPIs

Display:

- Total Users
- Active Users
- Inactive Users
- New Users
- Users by Role
- Users by Organization/School
- Users by Gender, if applicable and appropriate to the report

---

# 14. USER ROLE DISTRIBUTION

Visualize users according to role.

Example:

```text
USERS BY ROLE

DepEd Personnel      ██████████████████
Member               ████
Administrator        ██
Other                █
```

---

# 15. USER REGISTRATION TREND

Show when users registered.

Recommended visualization:

```text
NEW USER REGISTRATIONS

Week 1       █████
Week 2       █████████
Week 3       ███
Week 4       ███████
```

For long-term analysis, also allow monthly comparison.

---

# 16. USER DETAIL TABLE

Retain the existing user-level records.

Recommended fields:

| Field                      |
| -------------------------- |
| User ID                    |
| Name                       |
| Email / Account Identifier |
| Role                       |
| School / Organization      |
| Status                     |
| Registration Date          |
| Last Activity              |
| Downloads / Activity       |
| Reporting Month            |

Only include fields that are already legitimately collected and required by the reporting purpose.

---

# 17. MONTHLY COMPARISON

The system must allow the current month to be compared with previous months.

Minimum comparison:

```text
CURRENT MONTH vs PREVIOUS MONTH
```

Example:

| Metric           | Previous Month | Current Month |  Change |
| ---------------- | -------------: | ------------: | ------: |
| Schools          |            490 |           498 |      +8 |
| Registered Users |          8,050 |         8,303 |    +253 |
| Active Users     |          1,200 |         1,350 |    +150 |
| Participation    |          14.9% |         16.3% | +1.4 pp |
| Downloads        |           5.8M |         7.36M |  +1.56M |

For percentages, distinguish between:

- **Percentage change**
- **Percentage-point change**

Do not mix the two.

---

# 18. MONTH SELECTOR

The dashboard should contain a Month selector.

Example:

```text
REPORTING PERIOD

[ September 2026 ▼ ]
```

Changing the month should update:

- KPI cards
- Charts
- Rankings
- School tables
- User summaries
- Comparison values

---

# 19. SCHOOL FILTER

Provide a school selector where useful.

Example:

```text
SCHOOL

[ All Schools ▼ ]
```

Possible behavior:

### All Schools

Shows the overall system.

### Individual School

Shows only the selected school's:

- Registered users
- Active users
- Participation
- Downloads
- Monthly trend
- User information

This creates a simple drill-down mechanism.

---

# 20. SEARCH FUNCTION

The detailed data section should allow searching.

The user should be able to search for:

- School name
- School ID
- User name
- User ID
- Other relevant identifiers

The search should reduce the amount of data displayed instead of requiring the user to manually scroll through hundreds of rows.

---

# 21. RAW / DETAILED DATA

The system must retain the original detailed records.

Do not remove the raw information simply because the dashboard summarizes it.

Recommended structure:

```text
DATA INPUT
     ↓
DATA TABLE
     ↓
CALCULATIONS
     ↓
DASHBOARD
```

The raw data should be kept separate from the visual presentation.

---

# 22. DATA INPUT SYSTEM

Updating the system every month should require as little manual work as possible.

The preferred workflow:

```text
1. Copy / import new monthly data
             ↓
2. Add reporting month
             ↓
3. Refresh calculations
             ↓
4. Refresh dashboard
             ↓
5. Review results
             ↓
6. Export / present
```

Avoid manually changing:

- Chart ranges
- KPI formulas
- Ranking formulas
- Dashboard labels
- Conditional formatting ranges

These should automatically accommodate new records whenever practical.

---

# 23. DATA VALIDATION

Before presenting the monthly dashboard, the system should check:

### Required checks

- Are all schools included?
- Are duplicate school records present?
- Are duplicate users present?
- Are required fields blank?
- Are negative values present?
- Are percentages valid?
- Are downloads numeric?
- Does the total match the source data?
- Does the current month have the correct reporting period?

---

# 24. DATA QUALITY SUMMARY

Include a small section showing data quality.

Example:

```text
DATA QUALITY

Records Checked       498
Complete Records      492
Missing Values          6
Duplicate Records       0
Validation Status    ✓ READY
```

This is particularly useful for an official reporting system.

---

# 25. VISUAL DESIGN PRINCIPLES

The system should follow these rules.

### Rule 1 — Do not visualize everything

Charts should answer specific questions.

### Rule 2 — Use tables for details

Use charts for patterns and tables for exact values.

### Rule 3 — Use rankings for large datasets

Do not display 498 schools in one chart.

Use:

- Top 10
- Bottom 10
- Distribution
- Searchable detailed table

### Rule 4 — Use trends for time

Use line charts for monthly progression.

### Rule 5 — Use KPI cards for headline numbers

The viewer should understand the current month within seconds.

### Rule 6 — Keep colors meaningful

Example:

```text
Normal / Positive     Green
Attention             Yellow
Low / Critical        Red
Neutral information   Blue / Gray
```

Do not use colors purely for decoration.

---

# 26. RECOMMENDED DASHBOARD LAYOUT

The main dashboard should follow this hierarchy:

```text
┌─────────────────────────────────────────────────────────────┐
│              MONTHLY VISUAL REPORT                          │
│              September 2026                                 │
├────────────┬────────────┬────────────┬────────────┬─────────┤
│  SCHOOLS   │ REGISTERED │   ACTIVE   │ PARTICIP.  │DOWNLOADS│
│    498     │   8,303    │     0     │     0%     │  7.36M  │
├────────────┴────────────┴────────────┴────────────┴─────────┤
│                                                             │
│                  MONTHLY TREND                              │
│                                                             │
├────────────────────────────────┬────────────────────────────┤
│                                │                            │
│     TOP 10 SCHOOLS             │   SCHOOL ACTIVITY          │
│     BY DOWNLOADS               │   DISTRIBUTION             │
│                                │                            │
├────────────────────────────────┴────────────────────────────┤
│                                                             │
│               MONTHLY COMPARISON                            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Filters: [Month] [School] [Metric]                          │
└─────────────────────────────────────────────────────────────┘
```

---

# 27. RECOMMENDED WORKBOOK SHEETS

The final Excel workbook should ideally contain:

## Sheet 1 — DASHBOARD

The main presentation page.

Contains:

- KPIs
- Current month
- Trends
- Rankings
- Activity distribution
- Filters

---

## Sheet 2 — MONTHLY OVERVIEW

Contains:

- Monthly totals
- Month-to-month comparison
- Historical trends

---

## Sheet 3 — SCHOOL ANALYSIS

Contains:

- School rankings
- School activity
- Participation
- Downloads
- School comparison

---

## Sheet 4 — USER ANALYSIS

Contains:

- User totals
- User roles
- Registration trends
- User activity

---

## Sheet 5 — SCHOOL DATA

Detailed school records.

---

## Sheet 6 — USER DATA

Detailed user records.

---

## Sheet 7 — MONTHLY DATA

Historical monthly summary.

---

## Sheet 8 — DATA INPUT

Where new monthly data is entered/imported.

---

## Sheet 9 — DEFINITIONS / NOTES

Document the meaning of every metric.

Example:

| Metric             | Definition                                   |
| ------------------ | -------------------------------------------- |
| Registered Users   | Total registered accounts                    |
| Active Users       | Users meeting the defined activity criteria  |
| Participation Rate | Actual Users ÷ Registered Users              |
| Downloads          | Total recorded downloads                     |
| Active School      | School meeting the defined activity criteria |

This sheet is important because future users should understand exactly how the numbers are calculated.

---

# 28. MONTHLY UPDATE PROCEDURE

Every month, the operator should only need to perform:

```text
STEP 1
Add/import new monthly data

        ↓

STEP 2
Select the reporting month

        ↓

STEP 3
Refresh calculations / tables

        ↓

STEP 4
Review validation warnings

        ↓

STEP 5
Open DASHBOARD

        ↓

STEP 6
Review KPIs and trends

        ↓

STEP 7
Export / present monthly report
```

The objective is to make the monthly update **repeatable and low-effort**.

---

# 29. MINIMUM REQUIRED FEATURES

If development time is limited, prioritize these features first:

### MUST HAVE

- [ ] Monthly Dashboard
- [ ] KPI cards
- [ ] Month selector
- [ ] Total schools
- [ ] Registered users
- [ ] Active users
- [ ] Participation rate
- [ ] Total downloads/activity
- [ ] Top 10 schools
- [ ] School activity distribution
- [ ] Monthly trend
- [ ] Detailed school table
- [ ] Detailed user table
- [ ] Search/filter
- [ ] Automatic calculations

### SHOULD HAVE

- [ ] Previous-month comparison
- [ ] School selector
- [ ] User analysis
- [ ] Data validation
- [ ] Data quality summary
- [ ] Ranking selector
- [ ] Conditional formatting

### NICE TO HAVE

- [ ] Interactive slicers
- [ ] Automated import
- [ ] Export-ready report page
- [ ] Automated monthly archive
- [ ] Additional trend analysis

---

# 30. FINAL SYSTEM CONCEPT

The completed system should follow this philosophy:

> **DATA → INFORMATION → VISUALIZATION → INSIGHT**

Instead of presenting:

```text
498 rows
8,303 users
millions of downloads
hundreds of individual records
```

the system should first present:

```text
WHAT IS THE CURRENT STATUS?
          ↓
WHAT CHANGED?
          ↓
WHICH SCHOOLS ARE MOST ACTIVE?
          ↓
WHICH SCHOOLS NEED ATTENTION?
          ↓
WHY?
          ↓
SHOW THE DETAILED RECORDS
```

The detailed data remains available, but the user does not need to read it all to understand the report.

---

# 31. SUCCESS CRITERIA

The system can be considered successful if a user can open the workbook and, within approximately one minute, determine:

1. The current reporting period.
2. The total number of schools.
3. The total number of registered users.
4. The number of active users.
5. The participation rate.
6. The total downloads/activity.
7. The monthly trend.
8. The highest-activity schools.
9. The distribution of school activity.
10. The detailed record behind any summarized number.

The system should therefore prioritize **clarity, comparison, filtering, and drill-down** rather than simply adding more charts.
