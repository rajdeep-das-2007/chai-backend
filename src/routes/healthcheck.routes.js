import { Router } from "express";
import { healthcheck } from "../controllers/healthcheck.controller";
import { verifyJWT } from "../middlewares/auth.middleware";

const router = Router()
router.route('/').get(healthcheck);
export default router