import { Schema, model, Document, models } from 'mongoose';
import { AppraisalStatus, APPRAISAL_STATUS, DESIGNATION_VALUES, DesignationValue } from '../constant';


// Expanded to capture the raw input (count or amount) from the frontend
export interface IVerifiedMark {
  count: number;       // e.g., Number of papers, projects, students
  amount?: number;     // e.g., Revenue generated, grant amounts in Rupees
  claimed: number;     // Calculated marks by faculty
  verified: number;    // Marks after verification
  proof?: string;       // Link to evidence
}

export interface IFacultyAppraisal extends Document {
  userId: string;
  status: AppraisalStatus;


  partA: {
    resultAnalysis: { value: number; claimed: number }; 
    courseOutcome: { value: number; claimed: number };
    eLearningContent: { count: number; claimed: number; proof?: string }; // Includes personal website link
    academicEngagement: { value: number; claimed: number };
    teachingLoad: { value: number; claimed: number };
    projectsGuided: { count: number; claimed: number };
    studentFeedback: { value: number; claimed: number };
    ptgMeetings: { count: number; claimed: number };
    totalClaimed: number;
    calculatedTotal: number;
  };

  partB: {
    papers: {
      sci: IVerifiedMark;
      esci: IVerifiedMark;
      scopus: IVerifiedMark;
      ugc: IVerifiedMark;
      other: IVerifiedMark;
    };
    conferences: {
      scopus: IVerifiedMark;
      other: IVerifiedMark;
    };
    bookChapters: { 
      scopus: IVerifiedMark; 
      other: IVerifiedMark; 
    };
    books: { 
      scopus: IVerifiedMark; 
      national: IVerifiedMark; 
      local: IVerifiedMark; 
    };
    citations: { 
      wos: IVerifiedMark; 
      scopus: IVerifiedMark; 
      googleScholar: IVerifiedMark; 
    };
    copyrights: {
      individualRegistered: IVerifiedMark; 
      individualGranted: IVerifiedMark;
      instituteRegistered: IVerifiedMark; 
      instituteGranted: IVerifiedMark;
    };
    patents: {
      individualRegistered: IVerifiedMark; 
      individualPublished: IVerifiedMark;
      individualGranted: IVerifiedMark; 
      individualCommercialized: IVerifiedMark;
      instituteRegistered: IVerifiedMark; 
      institutePublished: IVerifiedMark;
      instituteGranted: IVerifiedMark; 
      instituteCommercialized: IVerifiedMark;
    };
    grants: { 
      research: IVerifiedMark; 
      nonResearch: IVerifiedMark; 
    };
    revenue: { training: IVerifiedMark; };
    products: { 
      commercialized: IVerifiedMark; 
      developed: IVerifiedMark; 
      poc: IVerifiedMark; 
    };
    startup: {
      revenue: IVerifiedMark; 
      funding: IVerifiedMark; 
      products: IVerifiedMark;
      poc: IVerifiedMark; 
      registered: IVerifiedMark;
    };
    awards: {
      intlAward: IVerifiedMark; 
      govtAward: IVerifiedMark; 
      nationalAward: IVerifiedMark;
      intlFellowship: IVerifiedMark; 
      nationalFellowship: IVerifiedMark;
    };
    industryInteraction: {
      activeMou: IVerifiedMark; 
      labDevelopment: IVerifiedMark; 
      internshipsPlacements: IVerifiedMark;
    };
    totalClaimed: number;
    totalVerified: number;
    calculatedTotal: number;
  };

  partC: {
    // Expanded sub-categories to map frontend inputs for durations/types
    qualification: { 
      completed: IVerifiedMark; 
      ongoing: IVerifiedMark; 
    };
    trainingAttended: {
      twoWeek: IVerifiedMark;
      oneWeek: IVerifiedMark;
      twoToFiveDays: IVerifiedMark;
      oneDay: IVerifiedMark;
    };
    trainingOrganized: {
      twoWeek: IVerifiedMark;
      oneWeek: IVerifiedMark;
      twoToFiveDays: IVerifiedMark;
      oneDay: IVerifiedMark;
    };
    phdGuided: {
      awarded: IVerifiedMark;
      submitted: IVerifiedMark;
      ongoing: IVerifiedMark;
    };
    totalClaimed: number;
    calculatedTotal: number;
  };

  partD: {
    institutePortfolio: { 
      description: string; 
      selfAwardedMarks: number; 
      evaluatorMarks: number; 
      proof: string 
    };
    departmentPortfolio: { description: string; selfAwardedMarks: number; evaluatorMarks: number; proof: string };
    totalClaimed: number;
    totalVerified: number;
  };

  partE: {
    contributionsDescription: string;
    marksAwarded: number;
    evaluatorMarks: number;
    proof: string;
  };

  summary: {
    adminWeightage: number;
    grandTotalClaimed: number;
    grandTotalVerified: number;
  };

  declaration: {
    isAgreed: boolean;
    signatureDate?: Date;
  };
}

// --- SCHEMA DEFINITION ---

const verifiedMarkField = {
  count: { type: Number },
  amount: { type: Number, required: false}, // specifically for currency/grants
  claimed: { type: Number},
  verified: { type: Number, default: 0 },
  proof: { type: String, required : false }
};

