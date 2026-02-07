import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.models.js";
console.log("USER CONTROLLER LOADED !!!");
import { uploadOnCloudinary, deleteFromCloudinary, checkIfFileExists } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

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
                { $set: { refreshToken: null } },
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

const cloudinaryTest = asyncHandler(async (req, res) => { //Cloudinary delete test
    const { publicId } = req.params;
    console.log("Public ID to be deleted:", publicId);

    if (!publicId || publicId.trim() === "") {
        throw new ApiError(400, "Public ID is required");
    }

    try {
        const fileStatus = await checkIfFileExists(publicId);
        console.log("File exists on Cloudinary.");
        console.log(fileStatus);

    } catch (error) {
        throw new ApiError(401, "File does not exists", error)
    }


    const imgStatus = await deleteFromCloudinary(publicId);
    console.log(imgStatus)

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Test Image deleted successfully"));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params
    if (!username?.trim()) {
        throw new ApiError(400, "username is missing")
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscriberCount: "$subscribersCount",
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
            }
        }
    ])

    if (!channel || channel.length === 0) {
        throw new ApiError(404, "Channel not found")
    }
    return res
        .status(200)
        .json(new ApiResponse(200, channel[0], "Channel profile fetched successfully"))
})

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id) // matching user id from req.user with _id in User collection
            }                                                  // userdata has been received and passed to next stage
        },
        {   // userdata has been received and passed here
            $lookup: {
                from: "videos",
                localField: "watchHistory", // its an array
                foreignField: "_id", // matching watchHistory[0,1,2,3...] === videos._id one by one
                as: "watchHistory", // same key will be updated; watchHistory: [{object data}({_id, owner, title, description, thumbnail, videoFile, duration, views}), {}, {}, ...]

                // Explanation: Upto this point, I have matched userIds from watchHistory and updated the key with respective video documents which contains the video data

                pipeline: [ // in this stage we have access to each video document which matched with watchHistory array of user document
                    {  //watchHistory: [{object data}({_id, owner, title, description, thumbnail, videoFile, duration, views}), {}, {}, ...] has been passed here
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id", // matching {object}.owner === videos._id one by one for each object inside watchHistory
                            as: "owner", //same key will be updated; owner: [{_id, fullName, username, avatar, and other data from users collection}, {}, {}, ...]
                            pipeline: [ // in this stage we have access to each owner document which matched with videos.owner field
                                {   // owner: [{_id, fullName, username, avatar, and other data from users collection}, {}, {}, ...] has been passed here
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    } //only these 3 fields will be sent in response for owner data, other fields will be excluded
                                }
                            ]
                        } // final owner data will be like this: owner: [{_id, fullName, username, avatar}, {}, {}, ...]
                    },
                    // in this stage we have access to each video document with owner data embedded inside it, we can reshape the data as per our requirement for frontend
                    // upto this point watchHistory: [{_id, owner: [{_id, fullName, username, avatar}, {}, {}, ...], title, description, thumbnail, videoFile, duration, views}, {}, {}, ...]

                    // Explanation: upto this point, I have matched the owners, find them and add their data as objects as an array

                    /*
                        user: {
                            _id: id
                            avatar: url,
                            avatarPublicId: string,
                            coverImage: url,
                            coverImagePublicId: string,
                            email: string,
                            fullName: string,
                            password: string,
                            refreshToken: string,
                            username: string,
                            watchHistory: [ // array of video objects with owner data embedded inside each video object
                                {
                                    _id: id,
                                    videoFile: url,
                                    thumbnail: url,
                                    owner: [ // array of owner objects, but it will contain only one object because one video can have only one owner
                                        {
                                            _id: id,
                                            fullName: string,
                                            username: string,
                                            avatar: url
                                        }
                                    ]
                                    title: string,
                                    description: string,
                                    duration: number,
                                    views: number,
                                    isPublished: boolean,
                            ]
                            createdAt: date,
                            updatedAt: date
                        }
                    */

                    {
                        $addFields: {
                            owner: { $first: "$owner" }  // $first operator is used to get the first element of the owner array and set it as an object to owner key, because we know that there will be only one owner for each video, so instead of sending owner as an array with one object, we can reshape it to send only the object for easier access in frontend, "$owner" is the owner array which we got from previous lookup stage, and we are taking the first element of that array and setting it as an object to owner key
                        }
                    }

                    // Explanation: upto this point, I have reshaped the owner data from an array to an object because we know that there will be only one owner for each video, so instead of sending owner as an array with one object, I have reshaped it to send only the object for easier access in frontend

                    /*
                        user: {
                            _id: id
                            avatar: url,
                            avatarPublicId: string,
                            coverImage: url,
                            coverImagePublicId: string,
                            email: string,
                            fullName: string,
                            password: string,
                            refreshToken: string,
                            username: string,
                            watchHistory: [ // array of video objects with owner data embedded inside each video object
                                {
                                    _id: id,
                                    videoFile: url,
                                    thumbnail: url,
                                    owner: { // owner object instead of array
                                            _id: id,
                                            fullName: string,
                                            username: string,
                                            avatar: url
                                    }
                                    title: string,
                                    description: string,
                                    duration: number,
                                    views: number,
                                    isPublished: boolean,
                            ]
                            createdAt: date,
                            updatedAt: date
                        }
                    */
                ]
            }
        }
    ])

    // So, the final output of this aggregation will be an array with one user object which contains the watchHistory array with video objects and each video object contains the owner data as an object embedded inside it, and we can send this data in response to frontend for displaying the watch history with video and owner details


    /*
        user: {
        _id: id,
        avatar: url,
        avatarPublicId: string,
        coverImage: url,
        coverImagePublicId: string,
        email: string,
        fullName: string,
        password: string,
        refreshToken: string,
        username: string,
        watchHistory: [
            {
            _id: id,
            videoFile: url,
            thumbnail: url,
            owner: {
                _id: id,
                fullName: string,
                username: string,
                avatar: url
            },
            title: string,
            description: string,
            duration: number,
            views: number,
            isPublished: boolean
            }
        ],
        createdAt: date,
        updatedAt: date
        }
    */

    return res.status(200).json(
        new ApiResponse(
            200,
            user[0]?.watchHistory || [],
            "Watch history fetched successfully"
        )
    )
})

export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage, cloudinaryTest, getUserChannelProfile, getWatchHistory }