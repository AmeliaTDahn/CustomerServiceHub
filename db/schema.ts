import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  role: text("role", { enum: ["business", "customer"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
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
  businessId: integer("business_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const ticketNotes = pgTable("ticket_notes", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id).notNull(),
  businessId: integer("business_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  customer: one(users, {
    fields: [tickets.customerId],
    references: [users.id]
  }),
  business: one(users, {
    fields: [tickets.businessId],
    references: [users.id]
  }),
  notes: many(ticketNotes)
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

export const usersRelations = relations(users, ({ many }) => ({
  customerTickets: many(tickets, { relationName: "customer" }),
  businessTickets: many(tickets, { relationName: "business" }),
  ticketNotes: many(ticketNotes)
}));

const baseUserSchema = {
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["business", "customer"])
};

export const insertUserSchema = z.object(baseUserSchema);
export const selectUserSchema = createSelectSchema(users);
export const insertTicketSchema = createInsertSchema(tickets);
export const selectTicketSchema = createSelectSchema(tickets);
export const insertTicketNoteSchema = createInsertSchema(ticketNotes);
export const selectTicketNoteSchema = createSelectSchema(ticketNotes);

export type User = {
  id: number;
  username: string;
  password: string;
  role: "business" | "customer";
  createdAt: Date;
};

export type NewUser = typeof users.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type TicketNote = typeof ticketNotes.$inferSelect;
export type NewTicketNote = typeof ticketNotes.$inferInsert;