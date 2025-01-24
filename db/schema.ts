import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Base user table to store auth info
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Changed to text for UUID compatibility
  username: text("username").unique().notNull(),
  role: text("role", { enum: ["business", "customer", "employee"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// Business details table
export const businessProfiles = pgTable("business_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull().unique(),
  businessName: text("business_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const businessEmployees = pgTable("business_employees", {
  id: serial("id").primaryKey(),
  businessProfileId: integer("business_profile_id").references(() => businessProfiles.id).notNull(),
  employeeId: text("employee_id").references(() => users.id).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const employeeInvitations = pgTable("employee_invitations", {
  id: serial("id").primaryKey(),
  businessProfileId: integer("business_profile_id").references(() => businessProfiles.id).notNull(),
  employeeId: text("employee_id").references(() => users.id).notNull(),
  status: text("status", { enum: ["pending", "accepted", "rejected"] }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Updated tickets table with text IDs for users
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: ["open", "in_progress", "resolved"] }).default("open").notNull(),
  category: text("category", {
    enum: ["technical", "billing", "feature_request", "general_inquiry", "bug_report"]
  }).default("general_inquiry").notNull(),
  priority: text("priority", {
    enum: ["low", "medium", "high", "urgent"]
  }).default("medium").notNull(),
  customerId: text("customer_id").references(() => users.id).notNull(),
  businessProfileId: integer("business_profile_id").references(() => businessProfiles.id).notNull(),
  claimedById: text("claimed_by_id").references(() => users.id),
  claimedAt: timestamp("claimed_at"),
  escalationLevel: text("escalation_level", {
    enum: ["none", "low", "medium", "high"]
  }).default("none").notNull(),
  escalatedAt: timestamp("escalated_at"),
  escalatedById: integer("escalated_by_id").references(() => users.id),
  escalationReason: text("escalation_reason"),
  previousAssigneeId: integer("previous_assignee_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Updated messages table with Supabase-compatible schema
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  ticketId: integer("ticket_id").references(() => tickets.id),
  senderId: text("sender_id").references(() => users.id).notNull(),
  receiverId: text("receiver_id").references(() => users.id).notNull(),
  status: text("status", { enum: ["sending", "sent", "delivered", "read"] }).default("sent").notNull(),
  chatInitiator: boolean("chat_initiator").default(false).notNull(),
  initiatedAt: timestamp("initiated_at"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ticketFeedback = pgTable("ticket_feedback", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const unreadMessages = pgTable("unread_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  ticketId: integer("ticket_id").references(() => tickets.id).notNull(),
  count: integer("count").default(0).notNull(),
  lastReadAt: timestamp("last_read_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ticketNotes = pgTable("ticket_notes", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id).notNull(),
  businessProfileId: integer("business_profile_id").references(() => businessProfiles.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ticketEscalations = pgTable("ticket_escalations", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id).notNull(),
  fromLevel: text("from_level", {
    enum: ["none", "low", "medium", "high"]
  }).notNull(),
  toLevel: text("to_level", {
    enum: ["none", "low", "medium", "high"]
  }).notNull(),
  fromAssigneeId: integer("from_assignee_id").references(() => users.id),
  toAssigneeId: integer("to_assignee_id").references(() => users.id),
  escalatedById: integer("escalated_by_id").references(() => users.id).notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  status: text("status", {
    enum: ["sent", "delivered", "read"]
  }).default("sent").notNull(),
  businessProfileId: integer("business_profile_id").references(() => businessProfiles.id),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations Definitions
// ===================

export const businessProfilesRelations = relations(businessProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [businessProfiles.userId],
    references: [users.id],
  }),
  employees: many(businessEmployees),
  tickets: many(tickets),
  invitations: many(employeeInvitations)
}));

export const businessEmployeesRelations = relations(businessEmployees, ({ one }) => ({
  businessProfile: one(businessProfiles, {
    fields: [businessEmployees.businessProfileId],
    references: [businessProfiles.id]
  }),
  employee: one(users, {
    fields: [businessEmployees.employeeId],
    references: [users.id]
  })
}));

export const employeeInvitationsRelations = relations(employeeInvitations, ({ one }) => ({
  businessProfile: one(businessProfiles, {
    fields: [employeeInvitations.businessProfileId],
    references: [businessProfiles.id]
  }),
  employee: one(users, {
    fields: [employeeInvitations.employeeId],
    references: [users.id]
  })
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  customer: one(users, {
    fields: [tickets.customerId],
    references: [users.id]
  }),
  businessProfile: one(businessProfiles, {
    fields: [tickets.businessProfileId],
    references: [businessProfiles.id]
  }),
  claimedBy: one(users, {
    fields: [tickets.claimedById],
    references: [users.id]
  }),
  escalatedBy: one(users, {
    fields: [tickets.escalatedById],
    references: [users.id]
  }),
  previousAssignee: one(users, {
    fields: [tickets.previousAssigneeId],
    references: [users.id]
  }),
  messages: many(messages),
  notes: many(ticketNotes),
  feedback: many(ticketFeedback),
  escalations: many(ticketEscalations)
}));

export const ticketFeedbackRelations = relations(ticketFeedback, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketFeedback.ticketId],
    references: [tickets.id]
  })
}));

export const ticketNotesRelations = relations(ticketNotes, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketNotes.ticketId],
    references: [tickets.id]
  }),
  businessProfile: one(businessProfiles, {
    fields: [ticketNotes.businessProfileId],
    references: [businessProfiles.id]
  })
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id]
  }),
  receiver: one(users, {
    fields: [messages.receiverId],
    references: [users.id]
  }),
  ticket: one(tickets, {
    fields: [messages.ticketId],
    references: [tickets.id]
  })
}));

