export const EDUCATION_STAGES = ["Primary","Secondary High","High School","Matric","Tertiary"] as const;
export const STAGE_DESCRIPTIONS: Record<string,string> = {
  Primary: "Primary education · Grades 0–7",
  "Secondary High": "Junior secondary · Forms 1–3",
  "High School": "Senior high school · Forms 4–5",
  Matric: "Matric / Sixth Form · Form 6 or equivalent",
  Tertiary: "University, college or technical institute",
};
export const TERTIARY_INSTITUTION_TYPES = ["University","College","Technical / TVET","Other"] as const;
export const TERTIARY_QUALIFICATIONS = ["Certificate","Higher Certificate","Diploma","Advanced Diploma","Associate Degree","Bachelor's Degree","Honours Degree","Postgraduate Certificate","Postgraduate Diploma","Master's Degree","Doctorate / PhD","Other"] as const;
export const SCHOOL_INSTITUTION_TYPE = "School";
export const STANDARD_CURRICULA = [
  "Eswatini National Curriculum",
  "Eswatini Primary Certificate (EPC)",
  "Eswatini Primary School Assessment (EPSA)",
  "Eswatini Junior Certificate (JC)",
  "Eswatini General Certificate (EGCSE)",
  "IGCSE / Cambridge",
  "Cambridge Primary",
  "Cambridge Lower Secondary",
  "A-Level",
  "IB Diploma",
  "CAPS",
  "Other / Not sure",
  "Eswatini Qualifications Framework (ESQF)",
  "Other / International framework",
] as const;
export function curriculaForStage(level:string):string[] {
  if(level==="Primary")return ["Eswatini National Curriculum","Eswatini Primary Certificate (EPC)","Eswatini Primary School Assessment (EPSA)","Cambridge Primary","CAPS","Other / Not sure"];
  if(level==="Secondary High")return ["Eswatini Junior Certificate (JC)","Cambridge Lower Secondary","IGCSE / Cambridge","CAPS","Other / Not sure"];
  if(level==="High School")return ["Eswatini General Certificate (EGCSE)","IGCSE / Cambridge","CAPS","Other / Not sure"];
  if(level==="Matric")return ["A-Level","IB Diploma","Other / Not sure"];
  if(level==="Tertiary")return ["Eswatini Qualifications Framework (ESQF)","Other / International framework"];
  return [...STANDARD_CURRICULA];
}
export const ESWATINI_HIGHER_EDUCATION_INSTITUTIONS = [
  "University of Eswatini (UNESWA)","Matsapha Police Academy","William Pitcher Teacher Training College",
  "Ngwane Teacher Training College","Eswatini Institute of Management and Public Administration (EIMPA)",
  "Advanced School of Information Technology (ASIT)","Eswatini Medical Christian University (EMCU)",
  "Good Shepherd Catholic College of Health Sciences","Institute of Development Management (IDM)",
  "Limkokwing University","Southern Africa Nazarene University (SANU)","Amadi University College",
  "African Prime Institute of Science and Technology (APIST)","African Christian College","Botho University Eswatini Campus",
  "Bradford College","Centre for International Technology and Consultancy (CIT)",
  "Eastern and Southern African Management Institute (ESAMI)","Emergency Medical Rescue College (EMRC)",
  "Emmanuel Wesleyan Bible College","Institute of Research Management and Development (IRDM)",
  "Mananga Centre for Regional Integration and Management Development","Springfield Research University",
  "Eswatini College of Theology","Workers College","Soft-Tech College","NOSA","SHAK Enterprise","St John",
  "Bethel Vocational Centre","BSA Training Centre","Bosco Youth Agricultural Centre (BYAC)","Ngwane Park TVET",
  "SIMAVSHEQ","Solar Training and Renewable Energy Entrepreneurship Centre","Ubombo Technical College (U-TECH)",
  "Eswatini College of Technology (ECOT)","Eswatini Cooperative Development College (ECODEC)",
  "Gwamile Vocational and Commercial Training Institute",
] as const;
export const TERTIARY_PROGRAMME_SUGGESTIONS = [
  "Accounting","Agricultural and Biosystems Engineering","Agricultural Economics and Agribusiness Management",
  "Agricultural Education","Agricultural Extension","Agronomy","Animal Science","Bachelor of Arts in Humanities",
  "Bachelor of Commerce","Bachelor of Laws (LLB)","Bachelor of Nursing Science","Business Administration",
  "Business Management","Community Development","Computer Science","Cybersecurity and Network Forensics",
  "Data Science","Diploma in Agriculture","Diploma in Business Studies","Diploma in Information Technology",
  "Early Childhood Care and Development","Economics","Education","Electrical and Electronic Engineering",
  "Environmental Health Science","Environmental Management","Finance","Food Science and Technology",
  "Graphic Design","Health Information Management","Hospitality and Tourism","Human Resource Management",
  "Information Technology","Journalism and Mass Communication","Law","Marketing","Mechanical Engineering",
  "Medical Laboratory Science","Medicine and Surgery","Midwifery","Nursing","Occupational Health and Safety",
  "Pharmacy","Psychology","Public Health","Project Management","Quantity Surveying","Social Work",
  "Software Development","Special and Inclusive Education","Supply Chain Management","Theology",
] as const;
const GRADES: Record<string,string[]> = {
  Primary:["Grade 0","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7"],
  "Secondary High":["Form 1","Form 2","Form 3"],
  "High School":["Form 4","Form 5"],
  Matric:["Form 6","Sixth Form","A-Level","IB Diploma","Pre-University"],
  Tertiary:["Year 1","Year 2","Year 3","Year 4","Year 5","Year 6","Semester 1","Semester 2","Semester 3","Semester 4","Semester 5","Semester 6","Research / Thesis"],
};
export function gradeOptionsFor(level:string):string[]{return GRADES[level]??[];}
export function isTertiaryStage(level:string):boolean{return level==="Tertiary";}

