# End-to-End Happy Path Timeline

## Overview

This document describes the complete lifecycle of a DSCR refinance loan from lead intake through funding, with timestamps showing the automated flow.

## Scenario

**Borrower:** John Smith, individual investor
**Property:** 123 Main Street, Austin, TX 78701 (SFR)
**Loan Request:** $324,000 cash-out refinance
**Property Value:** $450,000 (LTV: 72%)
**Monthly Rent:** $4,200
**Credit Score:** 742

---

## Timeline

### T+0:00 - Lead Submission (Automated)

```
EVENT: Lead submitted via website form
TRIGGER: Website form POST to /api/v1/leads
```

**Platform Actions:**
1. Lead created with `id: lead_01HXYZ123`
2. Lead scored: 78/100 (HIGH_PRIORITY)
3. Lead auto-assigned to LO (Sarah Johnson)
4. TCPA consent recorded

**Notifications:**
- LO receives Slack notification
- Lead receives email confirmation

**Data State:**
```json
{
  "status": "NEW",
  "score": 78,
  "assignedLoId": "lo_sarah_johnson"
}
```

---

### T+0:05 - LO Contact & Qualification (Semi-Manual)

```
EVENT: LO contacts borrower, gathers additional info
TRIGGER: Manual LO action in portal
```

**Platform Actions:**
1. LO updates lead with additional details
2. Lead status → `CONTACTED`
3. Activity logged

**Data State:**
```json
{
  "status": "CONTACTED",
  "firstContactedAt": "2024-01-15T10:05:00Z"
}
```

---

### T+0:30 - Lead Qualified & Converted (Automated)

```
EVENT: LO marks lead as qualified
TRIGGER: POST /api/v1/leads/{leadId}/qualify
```

**Platform Actions:**
1. Lead status → `QUALIFIED`
2. Conversion initiated
3. Borrower record created
4. Property record created
5. Application record created
6. **Encompass loan created** (`GUID: abc-123-456`)
7. Lead status → `CONVERTED`

**Encompass Actions:**
- Loan created from template `DSCR_Refinance_v2`
- `CX.PLATFORM_LOAN_ID` set to application ID
- Milestone: `Started`

**Data State:**
```json
{
  "lead.status": "CONVERTED",
  "application.id": "app_01HXYZ789",
  "encompassLink.loanGuid": "abc-123-456",
  "encompassLink.milestone": "Started"
}
```

---

### T+0:31 - Credit Order (Automated)

```
EVENT: Application created triggers credit order
TRIGGER: Event: APPLICATION_CREATED
```

**Platform Actions:**
1. Hard credit pull ordered (MeridianLink)
2. Order ID: `CR-2024-001234`

**Vendor Call:**
```
POST https://api.meridianlink.com/credit/v2/order
{
  "borrower": { "ssn": "***-**-1234", ... },
  "bureaus": ["EXPERIAN", "EQUIFAX", "TRANSUNION"],
  "pullType": "HARD"
}
```

---

### T+0:32 - AVM Order (Automated)

```
EVENT: Application created triggers AVM order
TRIGGER: Event: APPLICATION_CREATED
```

**Platform Actions:**
1. AVM ordered (CoreLogic)
2. Order ID: `AVM-2024-001234`

**Vendor Call:**
```
POST https://api.corelogic.com/valuation/v1/avm
{
  "address": "123 Main Street",
  "city": "Austin",
  "state": "TX",
  "zip": "78701"
}
```

---

### T+0:33 - Credit Received (Automated)

```
EVENT: Credit vendor callback
TRIGGER: Webhook from MeridianLink
```

**Platform Actions:**
1. Credit report parsed
2. Score: 742 (representative)
3. Tradelines extracted
4. Credit data synced to Encompass

**Encompass Updates:**
```json
{
  "65": "***-**-1234",
  "CX.CREDIT_SCORE_USED": 742,
  "CX.CREDIT_PULL_DATE": "2024-01-15",
  "CX.CREDIT_PULL_TYPE": "HARD"
}
```

