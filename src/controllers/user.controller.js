import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.models.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })
        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "something went wrong while generating refresh and access token")
    }
}

const registerUser = asyncHandler(async (req, res) => {
    /*
        1. Get user details from frontend
        2. validation - not empty
        3. check if user already exists: username and email
        4. check for images, check for avatar
        5. upload them to cloudinary, avatar
        6. create user object - create entry in db
        7. remove password and refresh token field from response
        8. check for user creation
        9. return res
    */

    const { fullName, email, username, password } = req.body
    console.table({ fullName, email, username, password });

    if (
        [fullName, email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }


    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath = "";
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase(),
        avatarPublicId: avatar.public_id,
        coverImagePublicId: coverImage?.public_id || "",
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    console.log(avatar)
    console.log(coverImage)

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully!")
    )
})

const loginUser = asyncHandler(async (req, res) => {
    /*
        1. req body -> data
        2. get username or email
        3. find the user
        4. password check
        5. access and refresh token
        6. send cookie
    */

    const { email, username, password } = req.body
    console.table({ email, username, password });

    if (!username && !email) {
        throw new ApiError(400, "Username or Email is required to login")
    }

    if (
        [email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (!user) {
        throw new ApiError(404, "User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    if (!isPasswordValid) {
        throw new ApiError(400, "Invalid credentials");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id)

    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                { user: loggedInUser, accessToken, refreshToken },
                "User logged in successfully!"
            )
        )
})

const logoutUser = asyncHandler(async (req, res) => {
    /*
        1. get user id from req.user
        2. find the user from db
        3. remove refresh token from db
        4. send res
    */
    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: { refreshToken: null }
        },
        {
            new: true
        }
    )
    console.log(user);

    if (!user) {
        throw new ApiError(404, "User not found")
    }

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)

        const user = await User.findById(decodedToken?._id)

        if (!user) {
            throw new ApiError(401, "Invalid Refresh Token")
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            await User.findByIdAndUpdate(
                user._id,
                { $set: { refreshToken: undefined } },
                { new: true }
            )

            throw new ApiError(401, "Session expired, please login again")
        }

        const options = {
            httpOnly: true,
            secure: true
        }

        const { accessToken, newRefreshToken } = await generateAccessAndRefreshToken(user._id)

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(200, { accessToken, refreshToken: newRefreshToken }, "Access token refreshed successfully!")
            )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword, confirm_password } = req.body

    if (oldPassword?.trim() === "" || newPassword?.trim() === "" || confirm_password?.trim() === "") {
        throw new ApiError(400, "All fields are required")
    }

    if (!oldPassword || !newPassword || !confirm_password) {
        throw new ApiError(400, "All fields are required")
    }

    if (oldPassword === newPassword) {
        throw new ApiError(400, "Old password and newPassword cannot be same")
    }

    if (newPassword !== confirm_password) {
        throw new ApiError(400, "newPassword and confirm_password mismatched")
    }

    const user = await User.findById(req.user?._id)

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password")
    }


    user.password = newPassword
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"))
})

const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user?._id)

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Current User fetched successfully"))
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body;
    if (fullName?.trim() === "" || email?.trim() === "") {
        throw new ApiError(400, "Full name and email are required");
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName: fullName,
                email: email
            }
        },
        { new: true }
    ).select("-password")

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Account details updated successfully"));
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path
    const avatarOldPublicId = req.user?.avatarPublicId
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) {
        throw new ApiError(400, "error while uploading new avatar in cloudinary while updating")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url,
                avatarPublicId: avatar.public_id
            }
        },
        {
            new: true
        }
    ).select("-password")

    // Delete old avatar from cloudinary could be added here
    if (avatarOldPublicId) {
        await deleteFromCloudinary(avatarOldPublicId)
    }

    return res
        .status(200)
        .json(new ApiResponse(200, { user, updatedURL: avatar.url }, "Avatar Successfully updated"))
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path
    const coverImageOldPublicId = req.user?.coverImagePublicId
    if (!coverImageLocalPath) {
        throw new ApiError(400, "coverImage file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!coverImage.url) {
        throw new ApiError(400, "error while uploading new coverImage in cloudinary while updating")
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                coverImage: coverImage.url,
                coverImagePublicId: coverImage.public_id
            }
        },
        {
            new: true
        }
    ).select("-password")


    // Delete old coverImage
    if (coverImageOldPublicId) {
        await deleteFromCloudinary(coverImageOldPublicId)
    }

    return res
        .status(200)
        .json(new ApiResponse(200, { user, coverImageURL: coverImage.url }, "CoverImage Successfully updated"))
})

const cloudinaryTest = asyncHandler(async (req, res) => {
    console.log("req.body:", req.body);
    console.log("typeof req.body:", typeof req.body);

    const { testImagePublicId } = req.body;

    console.log("Public ID to be deleted:", testImagePublicId);

    if (!testImagePublicId || testImagePublicId.trim() === "") {
        throw new ApiError(400, "Public ID is required to delete the image");
    }

    const imgStatus = await deleteFromCloudinary(testImagePublicId);

    console.log(imgStatus);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Test Image deleted successfully"));
});


export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage, cloudinaryTest }