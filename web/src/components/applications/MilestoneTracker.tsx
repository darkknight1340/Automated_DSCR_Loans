'use client';

import { Check, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Milestone } from '@/types';

interface MilestoneTrackerProps {
  currentMilestone: Milestone;
  compact?: boolean;
}

const milestones: { key: Milestone; label: string }[] = [
  { key: 'STARTED', label: 'Started' },
  { key: 'APPLICATION', label: 'Application' },
  { key: 'PRE_APPROVED', label: 'Pre-Approved' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'CONDITIONALLY_APPROVED', label: 'Cond. Approved' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'DOCS_OUT', label: 'Docs Out' },
  { key: 'CLEAR_TO_CLOSE', label: 'CTC' },
  { key: 'CLOSING', label: 'Closing' },
  { key: 'FUNDED', label: 'Funded' },
];

const terminalMilestones: Milestone[] = ['DENIED', 'WITHDRAWN', 'COMPLETION'];

export function MilestoneTracker({ currentMilestone, compact = false }: MilestoneTrackerProps) {
  const currentIndex = milestones.findIndex((m) => m.key === currentMilestone);
  const isTerminal = terminalMilestones.includes(currentMilestone);

  if (compact) {
    // Compact view - just show current milestone and progress
    const progress = isTerminal ? 100 : Math.round((currentIndex / (milestones.length - 1)) * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 w-20 rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full',
              isTerminal && currentMilestone === 'FUNDED' ? 'bg-green-500' :
              isTerminal ? 'bg-red-500' : 'bg-primary'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{progress}%</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        {milestones.map((milestone, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;

          return (
            <div
              key={milestone.key}
              className="flex flex-col items-center"
              style={{ width: `${100 / milestones.length}%` }}
            >
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={cn(
                    'absolute h-0.5 -translate-y-1/2',
                    isCompleted || isCurrent ? 'bg-primary' : 'bg-muted'
                  )}
                  style={{
                    left: `${((index - 0.5) / milestones.length) * 100}%`,
                    width: `${100 / milestones.length}%`,
                    top: '14px',
                  }}
                />
              )}

              {/* Circle indicator */}
              <div
                className={cn(
                  'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2',
                  isCompleted && 'border-primary bg-primary text-primary-foreground',
                  isCurrent && 'border-primary bg-background',
                  isPending && 'border-muted bg-background'
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : isCurrent ? (
                  <Clock className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-3 w-3 text-muted-foreground" />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'mt-2 text-xs text-center',
                  isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {milestone.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Terminal state badge */}
      {isTerminal && (
        <div className="mt-4 text-center">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium',
              currentMilestone === 'FUNDED' && 'bg-green-100 text-green-700',
              currentMilestone === 'COMPLETION' && 'bg-green-100 text-green-700',
              currentMilestone === 'DENIED' && 'bg-red-100 text-red-700',
              currentMilestone === 'WITHDRAWN' && 'bg-gray-100 text-gray-700'
            )}
          >
            {currentMilestone}
          </span>
        </div>
      )}
    </div>
  );
}
