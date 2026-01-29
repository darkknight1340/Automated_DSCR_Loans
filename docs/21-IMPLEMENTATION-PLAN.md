# 90-Day Implementation Plan

## Overview

This plan outlines the phased implementation of the DSCR Loan Automation Platform. The approach prioritizes delivering value incrementally while building toward a fully automated system.

## Phase Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           90-DAY IMPLEMENTATION                             │
│                                                                             │
│  PHASE 1 (Days 1-30)         PHASE 2 (Days 31-60)       PHASE 3 (Days 61-90)│
│  ═══════════════════         ═══════════════════        ═══════════════════ │
│                                                                             │
│  Foundation &                Automation &              Scale &              │
│  Core Pipeline               Intelligence             Production           │
│                                                                             │
│  • Infrastructure            • Rules Engine            • Post-Close         │
│  • Encompass Integration     • Pricing Engine          • Investor Delivery  │
│  • Lead → Application        • Auto-decisioning        • Reporting/BI       │
│  • Basic DSCR Calc           • Document Classification • Performance Tuning │
│  • Manual UW Workflow        • Condition Automation    • DR/HA Setup        │
│                                                                             │
│  Outcome: Process loans      Outcome: 70% automation   Outcome: Production  │
│  with 50% manual effort      on qualified loans        ready at scale       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation & Core Pipeline (Days 1-30)

### Week 1: Infrastructure Setup

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 1-2 | Set up AWS infrastructure (VPC, EKS cluster, RDS) | DevOps | Terraform configs deployed |
| 1-2 | Configure CI/CD pipelines (GitHub Actions) | DevOps | Build/deploy automation |
| 3-4 | Set up PostgreSQL with schemas | Backend | Database ready |
| 3-4 | Configure Redis cluster | Backend | Cache/queue ready |
| 5 | Set up monitoring (Datadog) | DevOps | Dashboards configured |

**Exit Criteria:**
- [ ] Infrastructure provisioned and accessible
- [ ] CI/CD deploys to staging environment
- [ ] Database migrations run successfully
- [ ] Monitoring dashboards showing metrics

### Week 2: Encompass Integration Foundation

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 6-7 | Configure Encompass API credentials and SDK | Backend | API connection verified |
| 6-7 | Implement EncompassAdapter base class | Backend | Adapter skeleton |
| 8-9 | Build loan creation with idempotency | Backend | createOrGetLoan() working |
| 8-9 | Implement field mapping engine | Backend | Platform ↔ Encompass mapping |
| 10 | Configure webhook subscriptions | Backend | Webhook handler deployed |

**Exit Criteria:**
- [ ] Can create loans in Encompass from platform
- [ ] Platform loan ID stored in CX.PLATFORM_LOAN_ID
- [ ] Bidirectional field sync working for 10+ fields
- [ ] Webhook handler receives milestone changes

### Week 3: Lead Intake & Application Pipeline

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 11-12 | Build Lead Service with scoring | Backend | Lead intake API |
| 11-12 | Create borrower/property models | Backend | Domain entities |
| 13-14 | Implement application creation workflow | Backend | Lead → Application conversion |
| 13-14 | Build DSCR Calculator (basic) | Backend | DSCR calculation API |
| 15 | Create LO portal (basic) | Frontend | Lead list + application view |

**Exit Criteria:**
- [ ] Leads can be created via API
- [ ] Lead scoring working
- [ ] Lead converts to application + Encompass loan
- [ ] DSCR calculates correctly for standard scenarios
- [ ] LO can view leads and applications in portal

### Week 4: Credit, AVM & Manual Underwriting

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 16-17 | Integrate credit vendor (MeridianLink) | Backend | Credit pull API |
| 16-17 | Build credit report parser | Backend | Tradeline extraction |
| 18-19 | Integrate AVM vendor (CoreLogic) | Backend | AVM order API |
| 18-19 | Build AVM cascade logic | Backend | Multi-vendor fallback |
| 20-21 | Create UW workbench (basic) | Frontend | Manual review screen |
| 22 | Integration testing | QA | E2E test suite |

**Exit Criteria:**
- [ ] Credit pulls working with data in Encompass
- [ ] AVM reports retrieved and stored
- [ ] UW can review loan in workbench
- [ ] Manual approval updates Encompass milestone
- [ ] End-to-end lead→pre-approval flow works

