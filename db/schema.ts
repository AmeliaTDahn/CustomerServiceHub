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
  customerId: integer("customer_id").references(() => users.id).notNull(),
  businessId: integer("business_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const ticketsRelations = relations(tickets, ({ one }) => ({
  customer: one(users, {
    fields: [tickets.customerId],
    references: [users.id]
  }),
  business: one(users, {
    fields: [tickets.businessId],
    references: [users.id]
  })
}));

export const usersRelations = relations(users, ({ many }) => ({
  customerTickets: many(tickets, { relationName: "customer" }),
  businessTickets: many(tickets, { relationName: "business" })
}));

// Create base schemas
const baseUserSchema = {
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["business", "customer"])
};

export const insertUserSchema = z.object(baseUserSchema);
export const selectUserSchema = createSelectSchema(users);
export const insertTicketSchema = createInsertSchema(tickets);
export const selectTicketSchema = createSelectSchema(tickets);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;