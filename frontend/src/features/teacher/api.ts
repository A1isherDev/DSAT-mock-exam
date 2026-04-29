import { classesApi, examsAdminApi, examsPublicApi } from "@/lib/api";

/**
 * Teacher surface API boundary.
 * Teacher pages are staff-ish but live on the main domain; centralize access patterns here.
 */
export const teacherApi = {
  classes: classesApi,
  examsPublic: examsPublicApi,
  examsAdmin: examsAdminApi,
};

