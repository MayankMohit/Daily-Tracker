import { ok, fail, handler } from "@/lib/api";
import {
  listBackgroundImages,
  addBackgroundImage,
  isAllowedImageType,
  MAX_UPLOAD_BYTES,
  BackgroundLimitError,
  BlobNotConfiguredError,
} from "@/lib/services/backgrounds";

export const GET = handler(async () => {
  return ok(await listBackgroundImages());
});

// Accepts a compressed image as multipart/form-data (`file`). The browser shrinks
// and re-encodes the picture before it gets here (see lib/image-compress), so the
// body stays small; we still cap the size and validate the type server-side.
export const POST = handler(async (req: Request) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Expected a multipart form upload");
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) return fail("No image file provided");
  if (!isAllowedImageType(file.type)) {
    return fail("Unsupported image type", 415);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail("Image is too large after compression", 413);
  }

  try {
    const image = await addBackgroundImage(file, file.type);
    return ok(image, { status: 201 });
  } catch (err) {
    if (err instanceof BackgroundLimitError) return fail(err.message, 409);
    if (err instanceof BlobNotConfiguredError) return fail(err.message, 503);
    throw err;
  }
});
