import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { tickets, users, ticketNotes, messages, ticketFeedback, businessEmployees, employeeInvitations } from "@db/schema";
import { eq, and, or, not, exists } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Employee management routes
  app.post("/api/businesses/employees/invite", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can invite employees" });
      }

      const { employeeId } = req.body;

      if (!employeeId || typeof employeeId !== 'number') {
        return res.status(400).json({ error: "Invalid employee ID" });
      }

      // Verify the employee exists and is of role 'employee'
      const [employee] = await db.select()
        .from(users)
        .where(and(
          eq(users.id, employeeId),
          eq(users.role, "employee")
        ));

      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      // Check if invitation already exists
      const [existingInvitation] = await db.select()
        .from(employeeInvitations)
        .where(and(
          eq(employeeInvitations.businessId, req.user.id),
          eq(employeeInvitations.employeeId, employeeId),
          eq(employeeInvitations.status, "pending")
        ));

      if (existingInvitation) {
        return res.status(400).json({ error: "Invitation already sent" });
      }

      // Create invitation
      const [invitation] = await db.insert(employeeInvitations)
        .values({
          businessId: req.user.id,
          employeeId,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      res.json(invitation);
    } catch (error) {
      console.error('Error inviting employee:', error);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  });

  // Get all pending invitations for an employee
  app.get("/api/employees/invitations", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can view their invitations" });
      }

      const invitations = await db.select({
        invitation: employeeInvitations,
        business: {
          id: users.id,
          username: users.username
        }
      })
      .from(employeeInvitations)
      .innerJoin(users, eq(users.id, employeeInvitations.businessId))
      .where(and(
        eq(employeeInvitations.employeeId, req.user.id),
        eq(employeeInvitations.status, "pending")
      ));

      res.json(invitations);
    } catch (error) {
      console.error('Error fetching invitations:', error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });

  // Accept/reject invitation
  app.post("/api/employees/invitations/:id/respond", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can respond to invitations" });
      }

      const { id } = req.params;
      const { status } = req.body;

      if (!["accepted", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const [invitation] = await db.select()
        .from(employeeInvitations)
        .where(and(
          eq(employeeInvitations.id, parseInt(id)),
          eq(employeeInvitations.employeeId, req.user.id),
          eq(employeeInvitations.status, "pending")
        ));

      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      const [updatedInvitation] = await db.update(employeeInvitations)
        .set({ 
          status, 
          updatedAt: new Date() 
        })
        .where(eq(employeeInvitations.id, parseInt(id)))
        .returning();

      if (status === "accepted") {
        // Create business-employee relationship
        await db.insert(businessEmployees)
          .values({
            businessId: invitation.businessId,
            employeeId: req.user.id
          });
      }

      res.json(updatedInvitation);
    } catch (error) {
      console.error('Error responding to invitation:', error);
      res.status(500).json({ error: "Failed to respond to invitation" });
    }
  });

  // Get all employees for a business
  app.get("/api/businesses/employees", async (req, res) => {
    try {
      if (!req.user || (req.user.role !== "business" && req.user.role !== "employee")) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const businessId = req.user.role === "business" ? req.user.id : 
        (await db.select()
          .from(businessEmployees)
          .where(eq(businessEmployees.employeeId, req.user.id))
          .limit(1))[0]?.businessId;

      if (!businessId) {
        return res.status(404).json({ error: "Business not found" });
      }

      const employees = await db.select({
        employee: {
          id: users.id,
          username: users.username,
          role: users.role
        },
        relation: {
          id: businessEmployees.id,
          isActive: businessEmployees.isActive
        }
      })
      .from(businessEmployees)
      .innerJoin(users, eq(users.id, businessEmployees.employeeId))
      .where(eq(businessEmployees.businessId, businessId));

      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // Remove employee (business only)
  app.delete("/api/businesses/employees/:employeeId", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can remove employees" });
      }

      const { employeeId } = req.params;

      const [relationship] = await db.select()
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.businessId, req.user.id),
          eq(businessEmployees.employeeId, parseInt(employeeId))
        ));

      if (!relationship) {
        return res.status(404).json({ error: "Employee relationship not found" });
      }

      await db.update(businessEmployees)
        .set({ isActive: false })
        .where(eq(businessEmployees.id, relationship.id));

      res.json({ message: "Employee removed successfully" });
    } catch (error) {
      console.error('Error removing employee:', error);
      res.status(500).json({ error: "Failed to remove employee" });
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

  // Business analytics routes
  app.get("/api/analytics/feedback", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business users can access analytics" });
      }

      // Get all feedback for tickets assigned to this business
      const feedbackData = await db
        .select({
          feedback: ticketFeedback,
          ticket: {
            title: tickets.title,
            createdAt: tickets.createdAt
          }
        })
        .from(ticketFeedback)
        .innerJoin(tickets, eq(ticketFeedback.ticketId, tickets.id))
        .where(eq(tickets.businessId, req.user.id));

      res.json(feedbackData);
    } catch (error) {
      console.error('Error fetching feedback analytics:', error);
      res.status(500).json({ error: "Failed to fetch feedback analytics" });
    }
  });


  // Update the get employees route to show all available employees for businesses
  app.get("/api/employees", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can view employees" });
      }

      // Get all employees that are not already connected to this business
      const employees = await db.select({
        id: users.id,
        username: users.username
      })
      .from(users)
      .where(
        and(
          eq(users.role, "employee"),
          // Exclude employees that already have a relationship with this business
          not(exists(
            db.select()
              .from(businessEmployees)
              .where(and(
                eq(businessEmployees.businessId, req.user.id),
                eq(businessEmployees.employeeId, users.id),
                eq(businessEmployees.isActive, true)
              ))
          ))
        )
      );

      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  const httpServer = createServer(app);

  // Setup WebSocket server
  setupWebSocket(httpServer, app);

  return httpServer;
}