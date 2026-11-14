import { z } from "zod";

export const ALLOWED_PAGE_SIZES = [15, 25, 50] as const;
export type AllowedPageSize = (typeof ALLOWED_PAGE_SIZES)[number];

export function normalizePagination(
  pageParam: string | number | null | undefined,
  pageSizeParam: string | number | null | undefined
): { page: number; pageSize: AllowedPageSize; skip: number; take: AllowedPageSize } {
  const rawPage = Number(pageParam ?? 1);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const rawSize = Number(pageSizeParam ?? 15);
  const pageSize: AllowedPageSize = ALLOWED_PAGE_SIZES.includes(rawSize as AllowedPageSize)
    ? (rawSize as AllowedPageSize)
    : 15;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name is required").max(120),
    email: z.string().trim().email("Enter a valid email address").toLowerCase(),
    studentIdNo: z
      .string()
      .trim()
      .min(4, "Student ID number is required")
      .max(32),
    program: z.string().trim().min(2, "Program is required").max(40),
    section: z.string().trim().min(1, "Section is required").max(40),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  });
