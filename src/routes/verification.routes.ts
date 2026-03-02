import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  getAssignedFaculties,
  getVerificationStatus,
  getPartBForVerification,
  finalizeVerification
} from '../handlers/verificationTeam.handler';

const router = Router();

// All verification routes require authentication
router.use(authMiddleware());

// Get faculties assigned to the logged-in verifier
router.get('/assigned-faculties', getAssignedFaculties);

// Get verification status for a specific faculty
router.get('/status/:facultyId', getVerificationStatus);

// Get Part B appraisal data for verification
router.get('/part-b/:facultyId', getPartBForVerification);

// Finalize verification and update status
router.post('/finalize/:facultyId', finalizeVerification);

export default router;
