import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary.
 * Returns { url, publicId } on success.
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  options: {
    folder?: string;
    resourceType?: 'image' | 'raw' | 'auto';
    publicId?: string;
  } = {}
): Promise<{ url: string; publicId: string }> {
  const { folder = 'academy-uploads', resourceType = 'auto', publicId } = options;

  return new Promise((resolve, reject) => {
    const uploadOptions: Record<string, any> = {
      folder,
      resource_type: resourceType,
    };
    if (publicId) {
      uploadOptions.public_id = publicId;
    } else if (resourceType === 'raw') {
      // Raw files (PDFs) keep the extension only if it is part of the public_id;
      // without it the delivered URL has no .pdf and browsers can't open it.
      uploadOptions.public_id = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`;
    }

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          return reject(error);
        }
        if (!result) {
          return reject(new Error('Cloudinary returned no result'));
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    stream.end(buffer);
  });
}

/**
 * Delete a file from Cloudinary by its public_id.
 * Silently logs errors (best-effort deletion).
 */
export async function deleteFromCloudinary(publicId: string, resourceType: string = 'image'): Promise<boolean> {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result.result === 'ok';
  } catch (error) {
    console.warn('Cloudinary deletion failed for', publicId, error);
    return false;
  }
}

/**
 * Extract the Cloudinary public_id from a full Cloudinary URL.
 * E.g. "https://res.cloudinary.com/xxx/image/upload/v123/academy-uploads/file.jpg"
 *   → "academy-uploads/file"
 */
export function extractPublicId(url: string): string | null {
  try {
    // Raw resources keep the extension in their public_id; images do not
    if (url.includes('/raw/upload/')) {
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
      return match ? match[1] : null;
    }
    // Match the path after /upload/v<digits>/
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export { cloudinary };
