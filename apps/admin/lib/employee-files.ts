export const EMPLOYEE_FILE_MAX_BYTES = 10 * 1024 * 1024;

export type EmployeeFileArea = "photos" | "documents";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function employeeFileError(file: File, area: EmployeeFileArea): string | null {
  if (file.size <= 0) return "Fail on tühi.";
  if (file.size > EMPLOYEE_FILE_MAX_BYTES) return "Fail võib olla kuni 10 MB.";
  if (!MIME_EXTENSIONS[file.type]) return "Failitüüp ei ole lubatud.";
  if (area === "photos" && !PHOTO_MIME_TYPES.has(file.type)) {
    return "Foto peab olema JPG, PNG või WebP.";
  }
  return null;
}

export function employeeStoragePath(
  companyId: string,
  employeeId: string,
  area: EmployeeFileArea,
  file: File,
): string {
  const extension = MIME_EXTENSIONS[file.type];
  return `company/${companyId}/employees/${employeeId}/${area}/${crypto.randomUUID()}.${extension}`;
}
