import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { tickets, users, ticketNotes, messages, ticketFeedback, businessEmployees, employeeInvitations, businessProfiles, type User } from "@db/schema";
import { eq, and, or, not, exists, desc } from "drizzle-orm";
import { sql } from 'drizzle-orm/sql';
import { directMessages } from "@db/schema";


// Extend Express.User to include our schema
declare global {
  namespace Express {
    interface User extends User {}
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Add these routes at the beginning of registerRoutes
  app.get("/api/businesses/employees", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can view their employees" });
      }

      // Get the current business profile
      const [businessProfile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.userId, req.user.id));

      if (!businessProfile) {
        return res.status(404).json({ error: "Business profile not found" });
      }

      // Get only employees connected to this specific business
      const employees = await db
        .select({
          employee: {
            id: users.id,
            username: users.username,
            role: users.role
          },
          connection: {
            isActive: businessEmployees.isActive,
            createdAt: businessEmployees.createdAt
          }
        })
        .from(businessEmployees)
        .innerJoin(users, eq(users.id, businessEmployees.employeeId))
        .where(eq(businessEmployees.businessProfileId, businessProfile.id))
        .orderBy(businessEmployees.createdAt);

      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // Update the employee invitation endpoint
  app.post("/api/businesses/employees/invite", async (req, res) => {
    try {
      if (!req.user?.role || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can invite employees" });
      }

      const { employeeId } = req.body;

      if (!employeeId) {
        return res.status(400).json({ error: "Invalid employee ID" });
      }

      // Get the business profile
      const [businessProfile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.userId, req.user.id));

      if (!businessProfile) {
        return res.status(404).json({ error: "Business profile not found" });
      }

      // Verify the employee exists and is of role 'employee'
      const [employee] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.id, employeeId),
          eq(users.role, "employee")
        ));

      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      // Check if employee is already connected to this business
      const [existingConnection] = await db
        .select()
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.businessProfileId, businessProfile.id),
          eq(businessEmployees.employeeId, employeeId)
        ));

      if (existingConnection) {
        return res.status(400).json({ error: "Employee is already connected to this business" });
      }

      // Check if invitation already exists for this specific business
      const [existingInvitation] = await db
        .select()
        .from(employeeInvitations)
        .where(and(
          eq(employeeInvitations.businessProfileId, businessProfile.id),
          eq(employeeInvitations.employeeId, employeeId),
          eq(employeeInvitations.status, "pending")
        ));

      if (existingInvitation) {
        return res.status(400).json({ error: "Invitation already sent" });
      }

      // Create invitation specifically for this business
      const [invitation] = await db
        .insert(employeeInvitations)
        .values({
          businessProfileId: businessProfile.id,
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

  // Update the invitation list endpoint for employees
  app.get("/api/employees/invitations", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can view their invitations" });
      }

      // Get pending invitations with business details
      const invitations = await db
        .select({
          invitation: employeeInvitations,
          business: {
            id: businessProfiles.id,
            name: businessProfiles.businessName,
            userId: businessProfiles.userId
          }
        })
        .from(employeeInvitations)
        .innerJoin(businessProfiles, eq(businessProfiles.id, employeeInvitations.businessProfileId))
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

  // Add this endpoint before the employee management routes
  app.get("/api/employees/active-businesses", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can view their business connections" });
      }

      // Get all business connections for the employee with business details
      const businessConnections = await db
        .select({
          business: {
            id: businessProfiles.id,
            name: businessProfiles.businessName,
            userId: businessProfiles.userId
          },
          connection: {
            isActive: businessEmployees.isActive,
          }
        })
        .from(businessEmployees)
        .innerJoin(businessProfiles, eq(businessProfiles.id, businessEmployees.businessProfileId))
        .where(eq(businessEmployees.employeeId, req.user.id));

      res.json(businessConnections);
    } catch (error) {
      console.error('Error fetching business connections:', error);
      res.status(500).json({ error: "Failed to fetch business connections" });
    }
  });
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

      // Get the business profile
      const [businessProfile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.userId, req.user.id));

      if (!businessProfile) {
        return res.status(404).json({ error: "Business profile not found" });
      }

      // Verify the employee exists and is of role 'employee'
      const [employee] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.id, employeeId),
          eq(users.role, "employee")
        ));

      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      // Check if employee is already connected to this business
      const [existingConnection] = await db
        .select()
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.businessProfileId, businessProfile.id),
          eq(businessEmployees.employeeId, employeeId)
        ));

      if (existingConnection) {
        return res.status(400).json({ error: "Employee is already connected to this business" });
      }

      // Check if invitation already exists for this specific business
      const [existingInvitation] = await db
        .select()
        .from(employeeInvitations)
        .where(and(
          eq(employeeInvitations.businessProfileId, businessProfile.id),
          eq(employeeInvitations.employeeId, employeeId),
          eq(employeeInvitations.status, "pending")
        ));

      if (existingInvitation) {
        return res.status(400).json({ error: "Invitation already sent" });
      }

      // Create invitation specifically for this business
      const [invitation] = await db
        .insert(employeeInvitations)
        .values({
          businessProfileId: businessProfile.id,
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

  // Messages routes
  // Get messages for a ticket
  app.get("/api/tickets/:ticketId/messages", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { ticketId } = req.params;

    try {
      // Get the ticket to verify access
      const [ticket] = await db
        .select({
          id: tickets.id,
          customerId: tickets.customerId,
          businessProfileId: tickets.businessProfileId,
          claimedById: tickets.claimedById
        })
        .from(tickets)
        .where(eq(tickets.id, parseInt(ticketId)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Get business profile if user is a business
      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.userId, req.user.id));
      }

      // Verify user has access to this ticket
      if (req.user.role === "customer" && ticket.customerId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to view these messages" });
      }

      if (req.user.role === "employee") {
        const [hasAccess] = await db
          .select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessProfileId, ticket.businessProfileId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket's messages" });
        }
      }

      if (req.user.role === "business") {
        if (!businessProfile || ticket.businessProfileId !== businessProfile.id) {
          return res.status(403).json({ error: "Not authorized to view these messages" });
        }
      }

      // Fetch all messages for this ticket
      const ticketMessages = await db
        .select({
          message: {
            id: messages.id,
            content: messages.content,
            ticketId: messages.ticketId,
            senderId: messages.senderId,
            receiverId: messages.receiverId,
            status: messages.status,
            chatInitiator: messages.chatInitiator,
            initiatedAt: messages.initiatedAt,
            sentAt: messages.sentAt,
            readAt: messages.readAt,
            createdAt: messages.createdAt
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

      // Mark messages as read if the user is the receiver
      const unreadMessages = ticketMessages.filter(
        msg => msg.message.receiverId === req.user!.id && msg.message.status !== 'read'
      );

      if (unreadMessages.length > 0) {
        await db
          .update(messages)
          .set({
            status: 'read',
            readAt: new Date()
          })
          .where(
            and(
              eq(messages.ticketId, parseInt(ticketId)),
              eq(messages.receiverId, req.user!.id),
              not(eq(messages.status, 'read'))
            )
          );
      }

      res.json(ticketMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Mark messages as read
  app.post("/api/tickets/:id/messages/read", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;

      // Get the ticket to verify access
      const [ticket] = await db.select({id: tickets.id, customerId: tickets.customerId, businessProfileId: tickets.businessProfileId})
        .from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Verify user has access to this ticket
      if (req.user.role === "customer" && ticket.customerId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to access these messages" });
      }

      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.userId, req.user.id));
        if (!businessProfile || ticket.businessProfileId !== businessProfile.id) {
          return res.status(403).json({ error: "Not authorized to access these messages" });
        }
      }

      if (req.user.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessProfileId, ticket.businessProfileId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket's messages" });
        }
      }


      // Mark all messages as read where the current user is the receiver
      await db.update(messages)
        .set({
          status: 'read',
          readAt: new Date()
        })
        .where(and(
          eq(messages.ticketId, parseInt(id)),
          eq(messages.receiverId, req.user.id),
          not(eq(messages.status, 'read'))
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Send a message in a ticket
  app.post("/api/tickets/:ticketId/messages", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { ticketId } = req.params;
    const { content } = req.body;

    try {
      // Get the ticket to verify access and determine receiver
      const [ticket] = await db.select({id: tickets.id, customerId: tickets.customerId, businessProfileId: tickets.businessProfileId, claimedById: tickets.claimedById})
        .from(tickets)
        .where(eq(tickets.id, parseInt(ticketId)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      let receiverId: number;
      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.userId, req.user.id));
        if (!businessProfile || ticket.businessProfileId !== businessProfile.id) {
          return res.status(403).json({ error: "Not authorized to send messages for this ticket" });
        }
      }

      // For customers, verify ownership of ticket
      if (req.user.role === "customer") {
        if (ticket.customerId !== req.user.id) {
          return res.status(403).json({ error: "Not authorized to send messages for this ticket" });
        }

        // Send to claimed employee if exists, otherwise to business
        receiverId = ticket.claimedById || (businessProfile ? businessProfile.id : ticket.businessProfileId); //potential error if businessprofile is not found
      } else if (req.user.role === "employee") {
        // Verify employee has access
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessProfileId, ticket.businessProfileId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
        receiverId = ticket.customerId;
      } else if (req.user.role === "business") {
        receiverId = ticket.customerId;
      } else {
        return res.status(403).json({ error: "Invalid user role" });
      }

      // Check if this is the first message in the ticket
      const [existingMessage] = await db.select()
        .from(messages)
        .where(eq(messages.ticketId, parseInt(ticketId)))
        .limit(1);

      const isFirstMessage = !existingMessage;

      const [message] = await db.insert(messages)
        .values({
          content,
          ticketId: parseInt(ticketId),
          senderId: req.user.id,
          receiverId,
          status: 'sent',
          chatInitiator: isFirstMessage,
          initiatedAt: isFirstMessage ? new Date() : null,
          sentAt: new Date(),
          createdAt: new Date()
        })
        .returning();

      // Get sender information for the response
      const [sender] = await db.select({
        id: users.id,
        username: users.username,
        role: users.role
      })
        .from(users)
        .where(eq(users.id, req.user.id));

      res.json({
        message,
        sender
      });
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

    const { title, description, businessProfileId } = req.body;

    // Verify that the selected business exists
    const [businessProfile] = await db.select()
      .from(businessProfiles)
      .where(eq(businessProfiles.id, businessProfileId))
      .limit(1);

    if (!businessProfile) {
      return res.status(404).send("Selected business not found");
    }

    const [ticket] = await db.insert(tickets)
      .values({
        title,
        description,
        customerId: req.user.id,
        businessProfileId: businessProfile.id,
      })
      .returning();

    res.json(ticket);
  });

  app.get("/api/tickets", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    try {
      // For employees, first check if they have any active connections
      if (req.user.role === "employee") {
        const activeConnections = await db
          .select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.isActive, true)
          ));

        if (activeConnections.length === 0) {
          return res.json([]); // Return empty array if no active connections
        }
      }

      let query = db
        .select({
          id: tickets.id,
          title: tickets.title,
          description: tickets.description,
          status: tickets.status,
          priority: tickets.priority,
          category: tickets.category,
          customerId: tickets.customerId,
          businessProfileId: tickets.businessProfileId,
          claimedById: tickets.claimedById,
          claimedAt: tickets.claimedAt,
          createdAt: tickets.createdAt,
          updatedAt: tickets.updatedAt,
          customer: {
            id: users.id,
            username: users.username
          },
          business: {
            id: sql<number>`(SELECT id FROM businessProfiles WHERE id = ${tickets.businessProfileId})`,
            name: sql<string>`(SELECT businessName FROM businessProfiles WHERE id = ${tickets.businessProfileId})`
          },
          hasBusinessResponse: sql<boolean>`EXISTS (
            SELECT 1 FROM ${messages} 
            WHERE ${messages.ticketId} = ${tickets.id} 
            AND ${messages.senderId} = (SELECT userId FROM businessProfiles WHERE id = ${tickets.businessProfileId})
          )`,
          hasFeedback: sql<boolean>`EXISTS (
            SELECT 1 FROM ${ticketFeedback}
            WHERE ${ticketFeedback.ticketId} = ${tickets.id}
          )`,
          unreadCount: sql<number>`(
            SELECT COUNT(*) 
            FROM ${messages} 
            WHERE ${messages.ticketId} = ${tickets.id} 
            AND ${messages.receiverId} = ${req.user.id}
            AND ${messages.status} != 'read'
          )`
        })
        .from(tickets)
        .innerJoin(users, eq(users.id, tickets.customerId));

      if (req.user.role === "customer") {
        query = query.where(eq(tickets.customerId, req.user.id));
      } else if (req.user.role === "business") {
        const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
        query = query.where(eq(tickets.businessProfileId, businessProfile.id));
      } else if (req.user.role === "employee") {
        const businessIds = await db
          .select({ businessProfileId: businessEmployees.businessProfileId })
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.isActive, true)
          ));

        if (businessIds.length === 0) {
          return res.json([]);
        }

        query = query.where(
          and(
            or(...businessIds.map(({ businessProfileId }) => eq(tickets.businessProfileId, businessProfileId)))
          )
        );
      }

      const userTickets = await query.orderBy(desc(tickets.updatedAt));
      res.json(userTickets);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  app.get("/api/tickets/customer", async (req, res) => {
    if (!req.user || req.user.role !== "customer") {
      return res.status(403).json({ error: "Only customers can view their tickets" });
    }

    try {
      // Get all tickets for the customer with associated business and message data
      const customerTickets = await db.select({
        id: tickets.id,
        title: tickets.title,
        description: tickets.description,
        status: tickets.status,
        priority: tickets.priority,
        category: tickets.category,
        customerId: tickets.customerId,
        businessProfileId: tickets.businessProfileId,
        claimedById: tickets.claimedById,
        claimedAt: tickets.claimedAt,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
        business: {
          id: businessProfiles.id,
          name: businessProfiles.businessName,
        },
        hasBusinessResponse: sql<boolean>`EXISTS (
          SELECT 1 FROM ${messages} 
          WHERE ${messages.ticketId} = ${tickets.id} 
          AND ${messages.senderId} = (SELECT userId FROM businessProfiles WHERE id = ${tickets.businessProfileId})
        )`,
        unreadCount: sql<number>`(
          SELECT COUNT(*) 
          FROM ${messages} 
          WHERE ${messages.ticketId} = ${tickets.id} 
          AND ${messages.receiverId} = ${req.user.id}
          AND ${messages.status} != 'read'
        )`
      })
        .from(tickets)
        .innerJoin(businessProfiles, eq(businessProfiles.id, tickets.businessProfileId))
        .where(eq(tickets.customerId, req.user.id))
        .orderBy(desc(tickets.updatedAt));

      res.json(customerTickets);
    } catch (error) {
      console.error('Error fetching customer tickets:', error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  app.get("/api/tickets/businesses", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "customer") {
        return res.status(403).json({ error: "Only customers can view their business interactions" });
      }

      // Get unique businesses from the customer's tickets
      const businesses = await db.selectDistinct({
        id: businessProfiles.id,
        name: businessProfiles.businessName
      })
        .from(tickets)
        .innerJoin(businessProfiles, eq(businessProfiles.id, tickets.businessProfileId))
        .where(eq(tickets.customerId, req.user.id));

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
      const [ticket] = await db.select({id: tickets.id, businessProfileId: tickets.businessProfileId, customerId: tickets.customerId, claimedById: tickets.claimedById})
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
          eq(businessEmployees.businessProfileId, ticket.businessProfileId),
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

      // Initialize the chat with a system message
      const [initialMessage] = await db.insert(messages)
        .values({
          content: `Ticket claimed by ${req.user.username}`,
          ticketId: parseInt(id),
          senderId: req.user.id,
          receiverId: ticket.customerId,
          status: 'sent',
          chatInitiator: true,
          initiatedAt: new Date(),
          sentAt: new Date(),
          createdAt: new Date()
        })
        .returning();

      res.json({
        ticket: updatedTicket,
        message: initialMessage
      });
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

      const [ticket] = await db.select({id: tickets.id, businessProfileId: tickets.businessProfileId, claimedById: tickets.claimedById})
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
            eq(businessEmployees.businessProfileId, ticket.businessProfileId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      // For business, verify they own the ticket
      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
        if (!businessProfile || ticket.businessProfileId !== businessProfile.id) {
          return res.status(403).json({ error: "You can only unclaim tickets from your business" });
        }
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

      const [ticket] = await db.select({id: tickets.id, businessProfileId: tickets.businessProfileId, claimedById: tickets.claimedById, customerId: tickets.customerId})
        .from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Business can always update
      if (req.user.role === "business") {
        const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
        if (!businessProfile || ticket.businessProfileId !== businessProfile.id) {
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
            eq(businessEmployees.businessProfileId, ticket.businessProfileId),
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

      const [ticket] = await db.select({id: tickets.id, customerId: tickets.customerId, status: tickets.status})
        .from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket || ticket.customerId !== req.user.id || ticket.status !== "resolved") {
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
      const [ticket] = await db.select({id: tickets.id, businessProfileId: tickets.businessProfileId, customerId: tickets.customerId})
        .from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Check if user is authorized to view feedback
      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
        if (!businessProfile || ticket.businessProfileId !== businessProfile.id) {
          return res.status(403).json({ error: "Not authorized to view this feedback" });
        }
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
      const [ticket] = await db.select({id: tickets.id, businessProfileId: tickets.businessProfileId})
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
            eq(businessEmployees.businessProfileId, ticket.businessProfileId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
        if (!businessProfile || ticket.businessProfileId !== businessProfile.id) {
          return res.status(403).json({ error: "Not authorized to add notes to this ticket" });
        }
      }

      const [note] = await db.insert(ticketNotes)
        .values({
          ticketId: parseInt(id),
          businessProfileId: req.user.role === "business" ? businessProfile.id : ticket.businessProfileId,
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
      const [ticket] = await db.select({id: tickets.id, businessProfileId: tickets.businessProfileId})
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
            eq(businessEmployees.businessProfileId, ticket.businessProfileId),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
        if (!businessProfile || ticket.businessProfileId !== businessProfile.id) {
          return res.status(403).json({ error: "Not authorized to view notes for this ticket" });
        }
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

  //// Business analytics routes
  app.get("/api/analytics/feedback", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business users can access analytics" });
      }

      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

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
        .where(eq(tickets.businessProfileId, businessProfile.id));

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

  // Business analytics routes  app.get("/api/analytics/feedback", async (req, res) => {
  app.get("/api/analytics/tickets", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business users can access analytics" });
      }

      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

      // Get basic ticket metrics
      const allTickets = await db
        .select()
        .from(tickets)
        .where(eq(tickets.businessProfileId, businessProfile.id));

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
        .where(eq(tickets.businessProfileId, businessProfile.id))
        .groupBy(tickets.category);

      // Get tickets by priority
      const ticketsByPriority = await db
        .select({
          priority: tickets.priority,
          count: sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(eq(tickets.businessProfileId, businessProfile.id))
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

      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

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
          eq(businessEmployees.businessProfileId, businessProfile.id),
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
          eq(tickets.businessProfileId, businessProfile.id),
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
        .where(eq(tickets.businessProfileId, businessProfile.id));

      const resolvedTickets = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(and(
          eq(tickets.businessProfileId, businessProfile.id),
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

      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

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
                  eq(businessEmployees.businessProfileId, businessProfile.id),
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

  // Get all businesses for an employee
  app.get("/api/employees/businesses", async (req, res) => {
    try {
      if (!req.user?.role || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can view their business relationships" });
      }

      const businesses = await db.select({
        id: businessProfiles.id,
        name: businessProfiles.businessName,
      })
        .from(businessEmployees)
        .innerJoin(businessProfiles, eq(businessProfiles.id, businessEmployees.businessProfileId))
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
          id: businessProfiles.id,
          name: businessProfiles.businessName
        }
      })
        .from(employeeInvitations)
        .innerJoin(businessProfiles, eq(businessProfiles.id, employeeInvitations.businessProfileId))
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
  app.post("/api/invitations/:id/respond", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can respond to invitations" });
      }

      const { id } = req.params;
      const { accept } = req.body;

      // Get the invitation
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

      // Start a transaction to handle the response
      await db.transaction(async (tx) => {
        // Update the invitation status
        await tx.update(employeeInvitations)
          .set({
            status: accept ? "accepted" : "rejected",
            updatedAt: new Date()
          })
          .where(eq(employeeInvitations.id, parseInt(id)));

        if (accept) {
          // Deactivate ALL existing relationships for this employee
          await tx.update(businessEmployees)
            .set({ 
              isActive: false,
              updatedAt: new Date() 
            })
            .where(eq(businessEmployees.employeeId, req.user.id));

          // Create new business employee relationship
          await tx.insert(businessEmployees)
            .values({
              businessProfileId: invitation.businessProfileId,
              employeeId: req.user.id,
              isActive: true,
              createdAt: new Date()
            });

          // Get business profile for welcome message
          const [businessProfile] = await tx.select({
            name: businessProfiles.businessName,
            userId: businessProfiles.userId
          })
            .from(businessProfiles)
            .where(eq(businessProfiles.id, invitation.businessProfileId));

          // Create welcome direct message
          await tx.insert(directMessages)
            .values({
              content: `Welcome to ${businessProfile.name}! Feel free to reach out if you need any assistance.`,
              senderId: businessProfile.userId,
              receiverId: req.user.id,
              businessProfileId: invitation.businessProfileId,
              status: 'sent',
              sentAt: new Date(),
              createdAt: new Date()
            });
        }
      });

      res.json({ message: `Invitation ${accept ? 'accepted' : 'rejected'} successfully` });
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

      let businessProfileId;
      if (req.user.role === "business") {
        const [profile] = await db.select({id: businessProfiles.id}).from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
        businessProfileId = profile.id;
      } else {
        const [relation] = await db.select({businessProfileId: businessEmployees.businessProfileId})
          .from(businessEmployees)
          .where(eq(businessEmployees.employeeId, req.user.id))
          .limit(1);
        businessProfileId = relation.businessProfileId;
      }

      if (!businessProfileId) {
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
        .where(eq(businessEmployees.businessProfileId, businessProfileId));

      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // Business employee management routes
  app.delete("/api/businesses/employees/:employeeId", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business users can manage employees" });
      }

      const { employeeId } = req.params;
      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

      // Delete the business-employee relationship
      await db.delete(businessEmployees)
        .where(and(
          eq(businessEmployees.businessProfileId, businessProfile.id),
          eq(businessEmployees.employeeId, parseInt(employeeId))
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error removing employee:', error);
      res.status(500).json({ error: "Failed to remove employee" });
    }
  });

  // Add these routes after the business employee routes
  // Pause/unpause employee
  app.post("/api/businesses/:employeeId/pause", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can pause employees" });
      }

      const { employeeId } = req.params;
      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

      // Update the employee's active status
      await db.update(businessEmployees)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(and(
          eq(businessEmployees.businessProfileId, businessProfile.id),
          eq(businessEmployees.employeeId, parseInt(employeeId))
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error pausing employee:', error);
      res.status(500).json({ error: "Failed to pause employee" });
    }
  });

  app.post("/api/businesses/:employeeId/unpause", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can unpause employees" });
      }

      const { employeeId } = req.params;
      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

      // Update the employee's active status
      await db.update(businessEmployees)
        .set({
          isActive: true,
          updatedAt: new Date()
        })
        .where(and(
          eq(businessEmployees.businessProfileId, businessProfile.id),
          eq(businessEmployees.employeeId, parseInt(employeeId))
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error unpausing employee:', error);
      res.status(500).json({ error: "Failed to unpause employee" });
    }
  });

  // Direct messages routes
  app.get("/api/direct-messages/:otherUserId", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { otherUserId } = req.params;

      // Get business profile if user is a business
      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
      }

      // Get messages between these two users
      const messages = await db.select({
          message: {
            id: directMessages.id,
            content: directMessages.content,
            senderId: directMessages.senderId,
            receiverId: directMessages.receiverId,
            status: directMessages.status,
            businessProfileId: directMessages.businessProfileId,
            sentAt: directMessages.sentAt,
            readAt: directMessages.readAt,
            createdAt: directMessages.createdAt
          },
          sender: {
            id: users.id,
            username: users.username,
            role: users.role
          }
        })
        .from(directMessages)
        .innerJoin(users, eq(users.id, directMessages.senderId))
        .where(
          and(
            or(
              and(
                eq(directMessages.senderId, req.user.id),
                eq(directMessages.receiverId, parseInt(otherUserId))
              ),
              and(
                eq(directMessages.senderId, parseInt(otherUserId)),
                eq(directMessages.receiverId, req.user.id)
              )
            ),
            businessProfile 
              ? eq(directMessages.businessProfileId, businessProfile.id)
              : sql`1=1`
          )
        )
        .orderBy(directMessages.createdAt);

      // Mark messages as read if user is the receiver
      if (messages.length > 0) {
        await db.update(directMessages)
          .set({
            status: 'read',
            readAt: new Date()
          })
          .where(and(
            eq(directMessages.receiverId, req.user.id),
            eq(directMessages.senderId, parseInt(otherUserId)),
            not(eq(directMessages.status, 'read')),
            businessProfile 
              ? eq(directMessages.businessProfileId, businessProfile.id)
              : sql`1=1`
          ));
      }

      res.json(messages);
    } catch (error) {
      console.error('Error fetching direct messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/direct-messages/:otherUserId", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { otherUserId } = req.params;
      const { content } = req.body;

      // Get business profile if user is a business
      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
      }

      // Verify the other user exists
      const [otherUser] = await db.select()
        .from(users)
        .where(eq(users.id, parseInt(otherUserId)));

      if (!otherUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // For business-employee messages, verify the relationship
      if (req.user.role === "business" && otherUser.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.businessProfileId, businessProfile.id),
            eq(businessEmployees.employeeId, otherUser.id),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to message this employee" });
        }
      }

      // For employee-business messages, verify the relationship
      if (req.user.role === "employee" && otherUser.role === "business") {
        const [otherBusinessProfile] = await db.select()
          .from(businessProfiles)
          .where(eq(businessProfiles.userId, otherUser.id));

        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.businessProfileId, otherBusinessProfile.id),
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to message this business" });
        }

        businessProfile = otherBusinessProfile;
      }

      // Send the message
      const [message] = await db.insert(directMessages)
        .values({
          content,
          senderId: req.user.id,
          receiverId: parseInt(otherUserId),
          businessProfileId: businessProfile?.id,
          status: 'sent',
          sentAt: new Date(),
          createdAt: new Date()
        })
        .returning();

      // Get sender information for the response
      const [sender] = await db.select({
        id: users.id,
        username: users.username,
        role: users.role
      })
        .from(users)
        .where(eq(users.id, req.user.id));

      res.json({
        message,
        sender
      });
    } catch (error) {
      console.error('Error sending direct message:', error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Get list of employees in the same business
  app.get("/api/users/staff", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get the business this employee works for
      const [employeeRelation] = await db.select({businessProfileId: businessEmployees.businessProfileId})
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.isActive, true)
        ));

      if (!employeeRelation) {
        return res.status(404).json({ error: "Employee relation not found" });
      }

      // Get all active employees from the same business
      const employees = await db.select({
        id: users.id,
        username: users.username,
        role: users.role
      })
        .from(users)
        .innerJoin(
          businessEmployees,
          and(
            eq(businessEmployees.employeeId, users.id),
            eq(businessEmployees.businessProfileId, employeeRelation.businessProfileId),
            eq(businessEmployees.isActive, true)
          )
        )
        .where(not(eq(users.id, req.user.id))); // Exclude current user

      res.json(employees);
    } catch (error) {
      console.error('Error fetching staff:', error);
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  // Get business user for employee
  app.get("/api/users/business", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get the business this employee works for
      const [employeeRelation] = await db.select({businessProfileId: businessEmployees.businessProfileId})
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.isActive, true)
        ));

      if (!employeeRelation) {
        return res.status(404).json({ error: "Employee relation not found" });
      }

      // Get the business user
      const [business] = await db.select({
        id: businessProfiles.id,
        name: businessProfiles.businessName,
        userId: businessProfiles.userId
      })
        .from(businessProfiles)
        .where(eq(businessProfiles.id, employeeRelation.businessProfileId));

      if (!business) {
        return res.status(404).json({ error: "Business not found" });
      }

      res.json(business);
    } catch (error) {
      console.error('Error fetching business:', error);
      res.status(500).json({ error: "Failed to fetch business" });
    }
  });

  // Mark direct messages as read
  app.post("/api/direct-messages/:userId/read", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { userId } = req.params;
      const otherUserId = parseInt(userId);

      let businessProfileId;
      if (req.user.role === "employee") {
        const [relation] = await db.select({businessProfileId: businessEmployees.businessProfileId}).from(businessEmployees).where(eq(businessEmployees.employeeId, req.user.id)).limit(1);
        businessProfileId = relation.businessProfileId;
      } else {
        const [profile] = await db.select({id: businessProfiles.id}).from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
        businessProfileId = profile.id;
      }

      // Mark messages as read
      await db.update(directMessages)
        .set({
          status: 'read',
          readAt: new Date()
        })
        .where(and(
          eq(directMessages.receiverId, req.user.id),
          eq(directMessages.senderId, otherUserId),
          not(eq(directMessages.status, 'read')),
          eq(directMessages.businessProfileId, businessProfileId)
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Add these routes after the business employee routes
  // Pause/unpause employee
  app.post("/api/businesses/:employeeId/pause", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can pause employees" });
      }

      const { employeeId } = req.params;
      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

      // Update the employee's active status
      await db.update(businessEmployees)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(and(
          eq(businessEmployees.businessProfileId, businessProfile.id),
          eq(businessEmployees.employeeId, parseInt(employeeId))
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error pausing employee:', error);
      res.status(500).json({ error: "Failed to pause employee" });
    }
  });

  app.post("/api/businesses/:employeeId/unpause", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can unpause employees" });
      }

      const { employeeId } = req.params;
      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

      // Update the employee's active status
      await db.update(businessEmployees)
        .set({
          isActive: true,
          updatedAt: new Date()
        })
        .where(and(
          eq(businessEmployees.businessProfileId, businessProfile.id),
          eq(businessEmployees.employeeId, parseInt(employeeId))
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error unpausing employee:', error);
      res.status(500).json({ error: "Failed to unpause employee" });
    }
  });

  // Direct messages routes
  app.get("/api/direct-messages/:otherUserId", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { otherUserId } = req.params;

      // Get business profile if user is a business
      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
      }

      // Get messages between these two users
      const messages = await db.select({
          message: {
            id: directMessages.id,
            content: directMessages.content,
            senderId: directMessages.senderId,
            receiverId: directMessages.receiverId,
            status: directMessages.status,
            businessProfileId: directMessages.businessProfileId,
            sentAt: directMessages.sentAt,
            readAt: directMessages.readAt,
            createdAt: directMessages.createdAt
          },
          sender: {
            id: users.id,
            username: users.username,
            role: users.role
          }
        })
        .from(directMessages)
        .innerJoin(users, eq(users.id, directMessages.senderId))
        .where(
          and(
            or(
              and(
                eq(directMessages.senderId, req.user.id),
                eq(directMessages.receiverId, parseInt(otherUserId))
              ),
              and(
                eq(directMessages.senderId, parseInt(otherUserId)),
                eq(directMessages.receiverId, req.user.id)
              )
            ),
            businessProfile 
              ? eq(directMessages.businessProfileId, businessProfile.id)
              : sql`1=1`
          )
        )
        .orderBy(directMessages.createdAt);

      // Mark messages as read if user is the receiver
      if (messages.length > 0) {
        await db.update(directMessages)
          .set({
            status: 'read',
            readAt: new Date()
          })
          .where(and(
            eq(directMessages.receiverId, req.user.id),
            eq(directMessages.senderId, parseInt(otherUserId)),
            not(eq(directMessages.status, 'read')),
            businessProfile 
              ? eq(directMessages.businessProfileId, businessProfile.id)
              : sql`1=1`
          ));
      }

      res.json(messages);
    } catch (error) {
      console.error('Error fetching direct messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/direct-messages/:otherUserId", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { otherUserId } = req.params;
      const { content } = req.body;

      // Get business profile if user is a business
      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
      }

      // Verify the other user exists
      const [otherUser] = await db.select()
        .from(users)
        .where(eq(users.id, parseInt(otherUserId)));

      if (!otherUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // For business-employee messages, verify the relationship
      if (req.user.role === "business" && otherUser.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.businessProfileId, businessProfile.id),
            eq(businessEmployees.employeeId, otherUser.id),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to message this employee" });
        }
      }

      // For employee-business messages, verify the relationship
      if (req.user.role === "employee" && otherUser.role === "business") {
        const [otherBusinessProfile] = await db.select()
          .from(businessProfiles)
          .where(eq(businessProfiles.userId, otherUser.id));

        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.businessProfileId, otherBusinessProfile.id),
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to message this business" });
        }

        businessProfile = otherBusinessProfile;
      }

      // Send the message
      const [message] = await db.insert(directMessages)
        .values({
          content,
          senderId: req.user.id,
          receiverId: parseInt(otherUserId),
          businessProfileId: businessProfile?.id,
          status: 'sent',
          sentAt: new Date(),
          createdAt: new Date()
        })
        .returning();

      // Get sender information for the response
      const [sender] = await db.select({
        id: users.id,
        username: users.username,
        role: users.role
      })
        .from(users)
        .where(eq(users.id, req.user.id));

      res.json({
        message,
        sender
      });
    } catch (error) {
      console.error('Error sending direct message:', error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Get list of employees in the same business
  app.get("/api/users/staff", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get the business this employee works for
      const [employeeRelation] = await db.select({businessProfileId: businessEmployees.businessProfileId})
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.isActive, true)
        ));

      if (!employeeRelation) {
        return res.status(404).json({ error: "Employee relation not found" });
      }

      // Get all active employees from the same business
      const employees = await db.select({
        id: users.id,
        username: users.username,
        role: users.role
      })
        .from(users)
        .innerJoin(
          businessEmployees,
          and(
            eq(businessEmployees.employeeId, users.id),
            eq(businessEmployees.businessProfileId, employeeRelation.businessProfileId),
            eq(businessEmployees.isActive, true)
          )
        )
        .where(not(eq(users.id, req.user.id))); // Exclude current user

      res.json(employees);
    } catch (error) {
      console.error('Error fetching staff:', error);
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  // Get business user for employee
  app.get("/api/users/business", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get the business this employee works for
      const [employeeRelation] = await db.select({businessProfileId: businessEmployees.businessProfileId})
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.isActive, true)
        ));

      if (!employeeRelation) {
        return res.status(404).json({ error: "Employee relation not found" });
      }

      // Get the business user
      const [business] = await db.select({
        id: businessProfiles.id,
        name: businessProfiles.businessName,
        userId: businessProfiles.userId
      })
        .from(businessProfiles)
        .where(eq(businessProfiles.id, employeeRelation.businessProfileId));

      if (!business) {
        return res.status(404).json({ error: "Business not found" });
      }

      res.json(business);
    } catch (error) {
      console.error('Error fetching business:', error);
      res.status(500).json({ error: "Failed to fetch business" });
    }
  });

  // Mark direct messages as read
  app.post("/api/direct-messages/:userId/read", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { userId } = req.params;
      const otherUserId = parseInt(userId);

      let businessProfileId;
      if (req.user.role === "employee") {
        const [relation] = await db.select({businessProfileId: businessEmployees.businessProfileId}).from(businessEmployees).where(eq(businessEmployees.employeeId, req.user.id)).limit(1);
        businessProfileId = relation.businessProfileId;
      } else {
        const [profile] = await db.select({id: businessProfiles.id}).from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
        businessProfileId = profile.id;
      }

      // Mark messages as read
      await db.update(directMessages)
        .set({
          status: 'read',
          readAt: new Date()
        })
        .where(and(
          eq(directMessages.receiverId, req.user.id),
          eq(directMessages.senderId, otherUserId),
          not(eq(directMessages.status, 'read')),
          eq(directMessages.businessProfileId, businessProfileId)
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Add these routes after the business employee routes
  // Pause/unpause employee
  app.post("/api/businesses/:employeeId/pause", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can pause employees" });
      }

      const { employeeId } = req.params;
      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

      // Update the employee's active status
      await db.update(businessEmployees)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(and(
          eq(businessEmployees.businessProfileId, businessProfile.id),
          eq(businessEmployees.employeeId, parseInt(employeeId))
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error pausing employee:', error);
      res.status(500).json({ error: "Failed to pause employee" });
    }
  });

  app.post("/api/businesses/:employeeId/unpause", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can unpause employees" });
      }

      const { employeeId } = req.params;
      const [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));

      // Update the employee's active status
      await db.update(businessEmployees)
        .set({
          isActive: true,
          updatedAt: new Date()
        })
        .where(and(
          eq(businessEmployees.businessProfileId, businessProfile.id),
          eq(businessEmployees.employeeId, parseInt(employeeId))
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error unpausing employee:', error);
      res.status(500).json({ error: "Failed to unpause employee" });
    }
  });

  // Direct messages routes
  app.get("/api/direct-messages/:otherUserId", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { otherUserId } = req.params;

      // Get business profile if user is a business
      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
      }

      // Get messages between these two users
      const messages = await db.select({
          message: {
            id: directMessages.id,
            content: directMessages.content,
            senderId: directMessages.senderId,
            receiverId: directMessages.receiverId,
            status: directMessages.status,
            businessProfileId: directMessages.businessProfileId,
            sentAt: directMessages.sentAt,
            readAt: directMessages.readAt,
            createdAt: directMessages.createdAt
          },
          sender: {
            id: users.id,
            username: users.username,
            role: users.role
          }
        })
        .from(directMessages)
        .innerJoin(users, eq(users.id, directMessages.senderId))
        .where(
          and(
            or(
              and(
                eq(directMessages.senderId, req.user.id),
                eq(directMessages.receiverId, parseInt(otherUserId))
              ),
              and(
                eq(directMessages.senderId, parseInt(otherUserId)),
                eq(directMessages.receiverId, req.user.id)
              )
            ),
            businessProfile 
              ? eq(directMessages.businessProfileId, businessProfile.id)
              : sql`1=1`
          )
        )
        .orderBy(directMessages.createdAt);

      // Mark messages as read if user is the receiver
      if (messages.length > 0) {
        await db.update(directMessages)
          .set({
            status: 'read',
            readAt: new Date()
          })
          .where(and(
            eq(directMessages.receiverId, req.user.id),
            eq(directMessages.senderId, parseInt(otherUserId)),
            not(eq(directMessages.status, 'read')),
            businessProfile 
              ? eq(directMessages.businessProfileId, businessProfile.id)
              : sql`1=1`
          ));
      }

      res.json(messages);
    } catch (error) {
      console.error('Error fetching direct messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/direct-messages/:otherUserId", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { otherUserId } = req.params;
      const { content } = req.body;

      // Get business profile if user is a business
      let businessProfile;
      if (req.user.role === "business") {
        [businessProfile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
      }

      // Verify the other user exists
      const [otherUser] = await db.select()
        .from(users)
        .where(eq(users.id, parseInt(otherUserId)));

      if (!otherUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // For business-employee messages, verify the relationship
      if (req.user.role === "business" && otherUser.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.businessProfileId, businessProfile.id),
            eq(businessEmployees.employeeId, otherUser.id),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to message this employee" });
        }
      }

      // For employee-business messages, verify the relationship
      if (req.user.role === "employee" && otherUser.role === "business") {
        const [otherBusinessProfile] = await db.select()
          .from(businessProfiles)
          .where(eq(businessProfiles.userId, otherUser.id));

        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.businessProfileId, otherBusinessProfile.id),
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.isActive, true)
          ));

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to message this business" });
        }

        businessProfile = otherBusinessProfile;
      }

      // Send the message
      const [message] = await db.insert(directMessages)
        .values({
          content,
          senderId: req.user.id,
          receiverId: parseInt(otherUserId),
          businessProfileId: businessProfile?.id,
          status: 'sent',
          sentAt: new Date(),
          createdAt: new Date()
        })
        .returning();

      // Get sender information for the response
      const [sender] = await db.select({
        id: users.id,
        username: users.username,
        role: users.role
      })
        .from(users)
        .where(eq(users.id, req.user.id));

      res.json({
        message,
        sender
      });
    } catch (error) {
      console.error('Error sending direct message:', error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Get list of employees in the same business
  app.get("/api/users/staff", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get the business this employee works for
      const [employeeRelation] = await db.select({businessProfileId: businessEmployees.businessProfileId})
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.isActive, true)
        ));

      if (!employeeRelation) {
        return res.status(404).json({ error: "Employee relation not found" });
      }

      // Get all active employees from the same business
      const employees = await db.select({
        id: users.id,
        username: users.username,
        role: users.role
      })
        .from(users)
        .innerJoin(
          businessEmployees,
          and(
            eq(businessEmployees.employeeId, users.id),
            eq(businessEmployees.businessProfileId, employeeRelation.businessProfileId),
            eq(businessEmployees.isActive, true)
          )
        )
        .where(not(eq(users.id, req.user.id))); // Exclude current user

      res.json(employees);
    } catch (error) {
      console.error('Error fetching staff:', error);
      res.status(500).json({ error: "Failed to fetch staff" });
    }
  });

  // Get business user for employee
  app.get("/api/users/business", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get the business this employee works for
      const [employeeRelation] = await db.select({businessProfileId: businessEmployees.businessProfileId})
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.isActive, true)
        ));

      if (!employeeRelation) {
        return res.status(404).json({ error: "Employee relation not found" });
      }

      // Get the business user
      const [business] = await db.select({
        id: businessProfiles.id,
        name: businessProfiles.businessName,
        userId: businessProfiles.userId
      })
        .from(businessProfiles)
        .where(eq(businessProfiles.id, employeeRelation.businessProfileId));

      if (!business) {
        return res.status(404).json({ error: "Business not found" });
      }

      res.json(business);
    } catch (error) {
      console.error('Error fetching business:', error);
      res.status(500).json({ error: "Failed to fetch business" });
    }
  });

  // Mark direct messages as read
  app.post("/api/direct-messages/:userId/read", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { userId } = req.params;
      const otherUserId = parseInt(userId);

      let businessProfileId;
      if (req.user.role === "employee") {
        const [relation] = await db.select({businessProfileId: businessEmployees.businessProfileId}).from(businessEmployees).where(eq(businessEmployees.employeeId, req.user.id)).limit(1);
        businessProfileId = relation.businessProfileId;
      } else {
        const [profile] = await db.select({id: businessProfiles.id}).from(businessProfiles).where(eq(businessProfiles.userId, req.user.id));
        businessProfileId = profile.id;
      }

      // Mark messages as read
      await db.update(directMessages)
        .set({
          status: 'read',
          readAt: new Date()
        })
        .where(and(
          eq(directMessages.receiverId, req.user.id),
          eq(directMessages.senderId, otherUserId),
          not(eq(directMessages.status, 'read')),
          eq(directMessages.businessProfileId, businessProfileId)
        ));

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  const httpServer = createServer(app);
  setupWebSocket(httpServer);

  return httpServer;
}