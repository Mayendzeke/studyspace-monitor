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


/** Programme titles and institutional registration statuses transcribed from ESHEC's 10 August 2026 register. A listing is not a promise of current intake; verify with the institution before applying. */
export const ESWATINI_TERTIARY_CATALOGUE_SOURCE = "https://eshec.org.sz/wp-content/uploads/2026/08/ESHEC-HEI-List-Aug-2026_Final_V8.pdf";
export const ESWATINI_TERTIARY_PROGRAMMES_BY_INSTITUTION: Record<string, { status: string; programmes: string[] }> = {
  "University of Eswatini (UNESWA)": {
    "status": "Registered",
    "programmes": [
      "Doctor of Philosophy in Agricultural and Applied Economics",
      "Doctor of Philosophy in Agricultural Education",
      "Doctor of Philosophy in Horticulture (by Research)",
      "Master of Science in Agricultural and Applied Economics",
      "Master of Science in Agricultural Education",
      "Master of Science in Agricultural Extension",
      "Master of Science in Animal Science",
      "Master of Science in Crop Protection",
      "Master of Science in Crop Science",
      "Master of Science in Horticulture",
      "Bachelor of Science in Agricultural and Biosystems Engineering",
      "Bachelor of Science in Agricultural Economics and Agribusiness Management",
      "Bachelor of Science in Agricultural Education",
      "Bachelor of Science in Agricultural Extension",
      "Bachelor of Science in Agronomy",
      "Bachelor of Science in Animal Science",
      "Bachelor of Science in Horticulture",
      "Diploma in Agriculture",
      "Diploma in Agricultural Education",
      "Certificate in Agriculture",
      "Master of Science in Consumer Science Education",
      "Master of Science in Food Science and Technology",
      "Master of Science in Textiles",
      "Bachelor of Science in Consumer Science",
      "Bachelor of Science in Consumer Science Education",
      "Bachelor of Science in Food Science, Nutrition and Technology",
      "Bachelor of Science in Textile Apparel Design and Management",
      "Diploma in Home Economics",
      "Diploma in Home Economics Education",
      "Master of Business Administration",
      "Postgraduate Diploma in Taxation",
      "Postgraduate Diploma in Public Sector Accounting",
      "Bachelor of Commerce (Management, Accounting and Finance, Marketing)",
      "Master of Science in Chemistry",
      "Master of Science in Computational Physics",
      "Master of Science in Computer Science",
      "Master of Science in Conservation Ecology",
      "Master of Science in Environmental Resources Management",
      "Master of Science in Mathematics Finance",
      "Master of Science in Mathematical Modelling",
      "Master of Science in Pure Mathematics",
      "Bachelor of Science (Mathematics, Physics, Chemistry, Biology)",
      "Bachelor of Science in Geographic Information Science",
      "Bachelor of Science in Geography, Environmental Science and Planning",
      "Bachelor of Science in Actuarial and Financial Mathematics",
      "Bachelor of Science in Computer Science",
      "Bachelor of Science in Computer Science Education",
      "Bachelor of Science in Information Science",
      "Bachelor of Science in Information Technology",
      "Bachelor of Science in Urban and Regional Planning",
      "Bachelor of Engineering in Electrical and Electronic Engineering",
      "Postgraduate Diploma in Computer Science",
      "Master of Arts in History",
      "Master of Arts in Languages and Linguistics",
      "Master of Arts in African Literature",
      "Master of Arts in Linguistics",
      "Bachelor of Arts in Humanities",
      "Bachelor of Arts in Journalism and Mass Communication",
      "Master of Arts in Religious Studies",
      "Diploma in Journalism and Mass Communication",
      "Bachelor of Laws (LLB)",
      "Bachelor of Arts in Social Sciences",
      "Bachelor of Social Work",
      "Master of Nursing Science in Family Nurse Practice",
      "Master of Science in Midwifery",
      "Bachelor of Nursing Science",
      "Bachelor of Science in Community Health Nursing",
      "Bachelor of Science in Environmental Health Science",
      "Bachelor of Science in Environmental Health and Food Science",
      "Bachelor of Science in Environmental Management and Occupational Safety and Health",
      "Bachelor of Science in Environmental Management and Water Resources",
      "Master of Science in Environmental Resources Management (Land and Water Management)",
      "Diploma in General Nursing",
      "Diploma in Environmental Health Science",
      "Post Diploma Certificate in Community Health Nursing",
      "Post Diploma Certificate in Community Mental Health Nursing",
      "Post Diploma Certificate in Midwifery Science",
      "Post-Diploma Certificate in Nephrology Nursing Science",
      "Post Graduate Diploma in Neonatology",
      "Certificate in Adult Education",
      "Diploma in Adult Education",
      "Bachelor of Education Primary (Language Arts)",
      "Bachelor of Education Primary (Social Studies)",
      "Bachelor of Education Primary (Science)",
      "Bachelor of Education Secondary (Science)",
      "Bachelor of Education Secondary (Business Education)",
      "Bachelor of Education Secondary (Humanities)",
      "Post-Graduate Certificate in Education",
      "Doctor of Philosophy in Education (by Research)",
      "Diploma in Law",
      "Certificate in Portuguese",
      "Certificate in Psychosocial Support"
    ]
  },
  "Matsapha Police Academy": {
    "status": "Fully registered",
    "programmes": [
      "Diploma in Police Science",
      "Certificate in Basic Recruit Training",
      "Certificate in Middle Management Skills Development",
      "Certificate in Junior Supervisory Skills Development"
    ]
  },
  "William Pitcher Teacher Training College": {
    "status": "Registered",
    "programmes": [
      "Secondary Teachers Diploma"
    ]
  },
  "Ngwane Teacher Training College": {
    "status": "Registered",
    "programmes": [
      "Primary Teachers Diploma"
    ]
  },
  "Eswatini Institute of Management and Public Administration (EIMPA)": {
    "status": "Registered",
    "programmes": [
      "Tailor-made professional and public administration courses"
    ]
  },
  "Advanced School of Information Technology (ASIT)": {
    "status": "Provisionally registered",
    "programmes": [
      "Diploma in Certified Computer Professional (CCP)",
      "Diploma in Arena Animation International Programme (AAIP)",
      "Diploma in Certified Network Specialist (ACNS)",
      "Diploma in Information Security and Ethical Hacking (ISEH)",
      "Diploma in Cybersecurity and Network Forensics"
    ]
  },
  "Eswatini Medical Christian University (EMCU)": {
    "status": "Provisionally registered",
    "programmes": [
      "Bachelor of Medicine and Surgery",
      "Bachelor of Radiography",
      "Bachelor of Nursing Science",
      "Bachelor of Medical Laboratory Science",
      "Bachelor of Psychology",
      "Bachelor of Social Work",
      "Bachelor of Pharmacy",
      "Bachelor of Computer Science"
    ]
  },
  "Good Shepherd Catholic College of Health Sciences": {
    "status": "Fully registered",
    "programmes": [
      "Diploma in General Nursing",
      "Certificate in Nursing Assistant",
      "Post Graduate Certificate in Midwifery",
      "Diploma in Health and Safety"
    ]
  },
  "Institute of Development Management (IDM)": {
    "status": "Provisionally registered",
    "programmes": [
      "Bachelor of Arts in Human Resources Management",
      "Diploma in Human Resources Management",
      "Certificate in Human Resources Management",
      "Diploma in Information Technology",
      "Diploma in Occupational Health and Safety",
      "Certificate in Freight Forwarding and Customs Compliance",
      "Bachelor of Science in Information Technology",
      "Bachelor of Occupational Health and Safety",
      "Bachelor of Education Management and School Leadership",
      "Bachelor in Community Development"
    ]
  },
  "Limkokwing University": {
    "status": "Provisionally registered",
    "programmes": [
      "Associate Degree in Graphic Design",
      "Associate Degree in Music Design",
      "Associate Degree in Creative Multimedia",
      "Associate Degree in Architectural Technology",
      "Associate Degree in Public Relations",
      "Associate Degree in Events Management",
      "Associate Degree in Journalism and Media",
      "Associate Degree in TV and Film Production",
      "Associate Degree in International Tourism",
      "Associate Degree in Information Technology",
      "Associate Degree in Business Information Technology",
      "Associate Degree in Hotel Management",
      "Associate Degree in Business Management",
      "Bachelor of Science in Information Technology",
      "Bachelor of Arts in Professional Communication",
      "Bachelor of Business in International Business Management"
    ]
  },
  "Southern Africa Nazarene University (SANU)": {
    "status": "Fully registered",
    "programmes": [
      "Diploma in Business Management and Entrepreneurship",
      "Diploma in Pharmacy",
      "Diploma in Theology",
      "Primary Teachers Diploma",
      "Bachelor of Arts in Theology",
      "Bachelor of Education in Special and Inclusive Education",
      "Bachelor of Education in Leadership and Management for Inclusive Education",
      "Bachelor of Education Primary Teaching (French)",
      "Bachelor of Science in Nursing and Midwifery",
      "Bachelor of Science in Pharmacy",
      "Master of Science in Nursing",
      "Master of Education in Special and Inclusive Education",
      "Master of Arts in Practical Theology and Ministry"
    ]
  },
  "Amadi University College": {
    "status": "Provisionally registered",
    "programmes": [
      "Primary Teachers Diploma",
      "Bachelor of Commerce (Accounting)",
      "Bachelor of Education (Foundation)",
      "Bachelor of Education in Early Childhood Care and Development"
    ]
  },
  "African Prime Institute of Science and Technology (APIST)": {
    "status": "Provisionally registered",
    "programmes": [
      "Diploma in Health Records and Information Technology",
      "Diploma in Agriculture and Community Development",
      "Certificate in Architecture",
      "Certificate in Electrical and Electronic Telecommunication"
    ]
  },
  "African Christian College": {
    "status": "Fully registered",
    "programmes": [
      "Certificate in Leadership (Christian Studies)",
      "Bachelor of Theology"
    ]
  },
  "Botho University Eswatini Campus": {
    "status": "Fully registered",
    "programmes": [
      "Bachelor of Science in Network Security and Computer Forensics",
      "Bachelor of Science in Computing",
      "Bachelor of Commerce in Accounting",
      "Bachelor of Business Administration in Business Management",
      "Bachelor of Science in Mobile Computing",
      "Bachelor of Science in Health Information Management"
    ]
  },
  "Bradford College": {
    "status": "Provisionally registered",
    "programmes": [
      "Primary Teachers Diploma",
      "Secondary Teachers Diploma"
    ]
  },
  "Centre for International Technology and Consultancy (CIT)": {
    "status": "Provisionally registered",
    "programmes": [
      "Primary Teachers Diploma"
    ]
  },
  "Eastern and Southern African Management Institute (ESAMI)": {
    "status": "Provisionally registered",
    "programmes": [
      "Master of Business Administration",
      "Masters in Human Resources Management",
      "Master of Science in Project Management",
      "Bachelor of Business Administration",
      "Diploma in Management and Administration",
      "Diploma in Human Resources",
      "Diploma in Management"
    ]
  },
  "Emergency Medical Rescue College (EMRC)": {
    "status": "Fully registered",
    "programmes": [
      "Certificate in Basic Ambulance Assistant",
      "Certificate in Occupational Health and Safety",
      "Certificate in Emergency Medical Care and Rescue",
      "Diploma in Occupational Health and Safety",
      "Diploma in Emergency Medical Care and Rescue",
      "Diploma in Public Health",
      "Diploma in Disaster and Risk Management",
      "Bachelor of Science in Occupational Health and Safety",
      "Bachelor's Degree in Public Health",
      "Bachelor of Science in Emergency Medical Care",
      "Bachelor's Degree in Disaster and Risk Management"
    ]
  },
  "Emmanuel Wesleyan Bible College": {
    "status": "Provisionally registered",
    "programmes": [
      "Certificate in Christian Service",
      "Diploma in Counselling"
    ]
  },
  "Institute of Research Management and Development (IRDM)": {
    "status": "Provisionally registered",
    "programmes": [
      "Certificate in Security Management",
      "Diploma in Business Studies",
      "Certificate in Counselling Training"
    ]
  },
  "Mananga Centre for Regional Integration and Management Development": {
    "status": "Fully registered",
    "programmes": [
      "Diploma in Marketing",
      "Diploma in Public Sector Accounting",
      "Diploma in Entrepreneurship",
      "Certificate in Project Management",
      "Supervisors' Development Programme",
      "Certificate in Human Resources"
    ]
  },
  "Springfield Research University": {
    "status": "Fully registered",
    "programmes": [
      "Bachelor of Science in Forestry",
      "Bachelor of Arts in Political Science and Governance",
      "Bachelor of Arts in Psychology",
      "Bachelor of Business Administration in Supply Chain Management and Logistics",
      "Bachelor of Science in Computer Science",
      "Bachelor of Laws (LLB)",
      "Bachelor of Actuarial Science and Financial Mathematics",
      "Master of Laws",
      "Master of Public Health",
      "Master of Research: Engineering and Technology",
      "Master of Research: Education and Learning Science",
      "Master of Research: Arts, Political Science and Law",
      "Master of Research: Science and Medical Sciences",
      "Master of Research: Business Management and Economics",
      "Doctor of Philosophy: Engineering and Technology",
      "Doctor of Philosophy: Education and Learning Science",
      "Doctor of Philosophy: Arts, Political Science and Law",
      "Doctor of Philosophy: Science and Medical Sciences",
      "Doctor of Philosophy: Business Management and Economics"
    ]
  },
  "Eswatini College of Theology": {
    "status": "Fully registered",
    "programmes": [
      "Bachelor of Theology",
      "Bachelor in Psychology",
      "Diploma in Bible and Theology",
      "Diploma in Peace and Conflict Studies",
      "Diploma in Counselling",
      "Certificate in Psychosocial Counselling"
    ]
  },
  "Workers College": {
    "status": "Provisionally registered",
    "programmes": [
      "Primary Teachers Diploma",
      "Secondary Teachers Diploma",
      "Early Childhood Teachers Diploma",
      "Bachelor of Commerce",
      "Diploma in Occupational Health and Safety",
      "Diploma in Business Administration"
    ]
  },
  "Soft-Tech College": {
    "status": "Fully registered",
    "programmes": [
      "Diploma in Computer Hardware and Networking",
      "Diploma in Business Information Technology",
      "Certificate in Server Administration",
      "Certificate in Office Management",
      "Certificate in Project Management",
      "Certificate in Database",
      "Certificate in Storage Essentials",
      "Certificate in Google Apps",
      "Certificate in Android",
      "Certificate in Certified Ethical Hacking",
      "Certificate in Cisco",
      "Certificate Network Associate",
      "Certificate Network Professional"
    ]
  },
  "NOSA": {
    "status": "Fully registered",
    "programmes": [
      "Occupational Health and Safety programmes"
    ]
  },
  "SHAK Enterprise": {
    "status": "Provisionally registered",
    "programmes": [
      "Occupational Health and Safety programmes"
    ]
  },
  "St John": {
    "status": "Provisionally registered",
    "programmes": [
      "Occupational Health and Safety programmes"
    ]
  },
  "Bethel Vocational Centre": {
    "status": "Provisionally registered",
    "programmes": [
      "Certificate in Construction and Building",
      "Certificate in Welding Design",
      "Certificate in Electrical Engineering"
    ]
  },
  "BSA Training Centre": {
    "status": "Provisionally registered",
    "programmes": [
      "Certificate in Motor Vehicle Mechanics",
      "Certificate in Welding",
      "Certificate in Electrical Wiring",
      "Certificate in Auto Electrical",
      "Certificate in Heavy Plant Mechanics",
      "Certificate in Fashion and Design",
      "Certificate in Plumbing",
      "Certificate in Catering and Hotel Management",
      "Certificate in Business Studies",
      "Certificate in Health and Safety",
      "Diploma in Health and Safety"
    ]
  },
  "Bosco Youth Agricultural Centre (BYAC)": {
    "status": "Provisionally registered",
    "programmes": [
      "Certificate in Permaculture",
      "Certificate in Horticulture",
      "Certificate in Bee Keeping",
      "Certificate in Pig Production"
    ]
  },
  "Hillside College": {
    "status": "Provisionally registered",
    "programmes": [
      "HIV/AIDS Management"
    ]
  },
  "Ngwane Park TVET": {
    "status": "Fully registered",
    "programmes": [
      "Certificate in Information Communication Technology",
      "Certificate in Accounting and Finance",
      "Diploma in Information Communication Technology",
      "Diploma in Accounting and Finance",
      "Diploma in Fashion Design"
    ]
  },
  "SIMAVSHEQ": {
    "status": "Provisionally registered",
    "programmes": [
      "Occupational Health and Safety programmes"
    ]
  },
  "Solar Training and Renewable Energy Entrepreneurship Centre": {
    "status": "Fully registered",
    "programmes": [
      "Certificate in Renewable Energy and Entrepreneurship"
    ]
  },
  "Ubombo Technical College (U-TECH)": {
    "status": "Fully registered",
    "programmes": [
      "Diploma in Information Technology",
      "Diploma in Data Science",
      "Diploma in Electrical Engineering"
    ]
  },
  "Eswatini College of Technology (ECOT)": {
    "status": "Registered",
    "programmes": [
      "Diploma in Business Studies",
      "Diploma in Quantity Surveying",
      "Diploma in Architectural Technology",
      "Diploma in Civil Engineering",
      "Secondary Teacher's Diploma: Commercial",
      "Secondary Teacher's Diploma: Information and Communication Technology",
      "Secondary Teacher's Diploma: Design and Technology",
      "Vocational Instructor's Diploma",
      "Diploma in Office Management and Technology",
      "Diploma in Human Resources Management",
      "Diploma in Hospitality and Tourism",
      "Diploma in Electrical and Electronics",
      "Diploma in Automotive Engineering Light and Heavy",
      "Diploma in Mechanical Engineering",
      "Diploma in Computer Science",
      "Diploma in Information Technology"
    ]
  },
  "Eswatini Cooperative Development College (ECODEC)": {
    "status": "Provisionally registered",
    "programmes": [
      "Certificate in Cooperatives Business Management"
    ]
  },
  "Gwamile Vocational and Commercial Training Institute": {
    "status": "Registered",
    "programmes": [
      "Diploma in Mechanical and Manufacturing Engineering",
      "Diploma in Business and Accounting",
      "Diploma in Automotive Engineering",
      "Diploma in Vehicle Body Repairs",
      "Diploma in Electrical Engineering",
      "Diploma in Building and Construction Studies",
      "Diploma in Carpentry and Joinery"
    ]
  }
};

export function tertiaryProgrammesFor(institution: string): string[] {
  const needle = institution.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
  const match = Object.entries(ESWATINI_TERTIARY_PROGRAMMES_BY_INSTITUTION).find(([name]) => {
    const key = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
    return needle && (key === needle || key.includes(needle) || needle.includes(key));
  });
  if (match) return [...match[1].programmes];
  return [...new Set(Object.values(ESWATINI_TERTIARY_PROGRAMMES_BY_INSTITUTION).flatMap(item => item.programmes))].sort((a, b) => a.localeCompare(b));
}

export function tertiaryInstitutionStatus(institution: string): string {
  const needle = institution.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
  const match = Object.entries(ESWATINI_TERTIARY_PROGRAMMES_BY_INSTITUTION).find(([name]) => {
    const key = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
    return needle && (key === needle || key.includes(needle) || needle.includes(key));
  });
  return match?.[1].status ?? "Not found in the ESHEC August 2026 register";
}
