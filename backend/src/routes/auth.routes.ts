import { Router } from 'express';
import { getAuthMe, getAuthMode, postLogin, postSignup } from '../controllers/auth.controller';
import { requireAuthToken } from '../middleware/auth.middleware';

export const authRouter = Router();

authRouter.get('/mode', getAuthMode);
authRouter.post('/signup', (req, res) => {
  void postSignup(req, res);
});
authRouter.post('/login', (req, res) => {
  void postLogin(req, res);
});
authRouter.get('/me', requireAuthToken, getAuthMe);
