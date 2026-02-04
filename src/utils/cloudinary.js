import { v2 as cloudinary } from "cloudinary"
// import { response } from "express";
import fs from "fs"

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) {
            return null
        }

        //upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        //file has been uploaded successfully
        console.log("file is uploaded on cloudinary", response.url);
        fs.unlinkSync(localFilePath)
        return response
    } catch (error) {
        fs.unlinkSync(localFilePath) // remove the locally saved temporary file as the upload operation got failed

        return null;
    }
}

const deleteFromCloudinary = async (publicId) => {
    try {
        if (!publicId) {
            return;
        }
        await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
        console.log(`File with public ID ${publicId} deleted from Cloudinary.`);
    } catch (error) {
        console.error("Error deleting file from Cloudinary:", error);
    }
}

export { uploadOnCloudinary, deleteFromCloudinary };