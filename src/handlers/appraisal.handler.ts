import { Request, Response } from 'express';
import { FacultyAppraisal, IFacultyAppraisal } from '../models/detailedAppraisal';
import { User } from '../models/user';
import { sendSuccess, sendError, HttpStatus } from '../utils/response';
import { type UserRole } from '../constant/userInfo';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: UserRole };
    }
  }
}

/** Roles that can view/act on any faculty's appraisal. */
const EVALUATOR_ROLES: UserRole[] = ['admin', 'director', 'dean', 'associate_dean', 'hod'];

/**
 * Find an appraisal by userId and return 404 if missing.
 * All handlers use this to avoid repeating the same boilerplate.
 */
async function findAppraisalOrFail(
  res: Response,
  userId: string
): Promise<IFacultyAppraisal | null> {
  const appraisal = await FacultyAppraisal.findOne({ userId });
  if (!appraisal) {
    sendError(res, 'Appraisal not found', HttpStatus.NOT_FOUND);
    return null;
  }
  return appraisal;
}

/**
 * Guard: the requesting user must be the appraisal owner.
 * Returns true if the check passes, false + sends 403 if it fails.
 */
function assertOwner(res: Response, requestingUserId: string, targetUserId: string): boolean {
  if (requestingUserId !== targetUserId) {
    sendError(res, 'Unauthorized: you can only modify your own appraisal', HttpStatus.FORBIDDEN);
    return false;
  }
  return true;
}

/**
 * Guard: the appraisal must be in DRAFT status for faculty edits.
 * Returns true if the check passes.
 */
