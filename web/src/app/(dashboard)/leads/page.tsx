'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LeadTable } from '@/components/leads/LeadTable';
import { Plus, Download } from 'lucide-react';
import apiClient from '@/lib/api-client';
import type { Lead, LeadStatus } from '@/types';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getLeads({ pageSize: 100 })
      .then((res) => {
        setLeads(res.data as Lead[]);
      })
      .catch((err) => {
        console.error('Failed to fetch leads:', err);
        setLeads([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleStatusChange = (id: string, status: LeadStatus) => {
    console.log('Status change:', id, status);
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-lg border p-12 text-center">
          <p className="text-muted-foreground">No leads found. Process some properties through the pipeline first.</p>
        </div>
      ) : (
        <LeadTable leads={leads} onStatusChange={handleStatusChange} />
      )}
    </div>
  );
}
