import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  username: z.string().min(1, "Username is required"),
  role: z.enum(["business", "customer", "employee"]),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  phoneNumber: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type User = z.infer<typeof userSchema>;

export const ticketSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  status: z.enum(["open", "in_progress", "resolved"]).default("open"),
  category: z.enum([
    "technical",
    "billing",
    "feature_request",
    "general_inquiry",
    "bug_report"
  ]).default("general_inquiry"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  customerId: z.string(),
  businessId: z.string(),
  assignedToId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Ticket = z.infer<typeof ticketSchema>;

export const messageSchema = z.object({
  id: z.string(),
  content: z.string().min(1, "Message content is required"),
  senderId: z.string(),
  receiverId: z.string(),
  createdAt: z.string(),
});

export type Message = z.infer<typeof messageSchema>;

export const ticketNoteSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  businessId: z.string(),
  content: z.string().min(1, "Note content is required"),
  createdAt: z.string(),
});

export type TicketNote = z.infer<typeof ticketNoteSchema>;

export const ticketFeedbackSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
  createdAt: z.string(),
});

export type TicketFeedback = z.infer<typeof ticketFeedbackSchema>;

export const businessEmployeeSchema = z.object({
    id: z.string(),
    businessId: z.string(),
    employeeId: z.string(),
    isActive: z.boolean().default(true),
    createdAt: z.string()
})

export type BusinessEmployee = z.infer<typeof businessEmployeeSchema>

export const employeeInvitationSchema = z.object({
    id: z.string(),
    businessId: z.string(),
    employeeId: z.string(),
    status: z.enum(["pending", "accepted", "rejected"]).default("pending"),
    createdAt: z.string(),
    updatedAt: z.string()
})

export type EmployeeInvitation = z.infer<typeof employeeInvitationSchema>