### Phase 1 Success Metrics

| Metric | Target |
|--------|--------|
| Lead to Application conversion | < 2 hours (manual steps) |
| Credit pull success rate | > 95% |
| AVM hit rate | > 80% |
| Encompass sync success | > 99% |
| System uptime | > 99% |

---

## Phase 2: Automation & Intelligence (Days 31-60)

### Week 5: Rules Engine

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 23-24 | Build RuleEvaluator core | Backend | Condition evaluation |
| 23-24 | Implement rule versioning | Backend | Rule storage + retrieval |
| 25-26 | Create default eligibility rules | Backend | 15+ rules configured |
| 25-26 | Build rule management UI | Frontend | Rule viewer |
| 27 | Add explainability output | Backend | Human-readable explanations |

**Exit Criteria:**
- [ ] Rules engine evaluates all eligibility criteria
- [ ] Rules are versioned and auditable
- [ ] Evaluation results explain pass/fail reasons
- [ ] Results sync to Encompass custom fields

### Week 6: Pricing Engine

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 28-29 | Build PricingEngine core | Backend | Base rate + adders |
| 28-29 | Implement rate card management | Backend | Pricing card storage |
| 30-31 | Build rate lock functionality | Backend | Lock API |
| 30-31 | Create pricing management UI | Frontend | Rate card editor |
| 32 | Scenario calculator | Backend | What-if analysis |

**Exit Criteria:**
- [ ] Pricing calculates correctly per rate card
- [ ] All adders apply correctly
- [ ] Rate locks function with expiration
- [ ] Lock status syncs to Encompass

### Week 7: Condition Automation

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 33-34 | Build ConditionManager | Backend | Condition lifecycle |
| 33-34 | Implement auto-generation from rules | Backend | Rule → Condition |
| 35-36 | Build auto-clear logic | Backend | Document → Clear |
| 35-36 | Create condition tracking UI | Frontend | Condition dashboard |
| 37 | Encompass condition sync | Backend | Bidirectional sync |

**Exit Criteria:**
- [ ] Conditions auto-generate from failed rules
- [ ] Conditions auto-clear when requirements met
- [ ] Conditions sync bidirectionally with Encompass
- [ ] Re-clear works when data changes

### Week 8: Document Management

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 38-39 | Build document upload API | Backend | S3 storage |
| 38-39 | Implement document classification | Backend | ML classification |
| 40-41 | Create borrower document portal | Frontend | Upload UI |
| 40-41 | Build document review queue | Frontend | Classification review |
| 42-44 | Encompass document sync | Backend | eFolder integration |

**Exit Criteria:**
- [ ] Documents upload to S3 with metadata
- [ ] Auto-classification accuracy > 80%
- [ ] Documents sync to Encompass eFolder
- [ ] Document receipt triggers condition clearing

### Phase 2 Success Metrics

| Metric | Target |
|--------|--------|
| Auto-decision rate (qualified loans) | > 70% |
| Rule evaluation time | < 500ms |
| Pricing calculation time | < 200ms |
| Condition auto-clear rate | > 60% |
| Document classification accuracy | > 80% |

---

## Phase 3: Scale & Production (Days 61-90)

### Week 9: Processing & Closing Workflow

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 45-46 | Build milestone automation | Backend | Auto-advance logic |
| 45-46 | Implement task management | Backend | Workflow tasks |
| 47-48 | Create processor workbench | Frontend | Task queue UI |
| 47-48 | Integrate title ordering | Backend | Title vendor API |
| 49 | Integrate closing service | Backend | Closing doc generation |

**Exit Criteria:**
- [ ] Milestones auto-advance when criteria met
- [ ] Tasks assign to appropriate roles
- [ ] Title orders flow through platform
- [ ] Closing docs generate from Encompass

### Week 10: Post-Close & Investor

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 50-51 | Build post-close QC workflow | Backend | QC checklist |
| 50-51 | Implement investor data mapping | Backend | ULDD export |
| 52-53 | Create investor delivery | Backend | Delivery API |
| 52-53 | Build reporting dashboards | Frontend | Analytics |
| 54 | Document remediation workflow | Backend | Exception handling |

