
export type FamilyMemberRole =
    | "PRIMARY_PARENT"
    | "CO_PARENT"
    | "CAREGIVER";

export type ResponsibilityPlanStatus =
    | "PENDING_ACCEPTANCE"
    | "SCHEDULED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED"
    | "DECLINED"
    | "NOT_STARTED";

export type HandoverType =
    | "IMMEDIATE"
    | "PLANNED"
    | "RETURN";

export interface ChildInfo {
    id: string;
    name: string;
    birth_date: string | null;
}

export interface CurrentResponsibility {
    current_responsible_id: string;
    responsible_user_id: string;
    responsible_role: FamilyMemberRole;
    started_at: string;
    version: number;
    updated_at: string;
}

export interface ActiveResponsibilityPeriod {
    id: string;
    responsible_id: string;
    actual_start_at: string;
    started_by: string;
}

export interface ResponsibilityPlan {
    id: string;
    responsible_id: string;
    responsible_user_id: string;
    responsible_role?: FamilyMemberRole;
    planned_start_at: string;
    planned_end_at: string;
    status: ResponsibilityPlanStatus;
    created_by?: string;
}

export interface PendingResponsibilityPlan {
    id: string;
    responsible_id: string;
    responsible_user_id: string;
    planned_start_at: string;
    planned_end_at: string;
    created_by: string;
    created_at: string;
}

export interface PendingHandover {
    id: string;
    from_parent_id: string | null;
    to_parent_id: string;
    initiated_by: string;
    type: HandoverType;
    requested_at: string;
}

export interface PlannedReliefWindow {
    status: "PLANNED";
    starts_at: string;
    ends_at: string;
    responsible_id: string;
    seconds_until_start: number;
}

export interface ResponsibilitySnapshot {
    child: ChildInfo;
    current_user_member_id: string;

    responsibility: CurrentResponsibility | null;
    active_period: ActiveResponsibilityPeriod | null;

    next_plan: ResponsibilityPlan | null;
    pending_plan: PendingResponsibilityPlan | null;
    pending_handover: PendingHandover | null;

    planned_relief_window: PlannedReliefWindow | null;

    server_time: string;
}
