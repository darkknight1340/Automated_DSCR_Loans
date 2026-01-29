import { cn } from '@/lib/utils';

interface LeadScoreIndicatorProps {
  score: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-emerald-400';
  if (score >= 40) return 'bg-yellow-400';
  if (score >= 20) return 'bg-orange-400';
  return 'bg-red-500';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Hot';
  if (score >= 60) return 'Warm';
  if (score >= 40) return 'Lukewarm';
  if (score >= 20) return 'Cool';
  return 'Cold';
}

export function LeadScoreIndicator({ score, showLabel = false, size = 'md' }: LeadScoreIndicatorProps) {
  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex items-center justify-center rounded-full font-medium text-white',
          getScoreColor(score),
          sizeClasses[size]
        )}
        title={`Lead Score: ${score}`}
      >
        {score}
      </div>
      {showLabel && (
        <span className="text-sm text-muted-foreground">{getScoreLabel(score)}</span>
      )}
    </div>
  );
}