---

### T+0:34 - AVM Received (Automated)

```
EVENT: AVM vendor callback
TRIGGER: Webhook from CoreLogic
```

**Platform Actions:**
1. AVM report stored
2. Value: $450,000 (High confidence)
3. AVM data synced to Encompass

**Encompass Updates:**
```json
{
  "CX.AVM_VALUE": 450000,
  "CX.AVM_CONFIDENCE": "HIGH",
  "CX.AVM_CONFIDENCE_SCORE": 85,
  "CX.AVM_PROVIDER": "CORELOGIC",
  "CX.AVM_DATE": "2024-01-15"
}
```

---

### T+0:35 - DSCR Calculation (Automated)

```
EVENT: All enrichment data received
TRIGGER: Event: AVM_RECEIVED (final enrichment item)
```

**Platform Actions:**
1. DSCR calculated
2. Result: 1.28

**Calculation:**
```
Gross Monthly Rent: $4,200
Effective Gross Rent (5% vacancy): $3,990
Management Fee (8%): $319
Property Tax (monthly): $500
Insurance (monthly): $200
HOA: $0
NOI Monthly: $2,971

P&I at 7.125%: $2,180
PITIA: $2,880

DSCR = $2,971 / $2,880 = 1.032

Wait - let me recalculate for the actual happy path scenario...

Using actual inputs for $324K at 7.125%:
P&I: $2,180
Property Tax: $500/mo
Insurance: $200/mo
PITIA: $2,880/mo

Gross Rent: $4,200
Effective (5% vacancy): $3,990
NOI (after 8% mgmt): $3,671

DSCR = $3,671 / $2,880 = 1.27 ✓
```

**Encompass Updates:**
```json
{
  "CX.DSCR_GROSS_RENT": 4200,
  "CX.DSCR_EFFECTIVE_RENT": 3990,
  "CX.DSCR_NOI_MONTHLY": 3671,
  "CX.DSCR_PITIA": 2880,
  "CX.DSCR_RATIO": 1.27,
  "CX.DSCR_CALC_DATE": "2024-01-15"
}
```

---

### T+0:36 - Eligibility Evaluation (Automated)

```
EVENT: DSCR calculation complete
TRIGGER: Event: DSCR_CALCULATED
```

**Platform Actions:**
1. Rules engine evaluates 12 rules
2. All rules pass
3. Result: `APPROVED`

**Rule Results:**
| Rule | Result | Value |
|------|--------|-------|
| DSCR_MIN | PASS | 1.27 ≥ 1.0 |
| LTV_MAX | PASS | 72% ≤ 80% |
| CREDIT_MIN | PASS | 742 ≥ 660 |
| PROPERTY_TYPE | PASS | SFR ✓ |
| INVESTMENT_ONLY | PASS | INVESTMENT ✓ |
| LOAN_AMOUNT_MIN | PASS | $324K ≥ $100K |
| LOAN_AMOUNT_MAX | PASS | $324K ≤ $3M |
| CASH_OUT_MAX | PASS | $44K ≤ $500K at 72% LTV |
| RESERVES_MIN | PASS | 9 mo ≥ 6 mo |
| ENTITY_DOCS | PASS | Individual borrower |
| RENT_ROLL | WARN | Need rent roll doc |
| DSCR_PREFERRED | PASS | 1.27 ≥ 1.25 |

**Conditions Generated:**
1. `DSCR-001`: Rent Roll Documentation (auto-generated)
2. `DSCR-003`: Bank Statements for Reserves (auto-generated)

**Encompass Updates:**
```json
{
  "CX.ELIG_RESULT": "APPROVED",
  "CX.ELIG_RULES_VERSION": "v2.1.0",
  "CX.ELIG_EVAL_DATE": "2024-01-15",
  "CX.ELIG_SCORE": 92
}
```

---

### T+0:37 - Pricing Calculation (Automated)

```
EVENT: Eligibility approved
TRIGGER: Event: ELIGIBILITY_EVALUATED (result=APPROVED)
```