**Exit Criteria:**
- [ ] Post-close QC runs automatically
- [ ] Investor data exports correctly
- [ ] Reporting shows key metrics
- [ ] Remediation workflow handles exceptions

### Week 11: Performance & Reliability

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 55-56 | Load testing | QA | Performance baseline |
| 55-56 | Performance optimization | Backend | Query optimization |
| 57-58 | Set up DR environment | DevOps | Failover capability |
| 57-58 | Implement circuit breakers | Backend | Failure handling |
| 59 | Security audit | Security | Penetration test |

**Exit Criteria:**
- [ ] System handles 100 concurrent users
- [ ] P95 API latency < 500ms
- [ ] DR failover tested successfully
- [ ] No critical security findings

### Week 12: Production Launch

| Day | Task | Owner | Deliverable |
|-----|------|-------|-------------|
| 60-61 | Production deployment | DevOps | Live system |
| 60-61 | Data migration | Backend | Historical data |
| 62-63 | User training | Product | Training sessions |
| 62-63 | Runbook creation | DevOps | Operations docs |
| 64-65 | Monitored launch | All | First 10 loans |

**Exit Criteria:**
- [ ] Production environment stable
- [ ] All users trained
- [ ] First 10 loans processed successfully
- [ ] Monitoring alerting correctly
- [ ] Support procedures documented

### Phase 3 Success Metrics

| Metric | Target |
|--------|--------|
| End-to-end cycle time (auto-qualified) | < 4 hours |
| System uptime | > 99.9% |
| Encompass sync lag (P95) | < 30 seconds |
| Support ticket rate | < 5% of loans |
| User satisfaction (NPS) | > 40 |

---

## Team Structure

### Core Team (Required from Day 1)

| Role | Count | Responsibilities |
|------|-------|------------------|
| Tech Lead | 1 | Architecture, code review, Encompass integration |
| Senior Backend Engineer | 2 | Services, APIs, integrations |
| Frontend Engineer | 1 | LO portal, UW workbench, admin UIs |
| DevOps Engineer | 1 | Infrastructure, CI/CD, monitoring |
| QA Engineer | 1 | Testing, automation, quality |

### Extended Team (Added in Phase 2-3)

| Role | When | Responsibilities |
|------|------|------------------|
| ML Engineer | Week 5 | Document classification, scoring models |
| Security Engineer | Week 10 | Security audit, compliance |
| Product Manager | Throughout | Requirements, priorities, stakeholder mgmt |

---

## Risk Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Encompass API rate limits | Medium | High | Implement queuing, caching, batch updates |
| AVM vendor downtime | Medium | Medium | Multi-vendor cascade, graceful degradation |
| Credit vendor integration delays | Low | High | Start integration early, have backup vendor |
| Performance under load | Medium | High | Load test early and often |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Regulatory changes | Low | High | Modular rules engine, quick updates |
| Pricing card errors | Medium | High | Approval workflow, automated testing |
| Data quality issues | High | Medium | Validation at intake, exception handling |

---

## Dependencies

### External Dependencies

| Dependency | Required By | Status |
|------------|-------------|--------|
| Encompass API access | Day 6 | In progress |
| MeridianLink credentials | Day 16 | Pending |
| CoreLogic API key | Day 18 | Pending |
| AWS account setup | Day 1 | Complete |

### Internal Dependencies

| Dependency | Required By | Owner |
|------------|-------------|-------|
| Business rules sign-off | Day 23 | Credit |
| Pricing card approval | Day 28 | Capital Markets |
| User acceptance testing | Day 60 | Operations |
| Training materials | Day 62 | Product |

---

## Go/No-Go Criteria

### Phase Gate: End of Phase 1

- [ ] 5+ loans processed end-to-end (with manual UW)
- [ ] Encompass sync working reliably
- [ ] No critical bugs open
- [ ] Credit and AVM integrations stable

### Phase Gate: End of Phase 2

- [ ] 25+ loans processed
- [ ] Auto-decision rate > 50%
- [ ] No blocking issues
- [ ] User acceptance sign-off

### Production Launch Gate

- [ ] 50+ loans processed without critical issues
- [ ] All security items addressed
- [ ] DR tested successfully
- [ ] Operations team trained
- [ ] Support procedures documented