const basicMarkField = {
  value: { type: Number, default: 0 }, // Used for percentages, ratios, etc.
  count: { type: Number, default: 0 }, // Used for distinct integer counts
  claimed: { type: Number, default: 0 },
  proof: { type: String, required: false } // For fields that require evidence but don't have a count/amount
};

const facultyAppraisalSchema = new Schema<IFacultyAppraisal>({
  userId: { type: String, required: true, index: true },
  status: { type: String, enum: APPRAISAL_STATUS, default: 'DRAFT' },


  partA: {
    resultAnalysis: basicMarkField,
    courseOutcome: basicMarkField,
    eLearningContent: basicMarkField,
    academicEngagement: basicMarkField,
    teachingLoad: basicMarkField,
    projectsGuided: basicMarkField,
    studentFeedback: basicMarkField,
    ptgMeetings: basicMarkField,
    totalClaimed: { type: Number, default: 0 },
    calculatedTotal: { type: Number, default: 0 }
  },

  partB: {
    papers: { sci: verifiedMarkField, esci: verifiedMarkField, scopus: verifiedMarkField, ugc: verifiedMarkField, other: verifiedMarkField },
    conferences: { scopus: verifiedMarkField, other: verifiedMarkField },
    bookChapters: { scopus: verifiedMarkField, other: verifiedMarkField },
    books: { scopus: verifiedMarkField, national: verifiedMarkField, local: verifiedMarkField },
    citations: { wos: verifiedMarkField, scopus: verifiedMarkField, googleScholar: verifiedMarkField },
    copyrights: { individualRegistered: verifiedMarkField, individualGranted: verifiedMarkField, instituteRegistered: verifiedMarkField, instituteGranted: verifiedMarkField },
    patents: { individualRegistered: verifiedMarkField, individualPublished: verifiedMarkField, individualGranted: verifiedMarkField, individualCommercialized: verifiedMarkField, instituteRegistered: verifiedMarkField, institutePublished: verifiedMarkField, instituteGranted: verifiedMarkField, instituteCommercialized: verifiedMarkField },
    grants: { research: verifiedMarkField, nonResearch: verifiedMarkField },
    revenue: { training: verifiedMarkField },
    products: { commercialized: verifiedMarkField, developed: verifiedMarkField, poc: verifiedMarkField },
    startup: { revenue: verifiedMarkField, funding: verifiedMarkField, products: verifiedMarkField, poc: verifiedMarkField, registered: verifiedMarkField },
    awards: { intlAward: verifiedMarkField, govtAward: verifiedMarkField, nationalAward: verifiedMarkField, intlFellowship: verifiedMarkField, nationalFellowship: verifiedMarkField },
    industryInteraction: { activeMou: verifiedMarkField, labDevelopment: verifiedMarkField, internshipsPlacements: verifiedMarkField },
    totalClaimed: { type: Number, default: 0 },
    totalVerified: { type: Number, default: 0 },
    calculatedTotal: { type: Number, default: 0 }
  },

  partC: {
    qualification: { completed: verifiedMarkField, ongoing: verifiedMarkField },
    trainingAttended: { twoWeek: verifiedMarkField, oneWeek: verifiedMarkField, twoToFiveDays: verifiedMarkField, oneDay: verifiedMarkField },
    trainingOrganized: { twoWeek: verifiedMarkField, oneWeek: verifiedMarkField, twoToFiveDays: verifiedMarkField, oneDay: verifiedMarkField },
    phdGuided: { awarded: verifiedMarkField, submitted: verifiedMarkField, ongoing: verifiedMarkField },
    totalClaimed: { type: Number, default: 0 },
    calculatedTotal: { type: Number, default: 0 }
  },

  partD: {
    institutePortfolio: { 
      description: { type: String, default: "" }, 
      selfAwardedMarks: { type: Number, default: 0 }, 
      evaluatorMarks: { type: Number, default: 0 }, 
      proof: { type: String, default: "" } 
    },
    departmentPortfolio: { 
      description: { type: String, default: "" }, 
      selfAwardedMarks: { type: Number, default: 0 }, 
      evaluatorMarks: { type: Number, default: 0 }, 
      proof: { type: String, default: "" } 
    },
    totalClaimed: { type: Number, default: 0 },
    totalVerified: { type: Number, default: 0 }
  },

  partE: {
    contributionsDescription: { type: String, default: "" },
    marksAwarded: { type: Number, default: 0 },
    evaluatorMarks: { type: Number, default: 0 },
    proof: { type: String, default: "" }
  },

  summary: {
    adminWeightage: { type: Number, default: 0 },
    grandTotalClaimed: { type: Number, default: 0 },
    grandTotalVerified: { type: Number, default: 0 },
    maxGrandTotal: {type: Number, max: 1000}
  },

  declaration: {
    isAgreed: { type: Boolean, default: false },
    signatureDate: { type: Date }
  }
}, { timestamps: true });

export const FacultyAppraisal = models.FacultyAppraisal || model<IFacultyAppraisal>('FacultyAppraisal', facultyAppraisalSchema);