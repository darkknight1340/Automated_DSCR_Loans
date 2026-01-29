import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LeadStatus, ApplicationStatus, Milestone, TaskStatus, ConditionStatus } from '@/types';

type StatusType = LeadStatus | ApplicationStatus | Milestone | TaskStatus | ConditionStatus | string;

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  // Lead statuses
  NEW: { label: 'New', variant: 'default', className: 'bg-blue-500' },
  CONTACTED: { label: 'Contacted', variant: 'secondary' },
  QUALIFIED: { label: 'Qualified', variant: 'default', className: 'bg-green-500' },
  NURTURING: { label: 'Nurturing', variant: 'secondary' },
  APPLICATION_STARTED: { label: 'App Started', variant: 'default', className: 'bg-purple-500' },
  CONVERTED: { label: 'Converted', variant: 'default', className: 'bg-green-600' },
  DISQUALIFIED: { label: 'Disqualified', variant: 'destructive' },
  DEAD: { label: 'Dead', variant: 'outline' },

  // Application statuses
  ACTIVE: { label: 'Active', variant: 'default', className: 'bg-blue-500' },
  APPROVED: { label: 'Approved', variant: 'default', className: 'bg-green-600' },
  DENIED: { label: 'Denied', variant: 'destructive' },
  WITHDRAWN: { label: 'Withdrawn', variant: 'outline' },
  SUSPENDED: { label: 'Suspended', variant: 'secondary' },

  // Milestones
  STARTED: { label: 'Started', variant: 'secondary' },
  APPLICATION: { label: 'Application', variant: 'default', className: 'bg-blue-400' },
  PRE_APPROVED: { label: 'Pre-Approved', variant: 'default', className: 'bg-blue-500' },
  PROCESSING: { label: 'Processing', variant: 'default', className: 'bg-indigo-500' },
  SUBMITTED: { label: 'Submitted', variant: 'default', className: 'bg-indigo-600' },
  CONDITIONALLY_APPROVED: { label: 'Cond. Approved', variant: 'default', className: 'bg-purple-500' },
  DOCS_OUT: { label: 'Docs Out', variant: 'default', className: 'bg-purple-600' },
  DOCS_BACK: { label: 'Docs Back', variant: 'default', className: 'bg-violet-500' },
  CLEAR_TO_CLOSE: { label: 'CTC', variant: 'default', className: 'bg-violet-600' },
  CLOSING: { label: 'Closing', variant: 'default', className: 'bg-emerald-500' },
  FUNDED: { label: 'Funded', variant: 'default', className: 'bg-green-600' },
  COMPLETION: { label: 'Complete', variant: 'default', className: 'bg-green-700' },

  // Task statuses
  PENDING: { label: 'Pending', variant: 'secondary' },
  IN_PROGRESS: { label: 'In Progress', variant: 'default', className: 'bg-blue-500' },
  COMPLETED: { label: 'Completed', variant: 'default', className: 'bg-green-500' },
  BLOCKED: { label: 'Blocked', variant: 'destructive' },
  CANCELLED: { label: 'Cancelled', variant: 'outline' },

  // Condition statuses
  RECEIVED: { label: 'Received', variant: 'secondary' },
  UNDER_REVIEW: { label: 'Under Review', variant: 'default', className: 'bg-yellow-500' },
  CLEARED: { label: 'Cleared', variant: 'default', className: 'bg-green-500' },
  WAIVED: { label: 'Waived', variant: 'secondary' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: 'outline' as const };

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
