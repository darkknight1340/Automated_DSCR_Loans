'use client';

import { Button } from '@/components/ui/button';
import { LeadTable } from '@/components/leads/LeadTable';
import { Plus, Download } from 'lucide-react';
import type { Lead, LeadStatus } from '@/types';

// Mock data - will be replaced with API calls
const mockLeads: Lead[] = [
  {
    id: '1',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@email.com',
    phone: '(555) 123-4567',
    status: 'NEW',
    source: 'PAID_AD',
    score: 85,
    propertyState: 'TX',
    estimatedLoanAmount: 45000000,
    estimatedPropertyValue: 60000000,
    estimatedDSCR: 1.35,
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'dscr_loans_2024',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
  },
  {
    id: '2',
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah.j@email.com',
    phone: '(555) 234-5678',
    status: 'CONTACTED',
    source: 'REFERRAL',
    score: 72,
    propertyState: 'FL',
    estimatedLoanAmount: 38500000,
    estimatedPropertyValue: 55000000,
    createdAt: '2024-01-14T14:20:00Z',
    updatedAt: '2024-01-15T09:00:00Z',
    lastContactedAt: '2024-01-15T09:00:00Z',
  },
  {
    id: '3',
    firstName: 'Michael',
    lastName: 'Brown',
    email: 'mbrown@email.com',
    status: 'QUALIFIED',
    source: 'WEBSITE',
    score: 91,
    propertyState: 'CA',
    estimatedLoanAmount: 72000000,
    estimatedPropertyValue: 90000000,
    estimatedDSCR: 1.42,
    createdAt: '2024-01-12T08:15:00Z',
    updatedAt: '2024-01-14T16:30:00Z',
  },
  {
    id: '4',
    firstName: 'Emily',
    lastName: 'Davis',
    email: 'emily.davis@email.com',
    phone: '(555) 345-6789',
    status: 'APPLICATION_STARTED',
    source: 'ORGANIC',
    score: 68,
    propertyState: 'AZ',
    estimatedLoanAmount: 32000000,
    createdAt: '2024-01-10T11:45:00Z',
    updatedAt: '2024-01-13T10:20:00Z',
  },
  {
    id: '5',
    firstName: 'Robert',
    lastName: 'Wilson',
    email: 'rwilson@email.com',
    status: 'NURTURING',
    source: 'PARTNER',
    score: 45,
    propertyState: 'GA',
    estimatedLoanAmount: 28000000,
    createdAt: '2024-01-08T09:00:00Z',
    updatedAt: '2024-01-12T14:00:00Z',
  },
  {
    id: '6',
    firstName: 'Jennifer',
    lastName: 'Martinez',
    email: 'jmartinez@email.com',
    phone: '(555) 456-7890',
    status: 'NEW',
    source: 'PAID_AD',
    score: 78,
    propertyState: 'TX',
    estimatedLoanAmount: 52000000,
    estimatedPropertyValue: 68000000,
    utmSource: 'facebook',
    utmMedium: 'cpc',
    createdAt: '2024-01-16T08:00:00Z',
    updatedAt: '2024-01-16T08:00:00Z',
  },
  {
    id: '7',
    firstName: 'David',
    lastName: 'Anderson',
    email: 'david.a@email.com',
    status: 'DISQUALIFIED',
    source: 'WEBSITE',
    score: 22,
    propertyState: 'NY',
    estimatedLoanAmount: 15000000,
    notes: 'Property in non-eligible state',
    createdAt: '2024-01-05T13:30:00Z',
    updatedAt: '2024-01-07T09:15:00Z',
  },
  {
    id: '8',
    firstName: 'Lisa',
    lastName: 'Thomas',
    email: 'lisa.thomas@email.com',
    phone: '(555) 567-8901',
    status: 'CONTACTED',
    source: 'BROKER',
    score: 65,
    propertyState: 'NC',
    estimatedLoanAmount: 41000000,
    createdAt: '2024-01-13T15:20:00Z',
    updatedAt: '2024-01-15T11:00:00Z',
    lastContactedAt: '2024-01-15T11:00:00Z',
  },
];

export default function LeadsPage() {
  const handleStatusChange = (id: string, status: LeadStatus) => {
    console.log('Status change:', id, status);
    // TODO: Call API to update status
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leads</h2>
          <p className="text-muted-foreground">
            Manage and track your lead pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Lead
          </Button>
        </div>
      </div>

      <LeadTable leads={mockLeads} onStatusChange={handleStatusChange} />
    </div>
  );
}
