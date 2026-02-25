import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  createAppraisal,
  getAppraisalByUserId,
  getAllAppraisals,
  getAppraisalsByDepartment,
  updatePartA,
  updatePartB,
  updatePartC,
  updatePartD,
  updatePartDEvaluator,
  updatePartE,
  updateDeclaration,
  submitAppraisal,
  verifyAppraisal,
  approveAppraisal,
  deleteAppraisal,
} from '../handlers/appraisal.handler';

const router = Router();

// Every route in this file requires a valid JWT.
router.use(authMiddleware());

// List all appraisals — restricted to elevated roles.
router.get(
  '/',
  authMiddleware('admin', 'director', 'dean', 'associate_dean', 'hod'),
  getAllAppraisals
);

// Must be declared BEFORE /:userId to avoid Express matching "department" as a userId.
router.get(
  '/department/:department',
  authMiddleware('admin', 'director', 'dean', 'associate_dean', 'hod'),
  getAppraisalsByDepartment
);

// POST /appraisal
// Create a new DRAFT appraisal for the authenticated faculty member.
router.post('/', createAppraisal);


// GET /appraisal/:userId
// Fetch the full appraisal document — owner or evaluator roles.
router.get('/:userId', getAppraisalByUserId);

// PUT /appraisal/:userId/part-a  — Academic Involvement
router.put('/:userId/part-a', updatePartA);

// PUT /appraisal/:userId/part-b  — Research & Innovations
router.put('/:userId/part-b', updatePartB);

// PUT /appraisal/:userId/part-c  — Self Development
router.put('/:userId/part-c', updatePartC);

// PUT /appraisal/:userId/part-d  — Portfolio (faculty self-assessment fields only)
router.put('/:userId/part-d', updatePartD);

// PUT /appraisal/:userId/part-d/evaluator
// Dean / HOD / Director enters their evaluation marks after faculty submission.
router.put(
  '/:userId/part-d/evaluator',
  authMiddleware('director', 'dean', 'associate_dean', 'hod'),
  updatePartDEvaluator
);

// PUT /appraisal/:userId/part-e  — Extraordinary Contributions
router.put('/:userId/part-e', updatePartE);


// PATCH /appraisal/:userId/declaration
router.patch('/:userId/declaration', updateDeclaration);


// PATCH /appraisal/:userId/submit
// Faculty freezes and submits their appraisal (DRAFT → SUBMITTED).
router.patch('/:userId/submit', submitAppraisal);

// PATCH /appraisal/:userId/verify
// Dean / HOD enters verified marks (SUBMITTED → VERIFIED).
router.patch(
  '/:userId/verify',
  authMiddleware('director', 'dean', 'associate_dean', 'hod'),
  verifyAppraisal
);

// PATCH /appraisal/:userId/approve
// Director / Dean gives final approval (VERIFIED → APPROVED).
router.patch(
  '/:userId/approve',
  authMiddleware('director', 'dean'),
  approveAppraisal
);


// DELETE /appraisal/:userId
// Owner can delete their own DRAFT appraisal only.
router.delete('/:userId', deleteAppraisal);

export default router;
