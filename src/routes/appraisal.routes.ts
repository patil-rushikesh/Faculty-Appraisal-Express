import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getAppraisalByUserId,
  getAppraisalsByDepartment,
  getAppraisalsByRole,
  updatePartA,
  updatePartB,
  updatePartC,
  updatePartD,
  portfolioMarksEvaluator,
  updatePartE,
  updateDeclaration,
  submitAppraisal,
  submitVerifiedMarks,
  sendToDirector,
  getSentToDirectorAppraisals,
} from '../handlers/appraisal.handler';
import { downloadAppraisalPDF } from '../handlers/pdf.handler';

const router = Router();

// Every route in this file requires a valid JWT.
router.use(authMiddleware());

// Must be declared BEFORE /:userId to avoid Express matching "department" as a userId.
router.get(
  '/department/:department',
  authMiddleware('hod', 'director'),
  getAppraisalsByDepartment
);

// Director fetches all appraisals for users with a given role (hod/dean)
router.get(
  '/by-role/:role',
  authMiddleware('director'),
  getAppraisalsByRole
);

// Director fetches all appraisals sent by HODs
router.get(
  '/sent-to-director',
  authMiddleware('director'),
  getSentToDirectorAppraisals
);

// GET /appraisal/:userId/pdf
router.get('/:userId/pdf', downloadAppraisalPDF);

// Fetch the full appraisal document — owner or evaluator roles.
router.get('/:userId', getAppraisalByUserId);

router.put('/:userId/part-a', updatePartA);
router.put('/:userId/part-b', updatePartB);
router.put('/:userId/part-c', updatePartC);
router.put('/:userId/part-d', updatePartD);
router.put('/:userId/part-e', updatePartE);


router.patch('/:userId/declaration', updateDeclaration);
router.patch('/:userId/submit', submitAppraisal);

// HOD or Director submits verified marks and moves to interaction pending
router.post('/:userId/verify-marks', authMiddleware('hod', 'director'), submitVerifiedMarks);

// HOD sends completed appraisal to director
router.patch('/:userId/send-to-director', authMiddleware('hod'), sendToDirector);

router.put(
  '/:userId/part-d/evaluator',
  authMiddleware('dean', 'hod', 'director'),
  portfolioMarksEvaluator
);

export default router;
