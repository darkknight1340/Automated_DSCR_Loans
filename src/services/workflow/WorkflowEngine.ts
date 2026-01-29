/**
 * Workflow Engine
 *
 * Manages the loan processing workflow, task assignment, milestone
 * tracking, and SLA monitoring for DSCR loans.
 *
 * Key Workflows:
 * - Lead → Application conversion
 * - Pre-approval → Processing
 * - Processing → Underwriting
 * - Underwriting → Closing
 * - Closing → Funding
 * - Post-close
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type MilestoneCode =
  | 'STARTED'
  | 'APPLICATION'
  | 'PRE_APPROVED'
  | 'PROCESSING'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'DOCS_OUT'
  | 'CLEAR_TO_CLOSE'
  | 'CLOSING'
  | 'FUNDED'
  | 'COMPLETION'
  | 'SUSPENDED'
  | 'WITHDRAWN'
  | 'DENIED';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'BLOCKED';
export type TaskPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AssigneeRole = 'LO' | 'LOA' | 'PROCESSOR' | 'UNDERWRITER' | 'CLOSER' | 'POST_CLOSER';

export interface Milestone {
  code: MilestoneCode;
  name: string;
  description: string;
  order: number;
  isTerminal: boolean;
  prerequisites: MilestonePrerequisite[];
  autoAdvanceEnabled: boolean;
  slaHours?: number;
}

export interface MilestonePrerequisite {
  type: 'MILESTONE' | 'CONDITION_CATEGORY' | 'TASK' | 'DATA_FIELD' | 'DECISION';
  code: string;
  description: string;
  required: boolean;
}

export interface MilestoneHistory {
  id: string;
  applicationId: string;
  milestone: MilestoneCode;
  enteredAt: Date;
  exitedAt?: Date;
  durationHours?: number;
  triggeredBy: 'SYSTEM' | 'USER';
  userId?: string;
  notes?: string;
}

export interface Task {
  id: string;
  applicationId: string;
  taskType: string;
  taskCode: string;
  title: string;
  description: string;

  // Assignment
  assignedRole: AssigneeRole;
  assignedUserId?: string;
  assignedUserName?: string;

  // Status
  status: TaskStatus;
  priority: TaskPriority;

  // Timing
  createdAt: Date;
  dueAt?: Date;
  startedAt?: Date;
  completedAt?: Date;

  // SLA
  slaHours?: number;
  slaBreached: boolean;
  slaBreachedAt?: Date;

  // Dependencies
  dependsOn?: string[];
  blockedBy?: string[];
  blockedReason?: string;

  // Completion
  completedBy?: string;
  completionNotes?: string;
  outcome?: 'SUCCESS' | 'FAILED' | 'WAIVED';

  // Audit
  updatedAt: Date;
}

export interface WorkflowState {
  applicationId: string;
  currentMilestone: MilestoneCode;
  previousMilestone?: MilestoneCode;
  milestoneEnteredAt: Date;
  milestoneHistory: MilestoneHistory[];
  activeTasks: Task[];
  completedTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  slaStatus: 'ON_TRACK' | 'AT_RISK' | 'BREACHED';
  nextMilestone?: MilestoneCode;
  readyForAdvance: boolean;
  advanceBlockers: string[];
}

// ============================================================================
// Milestone Definitions
// ============================================================================

export const DSCR_MILESTONES: Milestone[] = [
  {
    code: 'STARTED',
    name: 'Started',
    description: 'Loan file created',
    order: 1,
    isTerminal: false,
    prerequisites: [],
    autoAdvanceEnabled: true
  },
  {
    code: 'APPLICATION',
    name: 'Application',
    description: 'Application received',
    order: 2,
    isTerminal: false,
    prerequisites: [
      { type: 'DATA_FIELD', code: 'borrower.created', description: 'Borrower info captured', required: true },
      { type: 'DATA_FIELD', code: 'property.created', description: 'Property info captured', required: true }
    ],
    autoAdvanceEnabled: true
  },
  {
    code: 'PRE_APPROVED',
    name: 'Pre-Approved',
    description: 'Pre-approval decision issued',
    order: 3,
    isTerminal: false,
    prerequisites: [
      { type: 'DECISION', code: 'PRE_APPROVAL', description: 'Pre-approval decision', required: true },
      { type: 'DATA_FIELD', code: 'credit.completed', description: 'Credit report received', required: true },
      { type: 'DATA_FIELD', code: 'avm.completed', description: 'AVM received', required: true }
    ],
    autoAdvanceEnabled: true,
    slaHours: 4
  },
  {
    code: 'PROCESSING',
    name: 'Processing',
    description: 'Loan in processing',
    order: 4,
    isTerminal: false,
    prerequisites: [
      { type: 'MILESTONE', code: 'PRE_APPROVED', description: 'Pre-approval complete', required: true },
      { type: 'CONDITION_CATEGORY', code: 'PTD', description: 'All PTD conditions cleared', required: true }
    ],
    autoAdvanceEnabled: true,
    slaHours: 48
  },
  {
    code: 'SUBMITTED',
    name: 'Submitted to UW',
    description: 'Submitted to underwriting',
    order: 5,
    isTerminal: false,
    prerequisites: [
      { type: 'DATA_FIELD', code: 'appraisal.completed', description: 'Appraisal received', required: true },
      { type: 'DATA_FIELD', code: 'title.ordered', description: 'Title ordered', required: true },
      { type: 'TASK', code: 'PROC_CHECKLIST', description: 'Processing checklist complete', required: true }
    ],
    autoAdvanceEnabled: false,
    slaHours: 24
  },
  {
    code: 'APPROVED',
    name: 'Approved',
    description: 'UW approval issued',
    order: 6,
    isTerminal: false,
    prerequisites: [
      { type: 'DECISION', code: 'FINAL_APPROVAL', description: 'Final approval decision', required: true }
    ],
    autoAdvanceEnabled: false,
    slaHours: 24
  },
  {
    code: 'DOCS_OUT',
    name: 'Docs Out',
    description: 'Closing docs sent',
    order: 7,
    isTerminal: false,
    prerequisites: [
      { type: 'TASK', code: 'RATE_LOCK', description: 'Rate locked', required: true },
      { type: 'TASK', code: 'CLOSING_DOCS', description: 'Closing docs ordered', required: true }
    ],
    autoAdvanceEnabled: true,
    slaHours: 48
  },
  {
    code: 'CLEAR_TO_CLOSE',
    name: 'Clear to Close',
    description: 'All conditions cleared',
    order: 8,
    isTerminal: false,
    prerequisites: [
      { type: 'CONDITION_CATEGORY', code: 'PTC', description: 'All PTC conditions cleared', required: true },
      { type: 'DATA_FIELD', code: 'title.commitment', description: 'Final title commitment', required: true },
      { type: 'DATA_FIELD', code: 'insurance.binder', description: 'Insurance binder received', required: true }
    ],
    autoAdvanceEnabled: true,
    slaHours: 24
  },
  {
    code: 'CLOSING',
    name: 'Closing',
    description: 'At closing',
    order: 9,
    isTerminal: false,
    prerequisites: [
      { type: 'TASK', code: 'CLOSING_SCHEDULED', description: 'Closing scheduled', required: true }
    ],
    autoAdvanceEnabled: false
  },
  {
    code: 'FUNDED',
    name: 'Funded',
    description: 'Loan funded',
    order: 10,
    isTerminal: false,
    prerequisites: [
      { type: 'DATA_FIELD', code: 'funding.wire_sent', description: 'Wire sent', required: true },
      { type: 'DATA_FIELD', code: 'recording.confirmed', description: 'Recording confirmed', required: true }
    ],
    autoAdvanceEnabled: true
  },
  {
    code: 'COMPLETION',
    name: 'Completion',
    description: 'Loan complete',
    order: 11,
    isTerminal: true,
    prerequisites: [
      { type: 'TASK', code: 'POST_CLOSE_QC', description: 'Post-close QC complete', required: true }
    ],
    autoAdvanceEnabled: true
  },
  {
    code: 'SUSPENDED',
    name: 'Suspended',
    description: 'Loan suspended',
    order: 99,
    isTerminal: false,
    prerequisites: [],
    autoAdvanceEnabled: false
  },
  {
    code: 'WITHDRAWN',
    name: 'Withdrawn',
    description: 'Loan withdrawn',
    order: 100,
    isTerminal: true,
    prerequisites: [],
    autoAdvanceEnabled: false
  },
  {
    code: 'DENIED',
    name: 'Denied',
    description: 'Loan denied',
    order: 101,
    isTerminal: true,
    prerequisites: [],
    autoAdvanceEnabled: false
  }
];

// ============================================================================
// Task Templates
// ============================================================================

export interface TaskTemplate {
  taskCode: string;
  taskType: string;
  title: string;
  description: string;
  assignedRole: AssigneeRole;
  priority: TaskPriority;
  slaHours?: number;
  triggerMilestone: MilestoneCode;
  dependsOn?: string[];
}

export const DSCR_TASK_TEMPLATES: TaskTemplate[] = [
  // Pre-approval tasks
  {
    taskCode: 'INITIAL_CONTACT',
    taskType: 'COMMUNICATION',
    title: 'Initial Borrower Contact',
    description: 'Contact borrower to discuss loan terms and gather additional information',
    assignedRole: 'LO',
    priority: 'HIGH',
    slaHours: 4,
    triggerMilestone: 'STARTED'
  },
  {
    taskCode: 'VERIFY_RENT_ROLL',
    taskType: 'VERIFICATION',
    title: 'Verify Rent Roll',
    description: 'Verify rental income matches submitted rent roll',
    assignedRole: 'LOA',
    priority: 'MEDIUM',
    slaHours: 24,
    triggerMilestone: 'PRE_APPROVED'
  },

  // Processing tasks
  {
    taskCode: 'ORDER_APPRAISAL',
    taskType: 'VENDOR_ORDER',
    title: 'Order Appraisal',
    description: 'Order full interior appraisal from AMC',
    assignedRole: 'PROCESSOR',
    priority: 'HIGH',
    slaHours: 4,
    triggerMilestone: 'PROCESSING'
  },
  {
    taskCode: 'ORDER_TITLE',
    taskType: 'VENDOR_ORDER',
    title: 'Order Title',
    description: 'Order title search and commitment',
    assignedRole: 'PROCESSOR',
    priority: 'HIGH',
    slaHours: 4,
    triggerMilestone: 'PROCESSING'
  },
  {
    taskCode: 'PROC_CHECKLIST',
    taskType: 'CHECKLIST',
    title: 'Complete Processing Checklist',
    description: 'Complete all items on processing checklist before UW submission',
    assignedRole: 'PROCESSOR',
    priority: 'MEDIUM',
    slaHours: 72,
    triggerMilestone: 'PROCESSING',
    dependsOn: ['ORDER_APPRAISAL', 'ORDER_TITLE']
  },

  // UW tasks
  {
    taskCode: 'UW_REVIEW',
    taskType: 'REVIEW',
    title: 'Underwriting Review',
    description: 'Complete underwriting review and issue decision',
    assignedRole: 'UNDERWRITER',
    priority: 'HIGH',
    slaHours: 24,
    triggerMilestone: 'SUBMITTED'
  },

  // Closing tasks
  {
    taskCode: 'RATE_LOCK',
    taskType: 'ACTION',
    title: 'Lock Interest Rate',
    description: 'Lock interest rate per borrower instructions',
    assignedRole: 'LO',
    priority: 'HIGH',
    slaHours: 24,
    triggerMilestone: 'APPROVED'
  },
  {
    taskCode: 'CLOSING_DOCS',
    taskType: 'VENDOR_ORDER',
    title: 'Order Closing Docs',
    description: 'Order closing documents from doc provider',
    assignedRole: 'CLOSER',
    priority: 'HIGH',
    slaHours: 24,
    triggerMilestone: 'APPROVED',
    dependsOn: ['RATE_LOCK']
  },
  {
    taskCode: 'CLOSING_SCHEDULED',
    taskType: 'COORDINATION',
    title: 'Schedule Closing',
    description: 'Coordinate closing date with all parties',
    assignedRole: 'CLOSER',
    priority: 'HIGH',
    slaHours: 48,
    triggerMilestone: 'CLEAR_TO_CLOSE'
  },

  // Post-close tasks
  {
    taskCode: 'POST_CLOSE_QC',
    taskType: 'REVIEW',
    title: 'Post-Close QC Review',
    description: 'Complete post-close quality control review',
    assignedRole: 'POST_CLOSER',
    priority: 'MEDIUM',
    slaHours: 72,
    triggerMilestone: 'FUNDED'
  }
];

// ============================================================================
// Workflow Engine
// ============================================================================

export interface IWorkflowRepository {
  getMilestoneHistory(applicationId: string): Promise<MilestoneHistory[]>;
  saveMilestoneHistory(history: MilestoneHistory): Promise<void>;
  getTasks(applicationId: string): Promise<Task[]>;
  getTask(taskId: string): Promise<Task | null>;
  createTask(task: Task): Promise<Task>;
  updateTask(taskId: string, updates: Partial<Task>): Promise<Task>;
  findTasksByAssignee(userId: string): Promise<Task[]>;
}

export interface IConditionRepository {
  getOpenByCategory(applicationId: string, category: string): Promise<number>;
  getAllOpen(applicationId: string): Promise<number>;
}

export interface IDataStateChecker {
  check(applicationId: string, fieldCode: string): Promise<boolean>;
}

export interface IDecisionChecker {
  hasDecision(applicationId: string, decisionType: string): Promise<boolean>;
}

export interface IEncompassSync {
  updateMilestone(applicationId: string, milestone: MilestoneCode): Promise<void>;
}

export interface INotificationService {
  notifyTaskAssigned(task: Task): Promise<void>;
  notifySLABreach(task: Task): Promise<void>;
  notifyMilestoneAdvanced(applicationId: string, milestone: MilestoneCode): Promise<void>;
}

export class WorkflowEngine {
  private milestones: Map<MilestoneCode, Milestone>;
  private taskTemplates: Map<string, TaskTemplate>;

  constructor(
    private readonly workflowRepo: IWorkflowRepository,
    private readonly conditionRepo: IConditionRepository,
    private readonly dataChecker: IDataStateChecker,
    private readonly decisionChecker: IDecisionChecker,
    private readonly encompassSync: IEncompassSync,
    private readonly notifications: INotificationService
  ) {
    this.milestones = new Map(DSCR_MILESTONES.map(m => [m.code, m]));
    this.taskTemplates = new Map(DSCR_TASK_TEMPLATES.map(t => [t.taskCode, t]));
  }

  // -------------------------------------------------------------------------
  // Workflow State
  // -------------------------------------------------------------------------

  async getWorkflowState(applicationId: string): Promise<WorkflowState> {
    const history = await this.workflowRepo.getMilestoneHistory(applicationId);
    const tasks = await this.workflowRepo.getTasks(applicationId);

    // Find current milestone (most recent non-exited)
    const current = history
      .filter(h => !h.exitedAt)
      .sort((a, b) => b.enteredAt.getTime() - a.enteredAt.getTime())[0];

    const currentMilestone = current?.milestone ?? 'STARTED';
    const currentDef = this.milestones.get(currentMilestone)!;

    // Calculate task stats
    const activeTasks = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
    const now = new Date();
    const overdueTasks = activeTasks.filter(t => t.dueAt && t.dueAt < now);
    const blockedTasks = activeTasks.filter(t => t.status === 'BLOCKED');

    // Check if ready to advance
    const { ready, blockers } = await this.checkMilestonePrerequisites(
      applicationId,
      currentMilestone
    );

    // Determine next milestone
    const nextMilestone = this.getNextMilestone(currentMilestone);

    // Calculate SLA status
    let slaStatus: 'ON_TRACK' | 'AT_RISK' | 'BREACHED' = 'ON_TRACK';
    if (overdueTasks.length > 0) {
      slaStatus = 'BREACHED';
    } else if (currentDef.slaHours && current) {
      const hoursInMilestone = (now.getTime() - current.enteredAt.getTime()) / (1000 * 60 * 60);
      if (hoursInMilestone > currentDef.slaHours * 0.8) {
        slaStatus = 'AT_RISK';
      }
    }

    return {
      applicationId,
      currentMilestone,
      previousMilestone: history.length > 1 ? history[history.length - 2]?.milestone : undefined,
      milestoneEnteredAt: current?.enteredAt ?? new Date(),
      milestoneHistory: history,
      activeTasks,
      completedTasks: tasks.filter(t => t.status === 'COMPLETED').length,
      blockedTasks: blockedTasks.length,
      overdueTasks: overdueTasks.length,
      slaStatus,
      nextMilestone,
      readyForAdvance: ready,
      advanceBlockers: blockers
    };
  }

  // -------------------------------------------------------------------------
  // Milestone Management
  // -------------------------------------------------------------------------

  async advanceMilestone(
    applicationId: string,
    targetMilestone: MilestoneCode,
    triggeredBy: 'SYSTEM' | 'USER' = 'SYSTEM',
    userId?: string
  ): Promise<MilestoneHistory> {
    const currentState = await this.getWorkflowState(applicationId);
    const targetDef = this.milestones.get(targetMilestone);

    if (!targetDef) {
      throw new Error(`Unknown milestone: ${targetMilestone}`);
    }

    // Validate progression (unless terminal)
    if (!targetDef.isTerminal) {
      const currentDef = this.milestones.get(currentState.currentMilestone);
      if (currentDef && targetDef.order <= currentDef.order) {
        throw new Error(`Cannot advance backwards from ${currentState.currentMilestone} to ${targetMilestone}`);
      }
    }

    // Check prerequisites
    const { ready, blockers } = await this.checkMilestonePrerequisites(
      applicationId,
      currentState.currentMilestone
    );

    if (!ready && triggeredBy === 'SYSTEM') {
      throw new Error(`Prerequisites not met: ${blockers.join(', ')}`);
    }

    // Exit current milestone
    const now = new Date();
    const currentHistory = currentState.milestoneHistory.find(
      h => h.milestone === currentState.currentMilestone && !h.exitedAt
    );

    if (currentHistory) {
      currentHistory.exitedAt = now;
      currentHistory.durationHours = Math.round(
        (now.getTime() - currentHistory.enteredAt.getTime()) / (1000 * 60 * 60)
      );
      await this.workflowRepo.saveMilestoneHistory(currentHistory);
    }

    // Enter new milestone
    const newHistory: MilestoneHistory = {
      id: uuidv4(),
      applicationId,
      milestone: targetMilestone,
      enteredAt: now,
      triggeredBy,
      userId
    };

    await this.workflowRepo.saveMilestoneHistory(newHistory);

    // Sync to Encompass
    await this.encompassSync.updateMilestone(applicationId, targetMilestone);

    // Generate tasks for new milestone
    await this.generateTasksForMilestone(applicationId, targetMilestone);

    // Send notification
    await this.notifications.notifyMilestoneAdvanced(applicationId, targetMilestone);

    return newHistory;
  }

  async evaluateAutoAdvance(applicationId: string): Promise<{
    advanced: boolean;
    newMilestone?: MilestoneCode;
    reason?: string;
  }> {
    const state = await this.getWorkflowState(applicationId);
    const currentDef = this.milestones.get(state.currentMilestone);

    if (!currentDef?.autoAdvanceEnabled) {
      return { advanced: false, reason: 'Auto-advance disabled for current milestone' };
    }

    const nextMilestone = this.getNextMilestone(state.currentMilestone);
    if (!nextMilestone) {
      return { advanced: false, reason: 'No next milestone' };
    }

    const { ready, blockers } = await this.checkMilestonePrerequisites(
      applicationId,
      state.currentMilestone
    );

    if (!ready) {
      return { advanced: false, reason: `Prerequisites not met: ${blockers.join(', ')}` };
    }

    // Advance!
    await this.advanceMilestone(applicationId, nextMilestone, 'SYSTEM');

    return { advanced: true, newMilestone: nextMilestone };
  }

  private async checkMilestonePrerequisites(
    applicationId: string,
    currentMilestone: MilestoneCode
  ): Promise<{ ready: boolean; blockers: string[] }> {
    const nextMilestone = this.getNextMilestone(currentMilestone);
    if (!nextMilestone) {
      return { ready: false, blockers: ['No next milestone defined'] };
    }

    const nextDef = this.milestones.get(nextMilestone)!;
    const blockers: string[] = [];

    for (const prereq of nextDef.prerequisites.filter(p => p.required)) {
      let met = false;

      switch (prereq.type) {
        case 'MILESTONE': {
          const history = await this.workflowRepo.getMilestoneHistory(applicationId);
          met = history.some(h => h.milestone === prereq.code);
          break;
        }
        case 'CONDITION_CATEGORY': {
          const openCount = await this.conditionRepo.getOpenByCategory(
            applicationId,
            prereq.code
          );
          met = openCount === 0;
          break;
        }
        case 'TASK': {
          const tasks = await this.workflowRepo.getTasks(applicationId);
          const task = tasks.find(t => t.taskCode === prereq.code);
          met = task?.status === 'COMPLETED';
          break;
        }
        case 'DATA_FIELD': {
          met = await this.dataChecker.check(applicationId, prereq.code);
          break;
        }
        case 'DECISION': {
          met = await this.decisionChecker.hasDecision(applicationId, prereq.code);
          break;
        }
      }

      if (!met) {
        blockers.push(prereq.description);
      }
    }

    return { ready: blockers.length === 0, blockers };
  }

  private getNextMilestone(current: MilestoneCode): MilestoneCode | undefined {
    const currentDef = this.milestones.get(current);
    if (!currentDef || currentDef.isTerminal) return undefined;

    const sorted = [...this.milestones.values()]
      .filter(m => !m.isTerminal && m.order > currentDef.order)
      .sort((a, b) => a.order - b.order);

    return sorted[0]?.code;
  }

  // -------------------------------------------------------------------------
  // Task Management
  // -------------------------------------------------------------------------

  async createTask(
    applicationId: string,
    taskCode: string,
    overrides?: Partial<Task>
  ): Promise<Task> {
    const template = this.taskTemplates.get(taskCode);
    if (!template) {
      throw new Error(`Unknown task template: ${taskCode}`);
    }

    const now = new Date();
    const dueAt = template.slaHours
      ? new Date(now.getTime() + template.slaHours * 60 * 60 * 1000)
      : undefined;

    const task: Task = {
      id: uuidv4(),
      applicationId,
      taskCode: template.taskCode,
      taskType: template.taskType,
      title: template.title,
      description: template.description,
      assignedRole: template.assignedRole,
      status: 'PENDING',
      priority: template.priority,
      slaHours: template.slaHours,
      slaBreached: false,
      dependsOn: template.dependsOn,
      createdAt: now,
      dueAt,
      updatedAt: now,
      ...overrides
    };

    // Check dependencies
    if (task.dependsOn?.length) {
      const existingTasks = await this.workflowRepo.getTasks(applicationId);
      const incomplete = task.dependsOn.filter(dep => {
        const depTask = existingTasks.find(t => t.taskCode === dep);
        return !depTask || depTask.status !== 'COMPLETED';
      });

      if (incomplete.length > 0) {
        task.status = 'BLOCKED';
        task.blockedBy = incomplete;
        task.blockedReason = `Waiting for: ${incomplete.join(', ')}`;
      }
    }

    const created = await this.workflowRepo.createTask(task);

    // Notify assignee
    await this.notifications.notifyTaskAssigned(created);

    return created;
  }

  async startTask(taskId: string, userId: string): Promise<Task> {
    const task = await this.workflowRepo.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status === 'BLOCKED') {
      throw new Error(`Task is blocked: ${task.blockedReason}`);
    }

    return this.workflowRepo.updateTask(taskId, {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      assignedUserId: userId,
      updatedAt: new Date()
    });
  }

  async completeTask(
    taskId: string,
    userId: string,
    outcome: 'SUCCESS' | 'FAILED' | 'WAIVED',
    notes?: string
  ): Promise<Task> {
    const task = await this.workflowRepo.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updated = await this.workflowRepo.updateTask(taskId, {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedBy: userId,
      outcome,
      completionNotes: notes,
      updatedAt: new Date()
    });

    // Unblock dependent tasks
    await this.unblockDependentTasks(task.applicationId, task.taskCode);

    // Check for auto-advance
    await this.evaluateAutoAdvance(task.applicationId);

    return updated;
  }

  private async unblockDependentTasks(applicationId: string, completedTaskCode: string): Promise<void> {
    const tasks = await this.workflowRepo.getTasks(applicationId);
    const blockedTasks = tasks.filter(
      t => t.status === 'BLOCKED' && t.blockedBy?.includes(completedTaskCode)
    );

    for (const task of blockedTasks) {
      const newBlockedBy = task.blockedBy!.filter(b => b !== completedTaskCode);

      if (newBlockedBy.length === 0) {
        await this.workflowRepo.updateTask(task.id, {
          status: 'PENDING',
          blockedBy: undefined,
          blockedReason: undefined,
          updatedAt: new Date()
        });
      } else {
        await this.workflowRepo.updateTask(task.id, {
          blockedBy: newBlockedBy,
          blockedReason: `Waiting for: ${newBlockedBy.join(', ')}`,
          updatedAt: new Date()
        });
      }
    }
  }

  private async generateTasksForMilestone(
    applicationId: string,
    milestone: MilestoneCode
  ): Promise<void> {
    const templates = [...this.taskTemplates.values()].filter(
      t => t.triggerMilestone === milestone
    );

    for (const template of templates) {
      // Check if task already exists
      const existing = await this.workflowRepo.getTasks(applicationId);
      const exists = existing.some(t => t.taskCode === template.taskCode);

      if (!exists) {
        await this.createTask(applicationId, template.taskCode);
      }
    }
  }

  // -------------------------------------------------------------------------
  // SLA Monitoring
  // -------------------------------------------------------------------------

  async checkSLAs(applicationId: string): Promise<Task[]> {
    const tasks = await this.workflowRepo.getTasks(applicationId);
    const now = new Date();
    const breached: Task[] = [];

    for (const task of tasks) {
      if (
        task.status !== 'COMPLETED' &&
        task.status !== 'CANCELLED' &&
        task.dueAt &&
        task.dueAt < now &&
        !task.slaBreached
      ) {
        const updated = await this.workflowRepo.updateTask(task.id, {
          slaBreached: true,
          slaBreachedAt: now,
          updatedAt: now
        });

        breached.push(updated);
        await this.notifications.notifySLABreach(updated);
      }
    }

    return breached;
  }

  async getTaskQueue(
    userId: string,
    role?: AssigneeRole
  ): Promise<Task[]> {
    const allTasks = await this.workflowRepo.findTasksByAssignee(userId);

    let tasks = allTasks.filter(t =>
      t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
    );

    if (role) {
      tasks = tasks.filter(t => t.assignedRole === role);
    }

    // Sort by priority and due date
    const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    tasks.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      if (a.dueAt && b.dueAt) {
        return a.dueAt.getTime() - b.dueAt.getTime();
      }
      return 0;
    });

    return tasks;
  }
}

// ============================================================================
// Encompass Milestone Mapping
// ============================================================================

export const MILESTONE_ENCOMPASS_MAPPING: Record<MilestoneCode, string> = {
  STARTED: 'Started',
  APPLICATION: 'Application',
  PRE_APPROVED: 'Pre-Approved',
  PROCESSING: 'Processing',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  DOCS_OUT: 'Docs Out',
  CLEAR_TO_CLOSE: 'Clear to Close',
  CLOSING: 'Closing',
  FUNDED: 'Funded',
  COMPLETION: 'Completion',
  SUSPENDED: 'Suspended',
  WITHDRAWN: 'Withdrawn',
  DENIED: 'Denied'
};
