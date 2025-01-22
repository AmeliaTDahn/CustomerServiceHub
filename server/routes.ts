import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, messages, businessEmployees, type User, type Message } from "@db/schema";
import { eq, and, or, isNull, desc } from "drizzle-orm";
import { sql } from 'drizzle-orm/sql';
import { exists } from 'drizzle-orm/query';


declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      role: string;
    }
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  const httpServer = createServer(app);

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
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.businessId, req.user.id),
          eq(businessEmployees.employeeId, employeeId),
          eq(businessEmployees.isActive, true)
        ));

      if (existingInvitation) {
        return res.status(400).json({ error: "Invitation already sent" });
      }

      // Create invitation
      const [invitation] = await db.insert(businessEmployees)
        .values({
          businessId: req.user.id,
          employeeId,
          isActive: true,
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
        invitation: businessEmployees,
        business: {
          id: users.id,
          username: users.username
        }
      })
      .from(businessEmployees)
      .innerJoin(users, eq(users.id, businessEmployees.businessId))
      .where(and(
        eq(businessEmployees.employeeId, req.user.id),
        eq(businessEmployees.isActive, true)
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
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.id, parseInt(id)),
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.isActive, true)
        ));

      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      const [updatedInvitation] = await db.update(businessEmployees)
        .set({ 
          isActive: status === "accepted",
          updatedAt: new Date() 
        })
        .where(eq(businessEmployees.id, parseInt(id)))
        .returning();

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
            .from(messages)
            .where(eq(messages.receiverId, users.id))
        )
      )
    );

    res.json(customers);
  });

  // Messages routes
  app.get("/api/tickets/:ticketId/messages", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { ticketId } = req.params;

    try {
      // Get the ticket to verify access
      const [ticket] = await db.select()
        .from(messages)
        .where(eq(messages.ticketId, parseInt(ticketId)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Verify user has access to this ticket
      if (req.user.role === "customer" && ticket.receiverId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to view these messages" });
      }

      if (req.user.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.senderId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket's messages" });
        }
      }

      if (req.user.role === "business" && ticket.senderId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to view these messages" });
      }

      // Fetch messages
      const messages = await db.select({
        message: {
          id: messages.id,
          content: messages.content,
          ticketId: messages.ticketId,
          senderId: messages.senderId,
          receiverId: messages.receiverId,
          status: messages.status,
          createdAt: messages.createdAt,
        },
        sender: {
          id: users.id,
          username: users.username,
          role: users.role
        }
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(eq(messages.ticketId, parseInt(ticketId)))
      .orderBy(messages.createdAt);

      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/tickets/:ticketId/messages", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { ticketId } = req.params;
    const { content } = req.body;

    try {
      // Get the ticket to verify access and determine receiver
      const [ticket] = await db.select()
        .from(messages)
        .where(eq(messages.ticketId, parseInt(ticketId)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      let receiverId: number;

      // Determine the message receiver based on sender's role
      if (req.user.role === "customer") {
        if (ticket.receiverId !== req.user.id) {
          return res.status(403).json({ error: "Not authorized to send messages for this ticket" });
        }
        receiverId = ticket.senderId;
      } else if (req.user.role === "employee") {
        // Verify employee has access
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.senderId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
        receiverId = ticket.receiverId;
      } else if (req.user.role === "business") {
        if (ticket.senderId !== req.user.id) {
          return res.status(403).json({ error: "Not authorized to send messages for this ticket" });
        }
        receiverId = ticket.receiverId;
      } else {
        return res.status(403).json({ error: "Invalid user role" });
      }

      const [message] = await db.insert(messages)
        .values({
          content,
          ticketId: parseInt(ticketId),
          senderId: req.user.id,
          receiverId,
          status: "sent",
          sentAt: new Date(),
          createdAt: new Date()
        })
        .returning();

      res.json(message);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: "Failed to send message" });
    }
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

    const [ticket] = await db.insert(messages)
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
      let query = db
        .select({
          id: messages.id,
          title: messages.content,
          description: messages.ticketId,
          status: messages.status,
          priority: messages.receiverId,
          category: messages.senderId,
          customerId: messages.createdAt,
          businessId: messages.sentAt,
          claimedById: messages.updatedAt,
          claimedAt: messages.status,
          createdAt: messages.createdAt,
          updatedAt: messages.updatedAt,
          customer: {
            id: users.id,
            username: users.username
          }
        })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId));

      if (req.user.role === "customer") {
        query = query.where(eq(messages.receiverId, req.user.id));
      } else if (req.user.role === "business") {
        query = query.where(eq(messages.senderId, req.user.id));
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
          or(...businessIds.map(({ businessId }) => eq(messages.senderId, businessId)))
        );
      }

      const userTickets = await query;
      res.json(userTickets);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  // Add this endpoint after the "/api/tickets" GET route
  app.get("/api/tickets/customer", async (req, res) => {
    if (!req.user || req.user.role !== "customer") {
      return res.status(403).json({ error: "Only customers can view their tickets" });
    }

    try {
      // Get all tickets for the customer with associated business and message data
      const tickets = await db.select({
        id: messages.id,
        title: messages.content,
        description: messages.ticketId,
        status: messages.status,
        createdAt: messages.createdAt,
        business: {
          id: users.id,
          username: users.username,
        },
        hasBusinessResponse: sql<boolean>`EXISTS (
          SELECT 1 FROM ${messages} 
          WHERE ${messages.ticketId} = ${messages.ticketId} 
          AND ${messages.senderId} = ${messages.senderId}
        )`,
        unreadCount: sql<number>`(
          SELECT COUNT(*) 
          FROM ${messages} 
          WHERE ${messages.ticketId} = ${messages.ticketId} 
          AND ${messages.receiverId} = ${req.user.id}
          AND ${messages.status} != 'read'
        )`
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(eq(messages.receiverId, req.user.id))
      .orderBy(desc(messages.updatedAt));

      res.json(tickets);
    } catch (error) {
      console.error('Error fetching customer tickets:', error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  // Add this endpoint after the "/api/tickets" GET route
  app.get("/api/tickets/businesses", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "customer") {
        return res.status(403).json({ error: "Only customers can view their business interactions" });
      }

      // Get unique businesses from the customer's tickets
      const businesses = await db.selectDistinct({
        id: users.id,
        username: users.username
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(eq(messages.receiverId, req.user.id));

      res.json(businesses);
    } catch (error) {
      console.error('Error fetching businesses:', error);
      res.status(500).json({ error: "Failed to fetch businesses" });
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
        .from(messages)
        .where(eq(messages.ticketId, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Verify employee has access to this business's tickets
      const [hasAccess] = await db.select()
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.businessId, ticket.senderId),
          eq(businessEmployees.isActive, true)
        ));

      if (!hasAccess) {
        return res.status(403).json({ error: "No access to this ticket" });
      }

      // Check if ticket is already claimed
      if (ticket.status === "claimed") {
        return res.status(400).json({ error: "Ticket is already claimed" });
      }

      // Claim the ticket
      const [updatedTicket] = await db.update(messages)
        .set({
          status: "claimed",
          updatedAt: new Date()
        })
        .where(eq(messages.ticketId, parseInt(id)))
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
        .from(messages)
        .where(eq(messages.ticketId, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // For employees, verify they are the one who claimed it
      if (req.user.role === "employee") {
        if (ticket.status !== "claimed") {
          return res.status(403).json({ error: "You can only unclaim tickets you have claimed" });
        }

        // Verify they still have access to this business's tickets
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.senderId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      // For business, verify they own the ticket
      if (req.user.role === "business" && ticket.senderId !== req.user.id) {
        return res.status(403).json({ error: "You can only unclaim tickets from your business" });
      }

      // Unclaim the ticket
      const [updatedTicket] = await db.update(messages)
        .set({
          status: "open",
          updatedAt: new Date()
        })
        .where(eq(messages.ticketId, parseInt(id)))
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
        .from(messages)
        .where(eq(messages.ticketId, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Business can always update
      if (req.user.role === "business") {
        if (ticket.senderId !== req.user.id) {
          return res.status(403).json({ error: "Not authorized to update this ticket" });
        }
      }
      // Employee can only update if they claimed the ticket
      else if (req.user.role === "employee") {
        if (ticket.status !== "claimed") {
          return res.status(403).json({ error: "You can only update tickets you have claimed" });
        }

        // Verify they still have access to this business's tickets
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.senderId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }
      // Customer can only update their own tickets
      else if (req.user.role === "customer") {
        if (ticket.receiverId !== req.user.id) {
          return res.status(403).json({ error: "Not authorized to update this ticket" });
        }
      }

      const [updated] = await db.update(messages)
        .set({ status, updatedAt: new Date() })
        .where(eq(messages.ticketId, parseInt(id)))
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

      const [ticket] = await db.select().from(messages)
        .where(and(
          eq(messages.ticketId, parseInt(id)),
          eq(messages.receiverId, req.user.id),
          eq(messages.status, "resolved")
        ));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found or not eligible for feedback" });
      }

      // Check if feedback already exists
      const [existingFeedback] = await db.select()
        .from(messages)
        .where(eq(messages.ticketId, parseInt(id)))
        .limit(1);

      if (existingFeedback) {
        return res.status(400).json({ error: "Feedback already submitted for this ticket" });
      }

      const [feedback] = await db.insert(messages)
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
      const [ticket] = await db.select().from(messages)
        .where(eq(messages.ticketId, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Check if user is authorized to view feedback
      if (req.user.role === "business" && ticket.senderId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to view this feedback" });
      }
      if (req.user.role === "customer" && ticket.receiverId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to view this feedback" });
      }

      const [feedback] = await db.select()
        .from(messages)
        .where(eq(messages.ticketId, parseInt(id)))
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
        .from(messages)
        .where(eq(messages.ticketId, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // For employees, verify they have access to this business's tickets
      if (req.user.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.senderId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      // For business, verify they own the ticket
      if (req.user.role === "business" && ticket.senderId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to add notes to this ticket" });
      }

      const [note] = await db.insert(messages)
        .values({
          ticketId: parseInt(id),
          businessId: req.user.role === "business" ? req.user.id : ticket.senderId,
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
        .from(messages)
        .where(eq(messages.ticketId, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // For employees, verify they have access to this business's tickets
      if (req.user.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.senderId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      // For business, verify they own the ticket
      if (req.user.role === "business" && ticket.senderId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to view notes for this ticket" });
      }

      const notes = await db.select({
        note: messages,
        author: {
          id: users.id,
          username: users.username,
          role: users.role
        }
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(eq(messages.ticketId, parseInt(id)))
      .orderBy(messages.createdAt);

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
          feedback: messages,
          ticket: {
            createdAt: messages.createdAt,
          },
        })
        .from(messages)
        .where(eq(messages.senderId, req.user.id));

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
        .from(messages)
        .where(eq(messages.senderId, req.user.id));

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
          category: messages.senderId,
          count: sql<number>`count(*)::int`,
        })
        .from(messages)
        .where(eq(messages.senderId, req.user.id))
        .groupBy(messages.senderId);

      // Get tickets by priority
      const ticketsByPriority = await db
        .select({
          priority: messages.receiverId,
          count: sql<number>`count(*)::int`,
        })
        .from(messages)
        .where(eq(messages.senderId, req.user.id))
        .groupBy(messages.receiverId);

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
          ticketsResolved: sql<number>`count(distinct messages.ticketId)::int`,
        })
        .from(businessEmployees)
        .innerJoin(users, eq(users.id, businessEmployees.employeeId))
        .leftJoin(messages, and(
          eq(messages.senderId, users.id),
          eq(messages.status, "resolved")
        ))
        .where(and(
          eq(businessEmployees.businessId, req.user.id),
          eq(businessEmployees.isActive, true)
        ))
        .groupBy(users.id);

      // Calculate average response time
      const claimedTickets = await db
        .select({
          createdAt: messages.createdAt,
          claimedAt: messages.sentAt,
        })
        .from(messages)
        .where(and(
          eq(messages.senderId, req.user.id),
          not(eq(messages.sentAt, null))
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
        .from(messages)
        .where(eq(messages.senderId, req.user.id));

      const resolvedTickets = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(
          eq(messages.senderId, req.user.id),
          eq(messages.status, "resolved")
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

  // Direct messages routes
  app.get("/api/messages/direct/:userId", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { userId } = req.params;

    try {
      // Verify access rights
      if (req.user.role === "employee") {
        // Verify this is a business they work for
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, parseInt(userId)),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "Not authorized to message this user" });
        }
      } else if (req.user.role === "business") {
        // Verify this is their employee
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.businessId, req.user.id),
            eq(businessEmployees.employeeId, parseInt(userId)),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "Not authorized to message this user" });
        }
      } else {
        return res.status(403).json({ error: "Only businesses and employees can use direct messaging" });
      }

      // Fetch all direct messages between these users
      const directMessages = await db.select({
        message: {
          id: messages.id,
          content: messages.content,
          ticketId: messages.ticketId,
          senderId: messages.senderId,
          receiverId: messages.receiverId,
          status: messages.status,
          createdAt: messages.createdAt,
        },
        sender: {
          id: users.id,
          username: users.username,
          role: users.role
        }
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(and(
        isNull(messages.ticketId),
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
      ))
      .orderBy(messages.createdAt);

      res.json(directMessages);
    } catch (error) {
      console.error('Error fetching direct messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages/direct/:userId", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { userId } = req.params;
    const { content } = req.body;

    try {
      // Verify access rights
      if (req.user.role === "employee") {
        // Verify this is a business they work for
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, parseInt(userId)),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "Not authorized to message this user" });
        }
      } else if (req.user.role === "business") {
        // Verify this is their employee
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.businessId, req.user.id),
            eq(businessEmployees.employeeId, parseInt(userId)),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "Not authorized to message this user" });
        }
      } else {
        return res.status(403).json({ error: "Only businesses and employees can use direct messaging" });
      }

      const [message] = await db.insert(messages)
        .values({
          content,
          ticketId: null,
          senderId: req.user.id,
          receiverId: parseInt(userId),
          status: 'sent',
          sentAt: new Date(),
          createdAt: new Date()
        })
        .returning();

      // Include sender information in response
      const messageWithSender = {
        message: {
          id: message.id,
          content: message.content,
          ticketId: message.ticketId,
          senderId: message.senderId,
          receiverId: message.receiverId,
          status: message.status,
          createdAt: message.createdAt,
        },
        sender: {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role
        }
      };

      res.json(messageWithSender);
    } catch (error) {
      console.error('Error sending direct message:', error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Connected business for employee
  app.get("/api/users/connected-business", async (req, res) => {
    if (!req.user || req.user.role !== "employee") {
      return res.status(403).json({ error: "Only employees can view their connected business" });
    }

    try {
      const [business] = await db.select({
        id: users.id,
        username: users.username,
        role: users.role
      })
      .from(businessEmployees)
      .innerJoin(users, eq(users.id, businessEmployees.businessId))
      .where(and(
        eq(businessEmployees.employeeId, req.user.id),
        eq(businessEmployees.isActive, true)
      ));

      res.json(business || null);
    } catch (error) {
      console.error('Error fetching connected business:', error);
      res.status(500).json({ error: "Failed to fetch connected business" });
    }
  });

  // Get all staff members (for direct messaging)
  app.get("/api/users/staff", async (req, res) => {
    if (!req.user || (req.user.role !== "business" && req.user.role !== "employee")) {
      return res.status(403).json({ error: "Only business and employees can view staff" });
    }

    try {
      let query = db.select({
        id: users.id,
        username: users.username,
        role: users.role
      })
      .from(users)
      .where(
        or(
          eq(users.role, "employee"),
          eq(users.role, "business")
        )
      );

      // If user is an employee, only show staff from their business
      if (req.user.role === "employee") {
        const [business] = await db.select({ businessId: businessEmployees.businessId })
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.isActive, true)
          ));

        if (!business) {
          return res.json([]);
        }

        query = query.where(
          or(
            eq(users.id, business.businessId),
            exists(
              db.select()
                .from(businessEmployees)
                .where(and(
                  eq(businessEmployees.businessId, business.businessId),
                  eq(businessEmployees.employeeId, users.id),
                  eq(businessEmployees.isActive, true)
                ))
            )
          )
        );
      }

      const staff = await query;
      res.json(staff);
    } catch (error) {
      console.error('Error fetching staff:', error);
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  return httpServer;
}