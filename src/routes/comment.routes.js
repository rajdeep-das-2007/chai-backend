import { Router } from "express";
import { getVideoComments, addComment, updateComment, deleteComment } from "../controllers/comment.controller";

import { verifyJWT } from "../middlewares/auth.middleware";

console.log("COMMENT ROUTER LOADED!!!")

const router = Router()
router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router.route("/:videoId").get(getVideoComments).post(addComment);
router.route("/c/:commentId").delete(deleteComment).patch(updateComment);
router.route()

export default router