import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { tickets, users, ticketNotes, messages, ticketFeedback } from "@db/schema";
import { eq, and, or, sql } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Get all business analytics data
  app.get("/api/analytics/feedback", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business users can view analytics" });
      }

      // Get all feedback for tickets assigned to this business
      const feedback = await db
        .select({
          id: ticketFeedback.id,
          rating: ticketFeedback.rating,
          comment: ticketFeedback.comment,
          createdAt: ticketFeedback.createdAt,
          ticketTitle: tickets.title,
          customerName: users.username,
        })
        .from(ticketFeedback)
        .innerJoin(tickets, eq(ticketFeedback.ticketId, tickets.id))
        .innerJoin(users, eq(tickets.customerId, users.id))
        .where(eq(tickets.businessId, req.user.id))
        .orderBy(ticketFeedback.createdAt);

      // Calculate summary statistics
      const stats = await db
        .select({
          averageRating: sql<number>`ROUND(AVG(${ticketFeedback.rating})::numeric, 2)`,
          totalFeedback: sql<number>`COUNT(*)`,
          ratingCounts: sql<Record<string, number>>`
            json_object_agg(
              ${ticketFeedback.rating}::text,
              COUNT(*)
            )
          `,
        })
        .from(ticketFeedback)
        .innerJoin(tickets, eq(ticketFeedback.ticketId, tickets.id))
        .where(eq(tickets.businessId, req.user.id))
        .limit(1);

      res.json({
        feedback,
        stats: stats[0],
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      res.status(500).json({ error: "Failed to fetch analytics data" });
    }
  });

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

  // Get all customers
  app.get("/api/customers", async (req, res) => {
    if (!req.user || req.user.role !== "business") {
      return res.status(403).send("Only business users can view customers");
    }

    const customers = await db.select({
      id: users.id,
      username: users.username
    })
    .from(users)
    .where(eq(users.role, "customer"));

    res.json(customers);
  });

  // Messages routes
  app.get("/api/messages/:userId", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { userId } = req.params;
    const conversationMessages = await db.select()
      .from(messages)
      .where(
        or(
          and(
            eq(messages.senderId, req.user.id),
            eq(messages.receiverId, parseInt(userId))
          ),
          and(
            eq(messages.senderId, parseInt(userId)),
            eq(messages.receiverId, req.user.id)
          )
        )
      )
      .orderBy(messages.createdAt);

    res.json(conversationMessages);
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

  // Feedback routes
  app.post("/api/tickets/:id/feedback", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "customer") {
        return res.status(403).json({ error: "Only customers can provide feedback" });
      }

      const { id } = req.params;
      const { rating, comment } = req.body;

      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be a number between 1 and 5" });
      }

      const [ticket] = await db.select().from(tickets)
        .where(and(
          eq(tickets.id, parseInt(id)),
          eq(tickets.customerId, req.user.id),
          eq(tickets.status, "resolved")
        ));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found or not eligible for feedback" });
      }

      // Check if feedback already exists
      const [existingFeedback] = await db.select()
        .from(ticketFeedback)
        .where(eq(ticketFeedback.ticketId, parseInt(id)))
        .limit(1);

      if (existingFeedback) {
        return res.status(400).json({ error: "Feedback already submitted for this ticket" });
      }

      const [feedback] = await db.insert(ticketFeedback)
        .values({
          ticketId: parseInt(id),
          rating,
          comment: comment || null
        })
        .returning();

      res.json(feedback);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Get feedback for a ticket
  app.get("/api/tickets/:id/feedback", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;
      const [ticket] = await db.select().from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Check if user is authorized to view feedback
      if (req.user.role === "business" && ticket.businessId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to view this feedback" });
      }
      if (req.user.role === "customer" && ticket.customerId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to view this feedback" });
      }

      const [feedback] = await db.select()
        .from(ticketFeedback)
        .where(eq(ticketFeedback.ticketId, parseInt(id)))
        .limit(1);

      res.json(feedback || null);
    } catch (error) {
      console.error('Error getting feedback:', error);
      res.status(500).json({ error: "Failed to get feedback" });
    }
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

    const notes = await db.select()
      .from(ticketNotes)
      .where(eq(ticketNotes.ticketId, parseInt(id)));

    res.json(notes);
  });

  const httpServer = createServer(app);
  setupWebSocket(httpServer, app);
  return httpServer;
}