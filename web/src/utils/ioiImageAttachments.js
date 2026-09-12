/**
 * Quick IOI image attachment helpers (PNG/JPG only).
 * Limits mirror backend googleGmailService / feedback image caps.
 */

export const IOI_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IOI_IMAGE_MAX_COUNT = 4;
export const IOI_IMAGE_ACCEPT = 'image/png,image/jpeg,.png,.jpg,.jpeg';
const ALLOWED = new Set(['image/png', 'image/jpeg']);

function normalizeMime(file) {
  const type = String(file?.type || '').toLowerCase();
  if (ALLOWED.has(type)) return type;
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return type;
}

/**
 * @param {File} file
 * @returns {Promise<{ id: string, filename: string, mimeType: string, size: number, dataBase64: string, previewUrl: string }>}
 */
export function readIoiImageFile(file) {
  return new Promise((resolve, reject) => {
    const mimeType = normalizeMime(file);
    if (!ALLOWED.has(mimeType)) {
      reject(new Error('Only PNG and JPG/JPEG images are allowed'));
      return;
    }
    if (!file || file.size <= 0) {
      reject(new Error('Could not read that image'));
      return;
    }
    if (file.size > IOI_IMAGE_MAX_BYTES) {
      reject(new Error(`Each image must be ${Math.round(IOI_IMAGE_MAX_BYTES / 1024 / 1024)}MB or smaller`));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      const dataBase64 = comma >= 0 ? result.slice(comma + 1) : result;
      if (!dataBase64) {
        reject(new Error('Could not read that image'));
        return;
      }
      resolve({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        filename: file.name || (mimeType === 'image/png' ? 'image.png' : 'image.jpg'),
        mimeType,
        size: file.size,
        dataBase64,
        previewUrl: result.startsWith('data:') ? result : `data:${mimeType};base64,${dataBase64}`
      });
    };
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate a FileList / File[] against limits and existing count.
 * @returns {{ accepted: File[], error: string|null }}
 */
export function filterIoiImageFiles(files, existingCount = 0) {
  const list = Array.from(files || []);
  if (!list.length) return { accepted: [], error: null };

  const room = Math.max(0, IOI_IMAGE_MAX_COUNT - existingCount);
  if (room <= 0) {
    return { accepted: [], error: `You can attach up to ${IOI_IMAGE_MAX_COUNT} images` };
  }

  const accepted = [];
  for (const file of list) {
    const mimeType = normalizeMime(file);
    if (!ALLOWED.has(mimeType)) {
      return {
        accepted: [],
        error: `"${file.name || 'File'}" is not a PNG or JPG. Only PNG and JPG/JPEG are allowed.`
      };
    }
    if (file.size > IOI_IMAGE_MAX_BYTES) {
      return {
        accepted: [],
        error: `"${file.name || 'File'}" is too large. Each image must be ${Math.round(IOI_IMAGE_MAX_BYTES / 1024 / 1024)}MB or smaller.`
      };
    }
    accepted.push(file);
    if (accepted.length >= room) break;
  }

  if (list.length > room) {
    return {
      accepted,
      error: `Only ${room} more image${room === 1 ? '' : 's'} can be added (max ${IOI_IMAGE_MAX_COUNT}).`
    };
  }

  return { accepted, error: null };
}

export function attachmentsForGmailApi(images) {
  return (images || []).map((img) => ({
    filename: img.filename,
    mimeType: img.mimeType,
    dataBase64: img.dataBase64
  }));
}