function assertDraft(res: Response, appraisal: IFacultyAppraisal): boolean {
  if (appraisal.status !== 'DRAFT') {
    sendError(
      res,
      `Appraisal is locked (status: ${appraisal.status}). Only DRAFT appraisals can be edited.`,
      HttpStatus.BAD_REQUEST
    );
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// POST /appraisal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new DRAFT appraisal for the authenticated faculty member.
 * Pulls designation, role, and appraisalYear from the User record so the
 * schema required fields are always populated correctly.
 */
export const createAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const requestingUser = req.user!;

    // Fetch the full user record to get designation (academic rank)
    const user = await User.findOne({ userId: requestingUser.userId, status: 'active' });
    if (!user) {
      sendError(res, 'Active user not found', HttpStatus.NOT_FOUND);
      return;
    }

    const appraisalYear = new Date().getFullYear();

    // Prevent duplicate appraisals for the same year
    const existing = await FacultyAppraisal.findOne({
      userId: requestingUser.userId,
      appraisalYear,
    });
    if (existing) {
      sendError(
        res,
        `An appraisal for ${appraisalYear} already exists for this user`,
        HttpStatus.CONFLICT
      );
      return;
    }

    const newAppraisal = await FacultyAppraisal.create({
      userId:        requestingUser.userId,
      role:          requestingUser.role,   // from JWT / middleware
      designation:   user.designation,     // academic rank from User model
      appraisalYear,
      status:        'DRAFT',
    });

    sendSuccess(res, newAppraisal, 'Appraisal created successfully', HttpStatus.CREATED);
  } catch (error) {
    console.error('createAppraisal error:', error);
    sendError(res, 'Failed to create appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// READ — single
// GET /appraisal/:userId
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the full appraisal document.
 * Faculty can only fetch their own; evaluator roles can fetch any.
 */
export const getAppraisalByUserId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    const isEvaluator = EVALUATOR_ROLES.includes(requestingUser.role);
    const isOwner     = requestingUser.userId === userId;

    if (!isOwner && !isEvaluator) {
      sendError(res, 'Unauthorized to view this appraisal', HttpStatus.FORBIDDEN);
      return;
    }

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;

    sendSuccess(res, appraisal, 'Appraisal retrieved successfully');
  } catch (error) {
    console.error('getAppraisalByUserId error:', error);
    sendError(res, 'Failed to retrieve appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// READ — list
// GET /appraisal  (admin / director / dean / hod)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a summary list of all appraisals.
 * Supports optional ?status and ?department query filters.
 * Department filtering requires a join to the User collection.
 */
export const getAllAppraisals = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, department } = req.query as Record<string, string | undefined>;

    // Build the appraisal-level filter
    const appraisalFilter: Record<string, unknown> = {};
    if (status) appraisalFilter.status = status;

    // If department filter is requested, resolve the matching userIds first
    if (department) {
      const usersInDept = await User.find({ department }, { userId: 1, _id: 0 }).lean();
      const userIds = usersInDept.map((u) => u.userId);
      appraisalFilter.userId = { $in: userIds };
    }

    const appraisals = await FacultyAppraisal.find(appraisalFilter)
      .select('userId role designation appraisalYear status summary createdAt updatedAt')
      .sort({ updatedAt: -1 });

    sendSuccess(res, appraisals, 'Appraisals retrieved successfully');
  } catch (error) {
    console.error('getAllAppraisals error:', error);
    sendError(res, 'Failed to retrieve appraisals', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// READ — by department
// GET /appraisal/department/:department  (dean / hod)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns appraisals scoped to a single department.
 * Resolves department → userIds via the User collection.
 */
export const getAppraisalsByDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { department } = req.params;
    const { status } = req.query as Record<string, string | undefined>;

    // Resolve userIds that belong to this department
    const usersInDept = await User.find({ department }, { userId: 1, _id: 0 }).lean();
    const userIds = usersInDept.map((u) => u.userId);

    const filter: Record<string, unknown> = { userId: { $in: userIds } };
    if (status) filter.status = status;

    const appraisals = await FacultyAppraisal.find(filter)
      .select('userId role designation appraisalYear status summary createdAt updatedAt')
      .sort({ updatedAt: -1 });

    sendSuccess(res, appraisals, 'Appraisals retrieved successfully');
  } catch (error) {
    console.error('getAppraisalsByDepartment error:', error);
    sendError(res, 'Failed to retrieve appraisals', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PART-SPECIFIC UPDATE HANDLERS
// Each handler only touches its own part via $set so no other part is disturbed.
// All faculty-facing updates require: owner + DRAFT status.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /appraisal/:userId/part-a
 * Updates academic involvement data. Only the appraisal owner can call this.
 */
export const updatePartA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    console.log('updatePartA request body:', req.body);
    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { partA: req.body } },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updated, 'Part A saved successfully');
  } catch (error) {
    console.error('updatePartA error:', error);
    sendError(res, 'Failed to save Part A', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * PUT /appraisal/:userId/part-b
 * Updates research & innovations data. Only the appraisal owner can call this.
 */
export const updatePartB = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { partB: req.body } },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updated, 'Part B saved successfully');
  } catch (error) {
    console.error('updatePartB error:', error);
    sendError(res, 'Failed to save Part B', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * PUT /appraisal/:userId/part-c
 * Updates self-development data. Only the appraisal owner can call this.
 */
export const updatePartC = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { partC: req.body } },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updated, 'Part C saved successfully');
  } catch (error) {
    console.error('updatePartC error:', error);
    sendError(res, 'Failed to save Part C', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * PUT /appraisal/:userId/part-d
 * Updates portfolio self-assessment. Only the appraisal owner can call this.
 * Only the faculty-owned fields are accepted here; evaluator marks have a
 * separate protected route (updatePartDEvaluator).
 */
export const updatePartD = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    // Strip evaluator-only fields so faculty cannot self-award dean/hod/director marks
    const {
      deanMarks, hodMarks, directorMarks, adminDeanMarks,
      isMarkDean, isMarkHOD,
      ...facultyFields
    } = req.body;

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { partD: facultyFields } },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updated, 'Part D saved successfully');
  } catch (error) {
    console.error('updatePartD error:', error);
    sendError(res, 'Failed to save Part D', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * PUT /appraisal/:userId/part-d/evaluator
 * Allows a Dean, HOD, or Director to enter their evaluation marks into Part D.
 * The appraisal must be in SUBMITTED status (faculty has frozen their form).
 * The evaluator's role determines which mark field is written.
 */
export const updatePartDEvaluator = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;

    if (appraisal.status !== 'SUBMITTED') {
      sendError(
        res,
        'Evaluator marks can only be entered after the faculty has submitted (SUBMITTED status)',
        HttpStatus.BAD_REQUEST
      );
      return;
    }

    // Build a targeted $set that only touches the relevant evaluator mark fields
    const setFields: Record<string, unknown> = {};

    const { marks } = req.body as { marks: number };

    if (typeof marks !== 'number' || marks < 0) {
      sendError(res, 'A valid numeric "marks" value is required', HttpStatus.BAD_REQUEST);
      return;
    }

    switch (requestingUser.role) {
      case 'dean':
        setFields['partD.deanMarks']  = marks;
        setFields['partD.isMarkDean'] = true;
        break;
      case 'hod':
        setFields['partD.hodMarks']  = marks;
        setFields['partD.isMarkHOD'] = true;
        break;
      case 'director':
        setFields['partD.directorMarks'] = marks;
        break;
      case 'associate_dean':
        setFields['partD.adminDeanMarks'] = marks;
        break;
      default:
        sendError(res, 'Your role does not permit entering evaluator marks', HttpStatus.FORBIDDEN);
        return;
    }

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: setFields },
      { new: true }
    );

    sendSuccess(res, updated, 'Evaluator marks saved successfully');
  } catch (error) {
    console.error('updatePartDEvaluator error:', error);
    sendError(res, 'Failed to save evaluator marks', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * PUT /appraisal/:userId/part-e
 * Updates extraordinary contributions. Only the appraisal owner can call this.
 */
export const updatePartE = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    // Strip the evaluator-only field — faculty cannot award themselves evaluatorMarks
    const { evaluatorMarks, ...facultyFields } = req.body;

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { partE: facultyFields } },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updated, 'Part E saved successfully');
  } catch (error) {
    console.error('updatePartE error:', error);
    sendError(res, 'Failed to save Part E', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DECLARATION
// PATCH /appraisal/:userId/declaration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records the faculty member's agreement to the declaration (Part F checkbox).
 * Must be in DRAFT status. The signature date is NOT set here — it is set when
 * the appraisal is formally submitted.
 */
export const updateDeclaration = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;
    if (!assertDraft(res, appraisal)) return;

    const { isAgreed } = req.body as { isAgreed: boolean };

    if (typeof isAgreed !== 'boolean') {
      sendError(res, '"isAgreed" must be a boolean', HttpStatus.BAD_REQUEST);
      return;
    }

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: { 'declaration.isAgreed': isAgreed } },
      { new: true }
    );

    sendSuccess(res, updated, 'Declaration updated');
  } catch (error) {
    console.error('updateDeclaration error:', error);
    sendError(res, 'Failed to update declaration', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW: SUBMIT → VERIFY → APPROVE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /appraisal/:userId/submit
 * Transitions DRAFT → SUBMITTED. Requires declaration agreement.
 * Stamps the signatureDate at this point.
 */
export const submitAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;

    if (appraisal.status !== 'DRAFT') {
      sendError(
        res,
        `Cannot submit: appraisal is already in ${appraisal.status} status`,
        HttpStatus.BAD_REQUEST
      );
      return;
    }

    if (!appraisal.declaration.isAgreed) {
      sendError(
        res,
        'You must agree to the declaration before submitting',
        HttpStatus.BAD_REQUEST
      );
      return;
    }

    appraisal.status = 'SUBMITTED';
    appraisal.declaration.signatureDate = new Date();
    await appraisal.save();

    sendSuccess(res, appraisal, 'Appraisal submitted successfully');
  } catch (error) {
    console.error('submitAppraisal error:', error);
    sendError(res, 'Failed to submit appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * PATCH /appraisal/:userId/verify
 * Transitions SUBMITTED → VERIFIED.
 * Accepts a structured verificationData body to set verified marks on specific
 * sub-fields without touching any faculty-supplied data.
 *
 * Expected body shape (all fields optional):
 * {
 *   partB?: {
 *     papers?: { sci?: number, esci?: number, scopus?: number, ugc?: number, other?: number },
 *     conferences?: { scopus?: number, other?: number },
 *     ... (same pattern for every Part B category)
 *     totalVerified?: number
 *   },
 *   partC?: { verifiedMarks?: number },
 *   partE?: { evaluatorMarks?: number },
 *   summary?: { grandTotalVerified?: number }
 * }
 */
export const verifyAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { verificationData } = req.body as {
      verificationData?: Record<string, unknown>;
    };

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;

    if (appraisal.status !== 'SUBMITTED') {
      sendError(
        res,
        `Cannot verify: appraisal must be SUBMITTED (current: ${appraisal.status})`,
        HttpStatus.BAD_REQUEST
      );
      return;
    }

    // Build a surgical $set targeting only `verified` leaf fields.
    // This guarantees faculty-submitted data is never touched.
    const setFields: Record<string, unknown> = { status: 'VERIFIED' };

    if (verificationData) {
      // ── Part B verified marks ──────────────────────────────────────────────
      const B_CATEGORIES = [
        'papers', 'conferences', 'bookChapters', 'books', 'citations',
        'copyrights', 'patents', 'grants', 'products', 'startup',
        'awards', 'industryInteraction',
      ] as const;

      const partB = verificationData.partB as Record<string, Record<string, number>> | undefined;
      if (partB) {
        for (const category of B_CATEGORIES) {
          const cat = partB[category];
          if (cat && typeof cat === 'object') {
            for (const [subKey, value] of Object.entries(cat)) {
              if (typeof value === 'number') {
                setFields[`partB.${category}.${subKey}.verified`] = value;
              }
            }
          }
        }
        // Single-metric categories
        (['revenueTraining', 'placement'] as const).forEach((key) => {
          const val = (partB as Record<string, unknown>)[key];
          if (typeof val === 'number') setFields[`partB.${key}.verified`] = val;
        });
        if (typeof partB.totalVerified === 'number') {
          setFields['partB.totalVerified'] = partB.totalVerified;
        }
      }

      // ── Part C verified marks ──────────────────────────────────────────────
      const partC = verificationData.partC as { verifiedMarks?: number } | undefined;
      if (typeof partC?.verifiedMarks === 'number') {
        setFields['partC.verifiedMarks'] = partC.verifiedMarks;
      }

      // ── Part E evaluator marks ─────────────────────────────────────────────
      const partE = verificationData.partE as { evaluatorMarks?: number } | undefined;
      if (typeof partE?.evaluatorMarks === 'number') {
        setFields['partE.evaluatorMarks'] = partE.evaluatorMarks;
      }

      // ── Summary ───────────────────────────────────────────────────────────
      const summary = verificationData.summary as { grandTotalVerified?: number } | undefined;
      if (typeof summary?.grandTotalVerified === 'number') {
        setFields['summary.grandTotalVerified'] = summary.grandTotalVerified;
      }
    }

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: setFields },
      { new: true }
    );

    sendSuccess(res, updated, 'Appraisal verified successfully');
  } catch (error) {
    console.error('verifyAppraisal error:', error);
    sendError(res, 'Failed to verify appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * PATCH /appraisal/:userId/approve
 * Transitions VERIFIED → APPROVED.
 * Optionally records the final grandTotalVerified in the summary.
 */
export const approveAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { grandTotalVerified } = req.body as { grandTotalVerified?: number };

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;

    if (appraisal.status !== 'VERIFIED') {
      sendError(
        res,
        `Cannot approve: appraisal must be VERIFIED (current: ${appraisal.status})`,
        HttpStatus.BAD_REQUEST
      );
      return;
    }

    const setFields: Record<string, unknown> = { status: 'APPROVED' };
    if (typeof grandTotalVerified === 'number') {
      setFields['summary.grandTotalVerified'] = grandTotalVerified;
    }

    const updated = await FacultyAppraisal.findOneAndUpdate(
      { userId },
      { $set: setFields },
      { new: true }
    );

    sendSuccess(res, updated, 'Appraisal approved successfully');
  } catch (error) {
    console.error('approveAppraisal error:', error);
    sendError(res, 'Failed to approve appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// DELETE /appraisal/:userId  (DRAFT only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Permanently deletes a DRAFT appraisal.
 * Only the owner may delete; once submitted it cannot be deleted.
 */
export const deleteAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user!;

    if (!assertOwner(res, requestingUser.userId, userId)) return;

    const appraisal = await findAppraisalOrFail(res, userId);
    if (!appraisal) return;

    if (appraisal.status !== 'DRAFT') {
      sendError(res, 'Only DRAFT appraisals can be deleted', HttpStatus.BAD_REQUEST);
      return;
    }

    await FacultyAppraisal.deleteOne({ userId });

    sendSuccess(res, null, 'Appraisal deleted successfully');
  } catch (error) {
    console.error('deleteAppraisal error:', error);
    sendError(res, 'Failed to delete appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};
