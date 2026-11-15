export const EDUCATION_STAGES = ["Primary","Secondary High","High School","Matric","Tertiary"] as const;
export type EducationLevel = typeof EDUCATION_STAGES[number];

export const EDUCATION_PATHWAYS = [
  { value: "Primary", label: "Primary School", description: "Primary education · Grades 0–7" },
  { value: "Secondary High", label: "Secondary High", description: "Junior Secondary · Forms 1–3" },
  { value: "High School", label: "High School", description: "Senior Secondary · Forms 4–5" },
  { value: "Matric", label: "Matric / Form 6", description: "Advanced Studies / Sixth Form · where offered" },
  { value: "Tertiary", label: "Higher Education", description: "University, college and technical / TVET institutions" },
] as const;

export const STAGE_DESCRIPTIONS: Record<string,string> = Object.fromEntries(
  EDUCATION_PATHWAYS.map((stage) => [stage.value, stage.description])
);
export const STAGE_LABELS: Record<string,string> = Object.fromEntries(
  EDUCATION_PATHWAYS.map((stage) => [stage.value, stage.label])
);
export const TERTIARY_INSTITUTION_TYPES = ["University","College","Technical / TVET","Other"] as const;
export const TERTIARY_QUALIFICATIONS = [
  "Certificate","Higher Certificate","Diploma","Advanced Diploma","Associate Degree",
  "Bachelor's Degree","Honours Degree","Postgraduate Certificate","Postgraduate Diploma",
  "Master's Degree","Doctorate / PhD","Other",
] as const;
export const SCHOOL_INSTITUTION_TYPE = "School";
export const OTHER_GRADE_VALUE = "__other_grade__";

const GRADES: Record<string,string[]> = {
  Primary: Array.from({length:8},(_,index)=>"Grade "+index),
  "Secondary High":["Form 1","Form 2","Form 3"],
  "High School":["Form 4","Form 5"],
  Matric:["Form 6","Lower Sixth","Upper Sixth"],
  Tertiary:[
    "Year 1","Year 2","Year 3","Year 4","Year 5","Year 6",
    "Semester 1","Semester 2","Final year","Part-time / modular",
  ],
};
export function gradeOptionsFor(level:string):string[]{return GRADES[level]??[];}
export function isTertiaryStage(level:string):boolean{return level==="Tertiary";}
export function isEducationLevel(level:string):level is EducationLevel {
  return EDUCATION_STAGES.includes(level as EducationLevel);
}
export function educationLevelLabel(level:string):string{return STAGE_LABELS[level]??level;}
export function isStandardGrade(value:string,level:string):boolean{return gradeOptionsFor(level).includes(value);}
