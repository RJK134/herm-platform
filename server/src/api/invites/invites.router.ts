import { Router } from 'express';
import { getInviteByToken, claimInvite } from './invites.controller';

const router = Router();

// PUBLIC routes — the claim flow runs before the user has any auth
// session. Tokens are 32-byte random secrets; possession proves identity.
router.get('/:token', getInviteByToken);
router.post('/:token/claim', claimInvite);

export default router;
