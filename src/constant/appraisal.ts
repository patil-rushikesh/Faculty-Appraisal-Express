import { type UserRole } from "./userInfo";

export const APPRAISAL_STATUS = ["DRAFT", "SUBMITTED", "VERIFIED", "APPROVED"] as const;
export type AppraisalStatus = typeof APPRAISAL_STATUS[number];

export const ADMIN_DESIGNATIONS = [
    "Director", 
    "Dean", 
    "Associate Dean", 
    "HOD", 
    "Associate Director"
  ] as const;
  
export const ACADEMIC_CADRES = [
    "Professor",
    "Associate Professor",
    "Assistant Professor"
  ] as const;

// Combined type to match frontend's DesignationValue
export const DESIGNATION_VALUES = [...ACADEMIC_CADRES, ...ADMIN_DESIGNATIONS] as const;
export type DesignationValue = typeof DESIGNATION_VALUES[number];
export const EVALUATOR_ROLES = ["associate_dean", "director", "hod", "dean"] as const satisfies readonly UserRole[];
export type EvaluatorRole = typeof EVALUATOR_ROLES[number];
