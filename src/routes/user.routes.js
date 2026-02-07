import { Router } from "express";
import {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    cloudinaryTest,
    getWatchHistory,
    getUserChannelProfile
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js"
import { verifyJWT } from "../middlewares/auth.middleware.js";
console.log("USER ROUTES LOADED !!!");

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
// POST REQUEST
router.route("/logout").post(verifyJWT, logoutUser) //3. Logout
router.route("/refresh-token").post(refreshAccessToken) // 4. get new refreshToken
router.route("/change-password").post(verifyJWT, changeCurrentPassword) //5. Change password

// PATCH REQUEST
router.route("/update-user-account-details").patch(verifyJWT, updateAccountDetails) // 6. update user avatar
router.route("/update-avatar").patch(verifyJWT, upload.single("avatar"), updateUserAvatar) // 7. update user avatar
router.route("/update-cover-image").patch(verifyJWT, upload.single("coverImage"), updateUserCoverImage) // 8. update user cover image

// GET REQUEST
router.route("/channel/:userId").get(getUserChannelProfile) // 9. get user channel profile
router.route("/current-user").get(verifyJWT, getCurrentUser) // 10. get current user details
router.route("/watch-history").get(verifyJWT, getWatchHistory) // 11. get watch history

// DELETE REQUEST
router.delete("/delete-test/:publicId", cloudinaryTest); // 12. cloudinary test

export default router