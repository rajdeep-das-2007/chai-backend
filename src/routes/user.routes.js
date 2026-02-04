import { Router } from "express";
import { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage, cloudinaryTest } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router()

router.route("/register").post( //1. Register
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),
    registerUser
)

router.route("/login").post(loginUser) // 2. Login

//secure route - need to verify JWT
router.route("/logout").post(verifyJWT, logoutUser) //3. Logout
router.route("/refresh-token").post(refreshAccessToken) // 4. get new refreshToken
router.route("/change-password").post(verifyJWT, changeCurrentPassword) //5. Change password
router.route("/update-user-account-details").put(verifyJWT, updateAccountDetails) // 6. update user avatar
router.route("/update-avatar").put(upload.single("avatar"), verifyJWT, updateUserAvatar) // 8. update user avatar
router.route("/update-cover-image").put(upload.single("coverImage"), verifyJWT, updateUserCoverImage) // 9. update user cover image
router.route("/currentUser").get(verifyJWT, getCurrentUser) // 10. get current user details
router.delete("/delete-test/:publicId", cloudinaryTest); // 11. cloudinary test

export default router