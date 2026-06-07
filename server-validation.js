import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().min(1),
  username: z.string()
    .min(5)
    .regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, underscores, and hyphens allowed")
    .toLowerCase(),
  email: z.string().email(),
  password: z.string().min(6),
  phoneNumber: z.string().min(10),
  referralCode: z.string().optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const purchaseSchema = z.object({
  packageId: z.string(),
  phoneNumber: z.string().min(10)
});

export const depositSchema = z.object({
  amount: z.number().positive(),
  phoneNumber: z.string().min(10)
});

export const withdrawalSchema = z.object({
  amount: z.number().min(10),
  phoneNumber: z.string().min(10)
});

export const investmentSchema = z.object({
  amount: z.number().min(1000),
  phoneNumber: z.string().min(10)
});