**Platform Actions:**
1. Pricing engine calculates rate
2. Base rate: 7.375% (72% LTV tier)
3. Adders applied

**Pricing Breakdown:**
| Factor | Value | Adjustment |
|--------|-------|------------|
| Base Rate (72% LTV) | - | 7.375% |
| Credit (742) | 740-759 tier | 0.000% |
| DSCR (1.27) | 1.25-1.49 tier | 0.000% |
| Loan Amount ($324K) | $250K-$499K tier | 0.000% |
| Property Type (SFR) | Base | 0.000% |
| Cash-Out | Yes | +0.250% |
| 3-Year Prepay | Selected | -0.500% |
| 45-Day Lock | Selected | +0.125% |
| **Final Rate** | - | **7.250%** |

**Encompass Updates:**
```json
{
  "CX.PRICE_BASE_RATE": 7.375,
  "CX.PRICE_ADDERS_TOTAL": -0.125,
  "CX.PRICE_FINAL_RATE": 7.25,
  "CX.PRICE_CARD_ID": "DSCR_30YR_FIXED_2024_Q1",
  "CX.PRICE_CARD_DATE": "2024-01-01"
}
```

---

### T+0:38 - Pre-Approval Decision (Automated)

```
EVENT: Pricing complete
TRIGGER: Event: PRICING_CALCULATED
```

**Platform Actions:**
1. Decision generated: `PRE_APPROVAL`
2. Result: `APPROVED`
3. 2 conditions attached
4. Pre-approval packet generated

**Encompass Updates:**
- Milestone advanced: `Started` → `Application` → `Pre-Approved`

**Notifications:**
- LO notified of pre-approval
- Borrower receives pre-approval email

**Data State:**
```json
{
  "decision.result": "APPROVED",
  "decision.type": "PRE_APPROVAL",
  "encompassLink.milestone": "Pre-Approved",
  "conditions": [
    { "code": "DSCR-001", "status": "OPEN" },
    { "code": "DSCR-003", "status": "OPEN" }
  ]
}
```

---

### T+0:38 → T+24:00 - Document Collection (Semi-Manual)

```
EVENT: Borrower uploads documents
TRIGGER: User action in borrower portal
```

**Documents Received:**
1. T+2:00 - Rent roll uploaded → Auto-classified
2. T+4:00 - Bank statements uploaded → Auto-classified
3. T+6:00 - Government ID uploaded → Auto-classified

**Condition Auto-Clear:**
- T+2:05 - Rent roll received → `DSCR-001` cleared
- T+4:05 - Bank statements received → `DSCR-003` cleared

**Encompass Sync:**
- Documents synced to eFolder
- Conditions updated in Encompass

---

### T+24:00 - Milestone: Processing (Automated)

```
EVENT: All PTD conditions cleared
TRIGGER: Event: CONDITION_CLEARED (last PTD)
```

**Platform Actions:**
1. Milestone advancement evaluated
2. All criteria met
3. Milestone: `Pre-Approved` → `Processing`
4. Appraisal ordered

**Appraisal Order:**
```
POST https://api.clearcapital.com/appraisal/v1/order
{
  "propertyAddress": "123 Main Street, Austin, TX 78701",
  "productType": "FULL_INTERIOR",
  "lenderReference": "app_01HXYZ789"
}
```

---

### T+24:00 → T+168:00 (Day 7) - Processing (Semi-Manual)

**Activities:**
- T+48:00 - Appraisal inspection scheduled
- T+96:00 - Appraisal inspection completed
- T+144:00 - Appraisal report received ($455,000)
- T+144:01 - Appraisal synced to Encompass
- T+144:02 - Title ordered
- T+168:00 - Title commitment received

**Appraisal Result:**
- Appraised Value: $455,000
- LTV updated: $324K / $455K = 71.2%

---

### T+168:00 - Milestone: Submitted to UW (Automated)

```
EVENT: All processing complete
TRIGGER: Title commitment received + appraisal in file
```

