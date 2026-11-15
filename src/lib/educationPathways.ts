export const EDUCATION_STAGES = ["Primary","Secondary High","High School","Matric","Tertiary"] as const;
export const STAGE_DESCRIPTIONS: Record<string,string> = {
  Primary: "Primary education · Grades 1–7",
  "Secondary High": "Junior secondary · Forms 1–3",
  "High School": "Senior high school · Forms 4–5",
  Matric: "Matric / Sixth Form · Form 6 or equivalent",
  Tertiary: "University, college or technical institute",
};
export const TERTIARY_INSTITUTION_TYPES = ["University","College","Technical / TVET","Other"] as const;
export const TERTIARY_QUALIFICATIONS = ["Certificate","Higher Certificate","Diploma","Advanced Diploma","Associate Degree","Bachelor's Degree","Honours Degree","Postgraduate Certificate","Postgraduate Diploma","Master's Degree","Doctorate / PhD","Other"] as const;
export const SCHOOL_INSTITUTION_TYPE = "School";
const GRADES: Record<string,string[]> = {
  Primary:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7"],
  "Secondary High":["Form 1","Form 2","Form 3"],
  "High School":["Form 4","Form 5"],
  Matric:["Form 6","Sixth Form","A-Level","IB Diploma","Pre-University"],
  Tertiary:["Year 1","Year 2","Year 3","Year 4","Year 5","Year 6","Semester 1","Semester 2","Semester 3","Semester 4","Semester 5","Semester 6","Research / Thesis"],
};
export function gradeOptionsFor(level:string):string[]{return GRADES[level]??[];}
export function isTertiaryStage(level:string):boolean{return level==="Tertiary";}
