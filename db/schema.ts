import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  role: text("role", { enum: ["business", "customer", "employee"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const businessEmployees = pgTable("business_employees", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").references(() => users.id).notNull(),
  employeeId: integer("employee_id").references(() => users.id).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const employeeInvitations = pgTable("employee_invitations", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").references(() => users.id).notNull(),
  employeeId: integer("employee_id").references(() => users.id).notNull(),
  status: text("status", { enum: ["pending", "accepted", "rejected"] }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

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
  customerId: integer("customer_id").references(() => users.id).notNull(),
  businessId: integer("business_id").references(() => users.id).notNull(),
  assignedToId: integer("assigned_to_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const ticketFeedback = pgTable("ticket_feedback", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ticketNotes = pgTable("ticket_notes", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id).notNull(),
  businessId: integer("business_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const businessEmployeesRelations = relations(businessEmployees, ({ one }) => ({
  business: one(users, {
    fields: [businessEmployees.businessId],
    references: [users.id]
  }),
  employee: one(users, {
    fields: [businessEmployees.employeeId],
    references: [users.id]
  })
}));

export const employeeInvitationsRelations = relations(employeeInvitations, ({ one }) => ({
  business: one(users, {
    fields: [employeeInvitations.businessId],
    references: [users.id]
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
  business: one(users, {
    fields: [tickets.businessId],
    references: [users.id]
  }),
  assignedTo: one(users, {
    fields: [tickets.assignedToId],
    references: [users.id]
  }),
  notes: many(ticketNotes),
  feedback: many(ticketFeedback)
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
  business: one(users, {
    fields: [ticketNotes.businessId],
    references: [users.id]
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
  })
}));

export const usersRelations = relations(users, ({ many }) => ({
  customerTickets: many(tickets, { relationName: "customer" }),
  businessTickets: many(tickets, { relationName: "business" }),
  ticketNotes: many(ticketNotes),
  sentMessages: many(messages, { relationName: "sender" }),
  receivedMessages: many(messages, { relationName: "receiver" }),
  employeeOf: many(businessEmployees, { relationName: "employee" }),
  employees: many(businessEmployees, { relationName: "business" }),
  sentInvitations: many(employeeInvitations, { relationName: "business" }),
  receivedInvitations: many(employeeInvitations, { relationName: "employee" })
}));

const baseUserSchema = {
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["business", "customer", "employee"])
};

export const insertUserSchema = z.object(baseUserSchema);
export const selectUserSchema = createSelectSchema(users);
export const insertBusinessEmployeeSchema = createInsertSchema(businessEmployees);
export const selectBusinessEmployeeSchema = createSelectSchema(businessEmployees);
export const insertEmployeeInvitationSchema = createInsertSchema(employeeInvitations);
export const selectEmployeeInvitationSchema = createSelectSchema(employeeInvitations);

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
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