**Platform Actions:**
1. Pre-underwriting checklist complete
2. Milestone: `Processing` → `Submitted`
3. Assigned to UW (Mike Wilson)

**Notifications:**
- UW receives assignment notification

---

### T+168:00 → T+192:00 (Day 8) - Underwriting (Human Review)

```
EVENT: UW reviews file
TRIGGER: UW opens workbench
```

**UW Actions:**
1. Reviews credit report ✓
2. Reviews appraisal ✓
3. Verifies DSCR calculation ✓
4. Reviews rent roll ✓
5. Verifies reserves ✓
6. Approves loan ✓

**Platform Actions:**
1. UW clicks "Approve" in workbench
2. Decision recorded: `FINAL_APPROVAL`
3. Milestone: `Submitted` → `Approved`

**PTC Conditions Added:**
1. `DSCR-020`: Final Title Commitment
2. `DSCR-021`: Insurance Binder

---

### T+192:00 - Rate Lock (Manual Trigger)

```
EVENT: LO requests rate lock
TRIGGER: POST /api/v1/applications/{id}/pricing/lock
```

**Platform Actions:**
1. Rate locked at 7.250%
2. Lock period: 45 days
3. Lock expiration: T+45 days

**Encompass Updates:**
```json
{
  "CX.PRICE_LOCK_DATE": "2024-01-23",
  "CX.PRICE_LOCK_EXPIRY": "2024-03-09",
  "CX.PRICE_LOCK_DAYS": 45
}
```

---

### T+192:00 → T+336:00 (Day 14) - Closing Prep

**Activities:**
- T+216:00 - Insurance binder received → `DSCR-021` cleared
- T+240:00 - Final title commitment received → `DSCR-020` cleared
- T+288:00 - Closing docs ordered
- T+312:00 - Closing docs generated
- T+336:00 - Milestone: `Approved` → `Docs Out`

---

### T+336:00 → T+360:00 (Day 15) - Clear to Close

```
EVENT: All PTC conditions cleared
TRIGGER: Event: CONDITION_CLEARED (last PTC)
```

**Platform Actions:**
1. CTC evaluation passed
2. Milestone: `Docs Out` → `Clear to Close`
3. Closing scheduled

**Notifications:**
- Borrower receives closing confirmation
- Title company notified

---

### T+384:00 (Day 16) - Closing

```
EVENT: Closing completed
TRIGGER: Title company callback
```

**Platform Actions:**
1. Closing confirmed
2. Recording pending

---

### T+408:00 (Day 17) - Funding

```
EVENT: Recording confirmed
TRIGGER: Title company callback
```

**Platform Actions:**
1. Wire instruction generated
2. Funding authorized
3. Wire sent
4. Milestone: `Clear to Close` → `Funded`

**Encompass Updates:**
- Funding date recorded
- Disbursement date recorded

---

### T+432:00 (Day 18) - Post-Close

```
EVENT: Loan funded
TRIGGER: Event: LOAN_FUNDED
```

**Platform Actions:**
1. Post-close QC initiated
2. Investor data export prepared
3. Welcome letter generated

**Milestone:** `Funded` → `Completion`

---

## Summary Timeline

| Milestone | Time | Duration |
|-----------|------|----------|
| Lead Created | T+0:00 | - |
| Lead Converted | T+0:30 | 30 min |
| Pre-Approved | T+0:38 | 8 min |
| Processing | T+24:00 | 24 hours |
| Submitted to UW | T+168:00 | 7 days |
| Approved | T+192:00 | 8 days |
| Clear to Close | T+360:00 | 15 days |
| Funded | T+408:00 | 17 days |

**Total Cycle Time: 17 days** (from lead to funding)

**Automation Stats:**
- Auto-decisions: 100% (pre-approval was fully automated)
- Human touchpoints: 3 (LO qualification, UW review, closing)
- Conditions auto-cleared: 100%
- Total API calls: 47
- Encompass field updates: 156
