import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { tickets, users, ticketNotes } from "@db/schema";
import { eq, and } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Get all registered businesses
  app.get("/api/businesses", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const businesses = await db.select({
      id: users.id,
      username: users.username
    })
    .from(users)
    .where(eq(users.role, "business"));

    res.json(businesses);
  });

  // Ticket management routes
  app.post("/api/tickets", async (req, res) => {
    if (!req.user || req.user.role !== "customer") {
      return res.status(403).send("Only customers can create tickets");
    }

    const { title, description, businessId } = req.body;

    // Verify that the selected business exists
    const [business] = await db.select()
      .from(users)
      .where(and(
        eq(users.id, businessId),
        eq(users.role, "business")
      ))
      .limit(1);

    if (!business) {
      return res.status(404).send("Selected business not found");
    }

    const [ticket] = await db.insert(tickets)
      .values({
        title,
        description,
        customerId: req.user.id,
        businessId: business.id,
      })
      .returning();

    res.json(ticket);
  });

  app.get("/api/tickets", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const query = req.user.role === "business" 
      ? { businessId: req.user.id }
      : { customerId: req.user.id };

    const userTickets = await db.select().from(tickets)
      .where(eq(tickets[req.user.role === "business" ? "businessId" : "customerId"], req.user.id));

    res.json(userTickets);
  });

  app.patch("/api/tickets/:id", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { id } = req.params;
    const { status } = req.body;

    const [ticket] = await db.select().from(tickets)
      .where(eq(tickets.id, parseInt(id)));

    if (!ticket) return res.status(404).send("Ticket not found");

    if (req.user.role === "business" && ticket.businessId !== req.user.id) {
      return res.status(403).send("Not authorized to update this ticket");
    }

    if (req.user.role === "customer" && ticket.customerId !== req.user.id) {
      return res.status(403).send("Not authorized to update this ticket");
    }

    const [updated] = await db.update(tickets)
      .set({ status, updatedAt: new Date() })
      .where(eq(tickets.id, parseInt(id)))
      .returning();

    res.json(updated);
  });

  // Ticket notes routes
  app.post("/api/tickets/:id/notes", async (req, res) => {
    if (!req.user || req.user.role !== "business") {
      return res.status(403).send("Only business users can add notes");
    }

    const { id } = req.params;
    const { content } = req.body;

    const [ticket] = await db.select().from(tickets)
      .where(and(
        eq(tickets.id, parseInt(id)),
        eq(tickets.businessId, req.user.id)
      ));

    if (!ticket) {
      return res.status(404).send("Ticket not found or not assigned to you");
    }

    const [note] = await db.insert(ticketNotes)
      .values({
        ticketId: parseInt(id),
        businessId: req.user.id,
        content
      })
      .returning();

    res.json(note);
  });

  app.get("/api/tickets/:id/notes", async (req, res) => {
    if (!req.user || req.user.role !== "business") {
      return res.status(403).send("Only business users can view notes");
    }

    const { id } = req.params;

    const [ticket] = await db.select().from(tickets)
      .where(and(
        eq(tickets.id, parseInt(id)),
        eq(tickets.businessId, req.user.id)
      ));

    if (!ticket) {
      return res.status(404).send("Ticket not found or not assigned to you");
    }

    const notes = await db.select().from(ticketNotes)
      .where(eq(ticketNotes.ticketId, parseInt(id)));

    res.json(notes);
  });

  const httpServer = createServer(app);

  // Setup WebSocket server
  setupWebSocket(httpServer, app);

  return httpServer;
}