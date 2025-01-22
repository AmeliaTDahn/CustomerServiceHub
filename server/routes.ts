import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { tickets, users, ticketNotes, messages, ticketFeedback, businessEmployees, employeeInvitations, type User } from "@db/schema";
import { eq, and, or, not, exists } from "drizzle-orm";
import { sql } from 'drizzle-orm/sql';

// Extend Express.User to include our schema
declare global {
  namespace Express {
    interface User extends User {}
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Employee management routes
  app.post("/api/businesses/employees/invite", async (req, res) => {
    try {
      if (!req.user?.role || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can invite employees" });
      }

      const { employeeId } = req.body;

      if (!employeeId) {
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

  // Get all businesses for an employee
  app.get("/api/employees/businesses", async (req, res) => {
    try {
      if (!req.user?.role || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can view their business relationships" });
      }

      const businesses = await db.select({
        id: users.id,
        username: users.username,
      })
      .from(businessEmployees)
      .innerJoin(users, eq(users.id, businessEmployees.businessId))
      .where(and(
        eq(businessEmployees.employeeId, req.user.id),
        eq(businessEmployees.isActive, true)
      ));

      res.json(businesses);
    } catch (error) {
      console.error('Error fetching businesses:', error);
      res.status(500).json({ error: "Failed to fetch businesses" });
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

    // If user is an employee, return only the businesses they're connected to
    if (req.user.role === "employee") {
      const businesses = await db.select({
        id: users.id,
        username: users.username
      })
      .from(businessEmployees)
      .innerJoin(users, eq(users.id, businessEmployees.businessId))
      .where(and(
        eq(businessEmployees.employeeId, req.user.id),
        eq(businessEmployees.isActive, true)
      ));

      return res.json(businesses);
    }

    // For customers or other roles, return all businesses
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
    if (!req.user || (req.user.role !== "business" && req.user.role !== "employee")) {
      return res.status(403).send("Only business users and employees can view customers");
    }

    // For employees, get only customers who have submitted tickets
    const customers = await db.select({
      id: users.id,
      username: users.username
    })
    .from(users)
    .where(
      and(
        eq(users.role, "customer"),
        exists(
          db.select()
            .from(tickets)
            .where(eq(tickets.customerId, users.id))
        )
      )
    );

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

    try {
      let query = db.select().from(tickets);

      if (req.user.role === "customer") {
        query = query.where(eq(tickets.customerId, req.user.id));
      } else if (req.user.role === "business") {
        query = query.where(eq(tickets.businessId, req.user.id));
      } else if (req.user.role === "employee") {
        // For employees, get all tickets from businesses they are actively associated with
        const businessIds = await db
          .select({ businessId: businessEmployees.businessId })
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.isActive, true)
          ));

        if (businessIds.length === 0) {
          return res.json([]);
        }

        query = query.where(
          or(...businessIds.map(({ businessId }) => eq(tickets.businessId, businessId)))
        );
      }

      const userTickets = await query;
      res.json(userTickets);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });


  // Claim a ticket (employees only)
  app.post("/api/tickets/:id/claim", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can claim tickets" });
      }

      const { id } = req.params;

      // Check if the ticket exists and employee has access to it
      const [ticket] = await db.select()
        .from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Verify employee has access to this business's tickets
      const [hasAccess] = await db.select()
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.businessId, ticket.businessId!),
          eq(businessEmployees.isActive, true)
        ));

      if (!hasAccess) {
        return res.status(403).json({ error: "No access to this ticket" });
      }

      // Check if ticket is already claimed
      if (ticket.claimedById) {
        return res.status(400).json({ error: "Ticket is already claimed" });
      }

      // Claim the ticket
      const [updatedTicket] = await db.update(tickets)
        .set({
          claimedById: req.user.id,
          claimedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(tickets.id, parseInt(id)))
        .returning();

      res.json(updatedTicket);
    } catch (error) {
      console.error('Error claiming ticket:', error);
      res.status(500).json({ error: "Failed to claim ticket" });
    }
  });

  // Unclaim a ticket (employees and business)
  app.post("/api/tickets/:id/unclaim", async (req, res) => {
    try {
      if (!req.user || (req.user.role !== "employee" && req.user.role !== "business")) {
        return res.status(403).json({ error: "Only employees and business can unclaim tickets" });
      }

      const { id } = req.params;

      const [ticket] = await db.select()
        .from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // For employees, verify they are the one who claimed it
      if (req.user.role === "employee") {
        if (ticket.claimedById !== req.user.id) {
          return res.status(403).json({ error: "You can only unclaim tickets you have claimed" });
        }

        // Verify they still have access to this business's tickets
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.businessId!),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      // For business, verify they own the ticket
      if (req.user.role === "business" && ticket.businessId !== req.user.id) {
        return res.status(403).json({ error: "You can only unclaim tickets from your business" });
      }

      // Unclaim the ticket
      const [updatedTicket] = await db.update(tickets)
        .set({
          claimedById: null,
          claimedAt: null,
          updatedAt: new Date()
        })
        .where(eq(tickets.id, parseInt(id)))
        .returning();

      res.json(updatedTicket);
    } catch (error) {
      console.error('Error unclaiming ticket:', error);
      res.status(500).json({ error: "Failed to unclaim ticket" });
    }
  });

  // Update ticket status (modified to handle claims)
  app.patch("/api/tickets/:id", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const { id } = req.params;
      const { status } = req.body;

      const [ticket] = await db.select()
        .from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Business can always update
      if (req.user.role === "business") {
        if (ticket.businessId !== req.user.id) {
          return res.status(403).json({ error: "Not authorized to update this ticket" });
        }
      }
      // Employee can only update if they claimed the ticket
      else if (req.user.role === "employee") {
        if (ticket.claimedById !== req.user.id) {
          return res.status(403).json({ error: "You can only update tickets you have claimed" });
        }

        // Verify they still have access to this business's tickets
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.businessId!),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }
      // Customer can only update their own tickets
      else if (req.user.role === "customer") {
        if (ticket.customerId !== req.user.id) {
          return res.status(403).json({ error: "Not authorized to update this ticket" });
        }
      }

      const [updated] = await db.update(tickets)
        .set({ status, updatedAt: new Date() })
        .where(eq(tickets.id, parseInt(id)))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Error updating ticket:', error);
      res.status(500).json({ error: "Failed to update ticket" });
    }
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
    try {
      if (!req.user || (req.user.role !== "business" && req.user.role !== "employee")) {
        return res.status(403).json({ error: "Only business users and employees can add notes" });
      }

      const { id } = req.params;
      const { content } = req.body;

      // Get the ticket to verify access
      const [ticket] = await db.select()
        .from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // For employees, verify they have access to this business's tickets
      if (req.user.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.businessId!),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      // For business, verify they own the ticket
      if (req.user.role === "business" && ticket.businessId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to add notes to this ticket" });
      }

      const [note] = await db.insert(ticketNotes)
        .values({
          ticketId: parseInt(id),
          businessId: req.user.role === "business" ? req.user.id : ticket.businessId!,
          content,
          createdAt: new Date()
        })
        .returning();

      res.json(note);
    } catch (error) {
      console.error('Error adding note:', error);
      res.status(500).json({ error: "Failed to add note" });
    }
  });

  app.get("/api/tickets/:id/notes", async (req, res) => {
    try {
      if (!req.user || (req.user.role !== "business" && req.user.role !== "employee")) {
        return res.status(403).json({ error: "Only business users and employees can view notes" });
      }

      const { id } = req.params;

      // Get the ticket to verify access
      const [ticket] = await db.select()
        .from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // For employees, verify they have access to this business's tickets
      if (req.user.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.businessId!),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      // For business, verify they own the ticket
      if (req.user.role === "business" && ticket.businessId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to view notes for this ticket" });
      }

      const notes = await db.select({
        note: ticketNotes,
        author: {
          id: users.id,
          username: users.username,
          role: users.role
        }
      })
      .from(ticketNotes)
      .innerJoin(users, eq(users.id, ticketNotes.businessId))
      .where(eq(ticketNotes.ticketId, parseInt(id)))
      .orderBy(ticketNotes.createdAt);

      res.json(notes);
    } catch (error) {
      console.error('Error fetching notes:', error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Business analytics routes
  app.get("/api/analytics/feedback", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business users can access analytics" });
      }

      // Get all feedback for tickets assigned to this business
      const allFeedback = await db
        .select({
          feedback: ticketFeedback,
          ticket: {
            createdAt: tickets.createdAt,
          },
        })
        .from(ticketFeedback)
        .innerJoin(tickets, eq(ticketFeedback.ticketId, tickets.id))
        .where(eq(tickets.businessId, req.user.id));

      // Calculate average rating
      const ratings = allFeedback.map(f => f.feedback.rating);
      const averageRating = ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;

      // Calculate rating distribution
      const ratingDistribution = Array.from({ length: 5 }, (_, i) => i + 1)
        .map(rating => ({
          rating,
          count: ratings.filter(r => r === rating).length
        }));

      // Calculate feedback over time (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const feedbackByDay = allFeedback.reduce((acc: Record<string, number[]>, { feedback }) => {
        const date = new Date(feedback.createdAt).toISOString().split('T')[0];
        if (!acc[date]) acc[date] = [];
        acc[date].push(feedback.rating);
        return acc;
      }, {});

      const feedbackOverTime = Object.entries(feedbackByDay)
        .map(([date, ratings]) => ({
          date,
          rating: ratings.reduce((a, b) => a + b, 0) / ratings.length
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        averageRating,
        totalFeedback: allFeedback.length,
        ratingDistribution,
        feedbackOverTime,
      });
    } catch (error) {
      console.error('Error fetching feedback analytics:', error);
      res.status(500).json({ error: "Failed to fetch feedback analytics" });
    }
  });

  app.get("/api/analytics/tickets", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business users can access analytics" });
      }

      // Get basic ticket metrics
      const allTickets = await db
        .select()
        .from(tickets)
        .where(eq(tickets.businessId, req.user.id));

      const resolvedTickets = allTickets.filter(t => t.status === "resolved");

      // Calculate average resolution time
      const resolutionTimes = resolvedTickets
        .map(ticket => {
          const created = new Date(ticket.createdAt);
          const updated = new Date(ticket.updatedAt);
          return (updated.getTime() - created.getTime()) / (1000 * 60); // minutes
        });

      const averageResolutionTime = resolutionTimes.length > 0
        ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
        : 0;

      // Get tickets by category
      const ticketsByCategory = await db
        .select({
          category: tickets.category,
          count: sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(eq(tickets.businessId, req.user.id))
        .groupBy(tickets.category);

      // Get tickets by priority
      const ticketsByPriority = await db
        .select({
          priority: tickets.priority,
          count: sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(eq(tickets.businessId, req.user.id))
        .groupBy(tickets.priority);

      res.json({
        totalTickets: allTickets.length,
        resolvedTickets: resolvedTickets.length,
        averageResolutionTime,
        ticketsByCategory,
        ticketsByPriority,
      });
    } catch (error) {
      console.error('Error fetching ticket analytics:', error);
      res.status(500).json({ error: "Failed to fetch ticket analytics" });
    }
  });

  app.get("/api/analytics/employees", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business users can access analytics" });
      }

      // Get active employees
      const activeEmployees = await db
        .select({
          employee: users,
          ticketsResolved: sql<number>`count(distinct tickets.id)::int`,
        })
        .from(businessEmployees)
        .innerJoin(users, eq(users.id, businessEmployees.employeeId))
        .leftJoin(tickets, and(
          eq(tickets.claimedById, users.id),
          eq(tickets.status, "resolved")
        ))
        .where(and(
          eq(businessEmployees.businessId, req.user.id),
          eq(businessEmployees.isActive, true)
        ))
        .groupBy(users.id);

      // Calculate average response time
      const claimedTickets = await db
        .select({
          createdAt: tickets.createdAt,
          claimedAt: tickets.claimedAt,
        })
        .from(tickets)
        .where(and(
          eq(tickets.businessId, req.user.id),
          not(eq(tickets.claimedAt, null))
        ));

      const responseTimes = claimedTickets
        .map(ticket => {
          const created = new Date(ticket.createdAt);
          const claimed = new Date(ticket.claimedAt!);
          return (claimed.getTime() - created.getTime()) / (1000 * 60); // minutes
        });

      const averageResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      // Calculate collaboration score (simplified)
      const totalTickets = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(eq(tickets.businessId, req.user.id));

      const resolvedTickets = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(and(
          eq(tickets.businessId, req.user.id),
          eq(tickets.status, "resolved")
        ));

      const collaborationScore = totalTickets[0].count > 0
        ? resolvedTickets[0].count / totalTickets[0].count
        : 0;

      res.json({
        totalActiveEmployees: activeEmployees.length,
        ticketsPerEmployee: activeEmployees.map(({ employee, ticketsResolved }) => ({
          employee: employee.username,
          tickets: ticketsResolved
        })),
        averageResponseTime,
        collaborationScore,
      });
    } catch (error) {
      console.error('Error fetching employee analytics:', error);
      res.status(500).json({ error: "Failed to fetch employee analytics" });
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