'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MilestoneTracker } from '@/components/applications/MilestoneTracker';
import { DSCRGauge, DSCRBreakdown } from '@/components/applications/DSCRGauge';
import {
  ArrowLeft,
  Building2,
  DollarSign,
  User,
  FileText,
  Clock,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Application, Condition, Document as DocType } from '@/types';

// Mock data - will be replaced with API call
const mockApplication: Application = {
  id: 'app-001',
  leadId: 'lead-001',
  encompassLoanId: 'ENC-2024-0123',
  loanNumber: '2024-0123',
  status: 'ACTIVE',
  milestone: 'PROCESSING',
  property: {
    address: '123 Main Street',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    county: 'Travis',
    propertyType: 'SFR',
    units: 1,
    yearBuilt: 2015,
    squareFeet: 2400,
    currentValue: 60000000,
    purchasePrice: 55000000,
  },
  loanTerms: {
    loanAmountCents: 45000000,
    interestRate: 7.25,
    loanTermMonths: 360,
    amortizationMonths: 360,
    loanPurpose: 'CASH_OUT_REFINANCE',
    occupancyType: 'INVESTMENT',
  },
  dscrCalculation: {
    grossRentalIncomeCents: 4800000,
    vacancyRate: 0.05,
    effectiveGrossIncomeCents: 4560000,
    annualTaxesCents: 1200000,
    annualInsuranceCents: 180000,
    annualHOACents: 0,
    floodInsuranceCents: 0,
    monthlyPITIACents: 306900,
    monthlyNOICents: 380000,
    dscr: 1.24,
    dscrTier: 'GOOD',
  },
  ltv: 0.75,
  cltv: 0.75,
  creditScore: 742,
  assignedLOId: 'lo-001',
  assignedLO: { id: 'lo-001', firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.j@example.com', role: 'LOAN_OFFICER', createdAt: '' },
  assignedProcessorId: 'proc-001',
  assignedProcessor: { id: 'proc-001', firstName: 'Emily', lastName: 'Davis', email: 'emily.d@example.com', role: 'PROCESSOR', createdAt: '' },
  conditionCounts: { total: 8, pending: 3, cleared: 4, waived: 1 },
  createdAt: '2024-01-10T10:00:00Z',
  updatedAt: '2024-01-16T14:30:00Z',
  milestoneUpdatedAt: '2024-01-14T09:00:00Z',
};

const mockConditions: Condition[] = [
  { id: 'c1', applicationId: 'app-001', code: 'PTD-001', description: 'Signed 1003 Application', category: 'PTD', status: 'CLEARED', clearedAt: '2024-01-12T10:00:00Z', createdAt: '' },
  { id: 'c2', applicationId: 'app-001', code: 'PTD-002', description: 'Executed Lease Agreement (12 months)', category: 'PTD', status: 'CLEARED', clearedAt: '2024-01-13T14:00:00Z', createdAt: '' },
  { id: 'c3', applicationId: 'app-001', code: 'PTD-003', description: 'Current Rent Roll', category: 'PTD', status: 'PENDING', createdAt: '' },
  { id: 'c4', applicationId: 'app-001', code: 'PTC-001', description: 'Property Insurance Binder', category: 'PTC', status: 'PENDING', createdAt: '' },
  { id: 'c5', applicationId: 'app-001', code: 'PTC-002', description: 'Title Commitment', category: 'PTC', status: 'CLEARED', clearedAt: '2024-01-15T09:00:00Z', createdAt: '' },
  { id: 'c6', applicationId: 'app-001', code: 'PTF-001', description: 'Wire Instructions', category: 'PTF', status: 'PENDING', createdAt: '' },
  { id: 'c7', applicationId: 'app-001', code: 'PTD-004', description: 'Bank Statements (2 months)', category: 'PTD', status: 'CLEARED', clearedAt: '2024-01-11T16:00:00Z', createdAt: '' },
  { id: 'c8', applicationId: 'app-001', code: 'PTD-005', description: 'Entity Documents', category: 'PTD', status: 'WAIVED', notes: 'Individual borrower', createdAt: '' },
];

const mockDocuments: DocType[] = [
  { id: 'd1', applicationId: 'app-001', type: 'APPLICATION', name: '1003 Application.pdf', status: 'APPROVED', uploadedAt: '2024-01-10T10:00:00Z' },
  { id: 'd2', applicationId: 'app-001', type: 'LEASE_AGREEMENT', name: 'Lease_123Main.pdf', status: 'APPROVED', uploadedAt: '2024-01-12T14:00:00Z' },
  { id: 'd3', applicationId: 'app-001', type: 'BANK_STATEMENT', name: 'BankStmt_Dec2023.pdf', status: 'APPROVED', uploadedAt: '2024-01-11T11:00:00Z' },
  { id: 'd4', applicationId: 'app-001', type: 'BANK_STATEMENT', name: 'BankStmt_Nov2023.pdf', status: 'APPROVED', uploadedAt: '2024-01-11T11:00:00Z' },
  { id: 'd5', applicationId: 'app-001', type: 'APPRAISAL', name: 'Appraisal_123Main.pdf', status: 'UNDER_REVIEW', uploadedAt: '2024-01-15T09:00:00Z' },
];

const formatCurrency = (cents?: number) => {
  if (!cents) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

export default function ApplicationDetailPage() {
  const router = useRouter();
  // TODO: Replace with API call using params.id
  const app = mockApplication;

  const pendingConditions = mockConditions.filter((c) => c.status === 'PENDING');
  const clearedConditions = mockConditions.filter((c) => c.status === 'CLEARED');
  const waivedConditions = mockConditions.filter((c) => c.status === 'WAIVED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Loan #{app.loanNumber}</h2>
            <StatusBadge status={app.status} />
            <StatusBadge status={app.milestone} />
          </div>
          <p className="text-muted-foreground">
            {app.property.address}, {app.property.city}, {app.property.state} {app.property.zipCode}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">View in Encompass</Button>
          <Button>Advance Milestone</Button>
        </div>
      </div>

      {/* Milestone Tracker */}
      <Card>
        <CardContent className="pt-6">
          <MilestoneTracker currentMilestone={app.milestone} />
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Loan Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(app.loanTerms.loanAmountCents)}</div>
            <p className="text-sm text-muted-foreground">{app.loanTerms.interestRate}% / {app.loanTerms.loanTermMonths / 12}yr</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">DSCR</CardTitle>
          </CardHeader>
          <CardContent>
            {app.dscrCalculation && (
              <DSCRGauge dscr={app.dscrCalculation.dscr} size="lg" showLabel />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">LTV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{app.ltv ? `${(app.ltv * 100).toFixed(1)}%` : '-'}</div>
            <p className="text-sm text-muted-foreground">Max 80%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Credit Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{app.creditScore || '-'}</div>
            <p className="text-sm text-muted-foreground">Min 660</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="dscr">DSCR</TabsTrigger>
          <TabsTrigger value="conditions">
            Conditions
            {pendingConditions.length > 0 && (
              <Badge variant="secondary" className="ml-2">{pendingConditions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Property Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Property Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Address</span>
                  <span className="text-right">
                    {app.property.address}<br />
                    {app.property.city}, {app.property.state} {app.property.zipCode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Property Type</span>
                  <span>{app.property.propertyType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Units</span>
                  <span>{app.property.units}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Year Built</span>
                  <span>{app.property.yearBuilt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Square Feet</span>
                  <span>{app.property.squareFeet?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Value</span>
                  <span className="font-medium">{formatCurrency(app.property.currentValue)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Loan Terms */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Loan Terms
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loan Amount</span>
                  <span className="font-medium">{formatCurrency(app.loanTerms.loanAmountCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest Rate</span>
                  <span>{app.loanTerms.interestRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Term</span>
                  <span>{app.loanTerms.loanTermMonths / 12} years</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amortization</span>
                  <span>{app.loanTerms.amortizationMonths / 12} years</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Purpose</span>
                  <span>{app.loanTerms.loanPurpose.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Occupancy</span>
                  <span>{app.loanTerms.occupancyType}</span>
                </div>
              </CardContent>
            </Card>

            {/* Team */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Team
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Loan Officer</p>
                  <p className="font-medium">{app.assignedLO?.firstName} {app.assignedLO?.lastName}</p>
                  <p className="text-sm text-muted-foreground">{app.assignedLO?.email}</p>
                </div>
                {app.assignedProcessor && (
                  <div>
                    <p className="text-sm text-muted-foreground">Processor</p>
                    <p className="font-medium">{app.assignedProcessor.firstName} {app.assignedProcessor.lastName}</p>
                    <p className="text-sm text-muted-foreground">{app.assignedProcessor.email}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{format(new Date(app.createdAt), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Milestone Updated</span>
                  <span>{format(new Date(app.milestoneUpdatedAt), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span>{format(new Date(app.updatedAt), 'MMM d, yyyy h:mm a')}</span>
                </div>
                {app.encompassLoanId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Encompass ID</span>
                    <span className="font-mono text-sm">{app.encompassLoanId}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="dscr">
          <Card>
            <CardContent className="pt-6">
              {app.dscrCalculation && (
                <DSCRBreakdown
                  grossRentalIncome={app.dscrCalculation.grossRentalIncomeCents}
                  vacancyRate={app.dscrCalculation.vacancyRate}
                  annualTaxes={app.dscrCalculation.annualTaxesCents}
                  annualInsurance={app.dscrCalculation.annualInsuranceCents}
                  annualHOA={app.dscrCalculation.annualHOACents}
                  monthlyPITIA={app.dscrCalculation.monthlyPITIACents}
                  dscr={app.dscrCalculation.dscr}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conditions" className="space-y-4">
          {/* Condition Progress */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Condition Progress</span>
                  <span>{clearedConditions.length + waivedConditions.length} of {mockConditions.length} complete</span>
                </div>
                <Progress
                  value={((clearedConditions.length + waivedConditions.length) / mockConditions.length) * 100}
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Pending Conditions */}
          {pendingConditions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-600">
                  <Clock className="h-5 w-5" />
                  Pending Conditions ({pendingConditions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingConditions.map((condition) => (
                    <div key={condition.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{condition.description}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="outline">{condition.code}</Badge>
                          <Badge variant="secondary">{condition.category}</Badge>
                        </div>
                      </div>
                      <Button size="sm">Clear</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cleared Conditions */}
          {clearedConditions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  Cleared Conditions ({clearedConditions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {clearedConditions.map((condition) => (
                    <div key={condition.id} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
                      <div>
                        <p className="font-medium">{condition.description}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="outline">{condition.code}</Badge>
                          <Badge variant="secondary">{condition.category}</Badge>
                          {condition.clearedAt && (
                            <span>Cleared {format(new Date(condition.clearedAt), 'MMM d')}</span>
                          )}
                        </div>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Documents</CardTitle>
                <Button>Upload Document</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="outline">{doc.type.replace(/_/g, ' ')}</Badge>
                          {doc.uploadedAt && (
                            <span>Uploaded {format(new Date(doc.uploadedAt), 'MMM d, yyyy')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={doc.status} />
                      <Button variant="ghost" size="sm">View</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