export const unreadMessagesRelations = relations(unreadMessages, ({ one }) => ({
  user: one(users, {
    fields: [unreadMessages.userId],
    references: [users.id],
  }),
  ticket: one(tickets, {
    fields: [unreadMessages.ticketId],
    references: [tickets.id],
  }),
}));

export const ticketEscalationsRelations = relations(ticketEscalations, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketEscalations.ticketId],
    references: [tickets.id]
  }),
  fromAssignee: one(users, {
    fields: [ticketEscalations.fromAssigneeId],
    references: [users.id]
  }),
  toAssignee: one(users, {
    fields: [ticketEscalations.toAssigneeId],
    references: [users.id]
  }),
  escalatedBy: one(users, {
    fields: [ticketEscalations.escalatedById],
    references: [users.id]
  })
}));

export const directMessagesRelations = relations(directMessages, ({ one }) => ({
  sender: one(users, {
    fields: [directMessages.senderId],
    references: [users.id]
  }),
  receiver: one(users, {
    fields: [directMessages.receiverId],
    references: [users.id]
  }),
  businessProfile: one(businessProfiles, {
    fields: [directMessages.businessProfileId],
    references: [businessProfiles.id]
  })
}));

export const usersRelations = relations(users, ({ many }) => ({
  customerTickets: many(tickets, { relationName: "customer" }),
  businessTickets: many(tickets, { relationName: "businessProfile" }),
  ticketNotes: many(ticketNotes),
  sentMessages: many(messages, { relationName: "sender" }),
  receivedMessages: many(messages, { relationName: "receiver" }),
  sentDirectMessages: many(directMessages, { relationName: "sender" }),
  receivedDirectMessages: many(directMessages, { relationName: "receiver" }),
  employeeOf: many(businessEmployees, { relationName: "employee" }),
  employees: many(businessEmployees, { relationName: "businessProfile" }),
  sentInvitations: many(employeeInvitations, { relationName: "businessProfile" }),
  receivedInvitations: many(employeeInvitations, { relationName: "employee" })
}));

// Schemas and Types
// ===============

const baseUserSchema = {
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["business", "customer", "employee"]),
  businessName: z.string().optional()
};

export const insertUserSchema = z.object(baseUserSchema);
export const selectUserSchema = createSelectSchema(users);
export const insertBusinessEmployeeSchema = createInsertSchema(businessEmployees);
export const selectBusinessEmployeeSchema = createSelectSchema(businessEmployees);
export const insertEmployeeInvitationSchema = createInsertSchema(employeeInvitations);
export const selectEmployeeInvitationSchema = createSelectSchema(employeeInvitations);
export const insertBusinessProfileSchema = createInsertSchema(businessProfiles);
export const selectBusinessProfileSchema = createSelectSchema(businessProfiles);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type BusinessProfile = typeof businessProfiles.$inferSelect;
export type NewBusinessProfile = typeof businessProfiles.$inferInsert;
export type BusinessEmployee = typeof businessEmployees.$inferSelect;
export type NewBusinessEmployee = typeof businessEmployees.$inferInsert;
export type EmployeeInvitation = typeof employeeInvitations.$inferSelect;
export type NewEmployeeInvitation = typeof employeeInvitations.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type TicketNote = typeof ticketNotes.$inferSelect;
export type NewTicketNote = typeof ticketNotes.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type TicketFeedback = typeof ticketFeedback.$inferSelect;
export type NewTicketFeedback = typeof ticketFeedback.$inferInsert;
export type TicketEscalation = typeof ticketEscalations.$inferSelect;
export type NewTicketEscalation = typeof ticketEscalations.$inferInsert;
export type DirectMessage = typeof directMessages.$inferSelect;
export type NewDirectMessage = typeof directMessages.$inferInsert;