/** Map legacy learner stages to the current Eswatini pathway using saved grade/year data. */
export function normalizeEducationStage(value:string,grade="",course="",institutionType=""):string {
  const stage=value.trim().toLowerCase().replace(/\s+/g," ");
  const year=grade.trim().toLowerCase();
  const fromGrade=():string=>{
    if(/\b(?:form\s*6|sixth form|matric|a[- ]?level|grade\s*12)\b/.test(year))return "Matric";
    if(/\b(?:form\s*[45]|grade\s*(?:10|11))\b/.test(year))return "High School";
    if(/\b(?:form\s*[123]|grade\s*(?:8|9))\b/.test(year))return "Secondary High";
    if(/\bgrade\s*[0-7]\b/.test(year))return "Primary";
    return "";
  };
  if(["primary","primary school"].includes(stage))return "Primary";
  if(["secondary high","junior secondary","junior secondary school"].includes(stage))return "Secondary High";
  if(["high school","high school / sixth form","senior secondary","senior secondary school"].includes(stage))return fromGrade()||"High School";
  if(["secondary school","secondary","secondary / high school"].includes(stage))return fromGrade()||"Secondary High";
  if(["matric","matric / form 6","form 6","sixth form"].includes(stage))return "Matric";
  if(["tertiary","higher education","college","university","technical / tvet","tvet"].includes(stage))return "Tertiary";
  const byGrade=fromGrade();
  if(byGrade)return byGrade;
  if(["college","university","technical / tvet","tvet"].includes(institutionType.trim().toLowerCase()))return "Tertiary";
  if(/\b(?:certificate|diploma|bachelor|master|doctorate|phd|degree)\b/i.test(course))return "Tertiary";
  return "";
}
export function normalizeInstitutionType(level:string,value="",legacyLevel=""):string {
  const current=value.trim();
  if(TERTIARY_INSTITUTION_TYPES.includes(current as typeof TERTIARY_INSTITUTION_TYPES[number]))return current;
  const legacy=legacyLevel.trim().toLowerCase()||level.trim().toLowerCase();
  if(legacy==="college")return "College";
  if(legacy==="university")return "University";
  if(legacy==="technical / tvet"||legacy==="tvet")return "Technical / TVET";
  return isTertiaryStage(level)?"Other":"School";
}
