import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { tickets, users, ticketNotes, messages, ticketFeedback, businessEmployees, employeeInvitations } from "@db/schema";
import { eq, and, or, not } from "drizzle-orm";
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase credentials. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set.');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Add business profile routes
  app.get("/api/business/profile", async (req, res) => {
    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError || !session) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Check if the user is a business
      if (session.user.user_metadata.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can view their profile" });
      }

      // Get the business profile
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('Error fetching business profile:', error);
        throw error;
      }

      res.json(profile || {});
    } catch (error) {
      console.error('Error fetching business profile:', error);
      res.status(500).json({ error: "Failed to fetch business profile" });
    }
  });

  app.put("/api/business/profile", async (req, res) => {
    try {
      // Get the current session
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError || !session) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Verify user is a business
      if (session.user.user_metadata.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can update their profile" });
      }

      const { companyName, description, website, address, phone, industry, logo } = req.body;

      // Update the business profile
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: session.user.id,
          company_name: companyName,
          description,
          website,
          address,
          phone,
          industry,
          logo,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Profile update error:', error);
        throw error;
      }

      res.json({ message: "Profile updated successfully" });
    } catch (error) {
      console.error('Error updating business profile:', error);
      res.status(500).json({ error: "Failed to update business profile" });
    }
  });

  // Employee management routes (replaced with Supabase version)
  app.post("/api/businesses/employees/invite", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can invite employees" });
      }

      const { employeeId } = req.body;

      if (!employeeId) {
        return res.status(400).json({ error: "Employee ID is required" });
      }

      // Check if employee exists and has role 'employee'
      const { data: employee, error: employeeError } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', employeeId)
        .eq('role', 'employee')
        .single();

      if (employeeError || !employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      // Check for existing invitation
      const { data: existingInvitation, error: inviteError } = await supabase
        .from('employee_invitations')
        .select()
        .eq('business_id', req.user.id)
        .eq('employee_id', employeeId)
        .eq('status', 'pending')
        .single();

      if (existingInvitation) {
        return res.status(400).json({ error: "Invitation already sent" });
      }

      // Create invitation
      const { data: invitation, error: createError } = await supabase
        .from('employee_invitations')
        .insert({
          business_id: req.user.id,
          employee_id: employeeId,
          status: 'pending'
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

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


  // Get all employees for a business (replaced with Supabase version)
  app.get("/api/businesses/employees", async (req, res) => {
    try {
      if (!req.user || (req.user.role !== "business" && req.user.role !== "employee")) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      let businessId = req.user.role === "business" ? req.user.id : null;

      // If employee, get their business ID
      if (req.user.role === "employee") {
        const { data: employeeRelation, error } = await supabase
          .from('business_employees')
          .select('business_id')
          .eq('employee_id', req.user.id)
          .eq('is_active', true)
          .single();

        if (error || !employeeRelation) {
          return res.status(404).json({ error: "Business not found" });
        }

        businessId = employeeRelation.business_id;
      }

      // Get employees with their details
      const { data: employees, error } = await supabase
        .from('business_employees')
        .select(`
          id,
          is_active,
          employee:employee_id (
            id,
            email,
            role
          )
        `)
        .eq('business_id', businessId);

      if (error) {
        throw error;
      }

      const formattedEmployees = employees.map(emp => ({
        employee: {
          id: emp.employee.id,
          username: emp.employee.email,
          role: emp.employee.role
        },
        relation: {
          id: emp.id,
          isActive: emp.is_active
        }
      }));

      res.json(formattedEmployees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // Remove employee (business only) (replaced with Supabase version)
  app.delete("/api/businesses/employees/:employeeId", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can remove employees" });
      }

      const { employeeId } = req.params;

      // Check if relationship exists
      const { data: relationship, error: fetchError } = await supabase
        .from('business_employees')
        .select()
        .eq('business_id', req.user.id)
        .eq('employee_id', employeeId)
        .single();

      if (fetchError || !relationship) {
        return res.status(404).json({ error: "Employee relationship not found" });
      }

      // Update relationship to inactive
      const { error: updateError } = await supabase
        .from('business_employees')
        .update({ is_active: false })
        .eq('id', relationship.id);

      if (updateError) {
        throw updateError;
      }

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

    try {
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

      // Create the ticket without initial assignment
      const [ticket] = await db.insert(tickets)
        .values({
          title,
          description,
          customerId: req.user.id,
          businessId: business.id,
        })
        .returning();

      res.json(ticket);
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  // Get tickets route
  app.get("/api/tickets", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    try {
      let ticketsQuery;
      if (req.user.role === "customer") {
        // Customers only see their own tickets
        ticketsQuery = db.select()
          .from(tickets)
          .where(eq(tickets.customerId, req.user.id));
      } else if (req.user.role === "business") {
        // Business sees all tickets assigned to their business
        ticketsQuery = db.select()
          .from(tickets)
          .where(eq(tickets.businessId, req.user.id));
      } else if (req.user.role === "employee") {
        // Employees see all tickets from businesses they work for
        ticketsQuery = db.select({
          id: tickets.id,
          title: tickets.title,
          description: tickets.description,
          status: tickets.status,
          priority: tickets.priority,
          category: tickets.category,
          customerId: tickets.customerId,
          businessId: tickets.businessId,
          assignedToId: tickets.assignedToId,
          createdAt: tickets.createdAt,
          updatedAt: tickets.updatedAt
        })
          .from(tickets)
          .innerJoin(businessEmployees, eq(tickets.businessId, businessEmployees.businessId))
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.isActive, true)
          ))
          .orderBy(tickets.createdAt);
      }

      const results = await ticketsQuery;
      res.json(results);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });


  app.patch("/api/tickets/:id", async (req, res) => {
    if (!req.user) return res.status(401).send("Not authenticated");

    const { id } = req.params;
    const { status } = req.body;

    const [ticket] = await db.select().from(tickets)
      .where(eq(tickets.id, parseInt(id)));

    if (!ticket) return res.status(404).send("Ticket not found");

    // Added employee authorization check
    if (req.user.role === "employee") {
      const [hasAccess] = await db.select()
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.businessId, ticket.businessId),
          eq(businessEmployees.isActive, true)
        ))
        .limit(1);
      if (!hasAccess) return res.status(403).send("Not authorized to update this ticket");
    } else if (req.user.role === "business" && ticket.businessId !== req.user.id) {
      return res.status(403).send("Not authorized to update this ticket");
    } else if (req.user.role === "customer" && ticket.customerId !== req.user.id) {
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
      //Added employee authorization check
      if (req.user.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.businessId),
            eq(businessEmployees.isActive, true)
          ))
          .limit(1);
        if (!hasAccess) return res.status(403).json({ error: "Not authorized to view this feedback" });
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

  // Note routes
  app.get("/api/tickets/:id/notes", async (req, res) => {
    if (!req.user) return res.status(403).send("Not authenticated");

    const { id } = req.params;

    const [ticket] = await db.select().from(tickets)
      .where(eq(tickets.id, parseInt(id)));

    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }

    // Check if user has access to this ticket
    if (req.user.role === "business" && ticket.businessId !== req.user.id) {
      return res.status(403).send("Not authorized to view these notes");
    }

    // For employees, verify they have access to this business
    if (req.user.role === "employee") {
      const [hasAccess] = await db.select()
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.businessId, ticket.businessId),
          eq(businessEmployees.isActive, true)
        ))
        .limit(1);

      if (!hasAccess) {
        return res.status(403).send("Not authorized to view these notes");
      }
    }

    const notes = await db.select()
      .from(ticketNotes)
      .where(eq(ticketNotes.ticketId, parseInt(id)));

    res.json(notes);
  });

  // Allow employees to add notes
  app.post("/api/tickets/:id/notes", async (req, res) => {
    if (!req.user || (req.user.role !== "business" && req.user.role !== "employee")) {
      return res.status(403).send("Only business users and employees can add notes");
    }

    const { id } = req.params;
    const { content } = req.body;

    const [ticket] = await db.select().from(tickets)
      .where(eq(tickets.id, parseInt(id)));

    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }

    // For employees, verify they have access to this business
    if (req.user.role === "employee") {
      const [hasAccess] = await db.select()
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.businessId, ticket.businessId),
          eq(businessEmployees.isActive, true)
        ))
        .limit(1);

      if (!hasAccess) {
        return res.status(403).send("Not authorized to add notes to this ticket");
      }
    }

    const [note] = await db.insert(ticketNotes)
      .values({
        ticketId: parseInt(id),
        userId: req.user.id,
        content,
        userType: req.user.role // Add this to differentiate between business and employee notes
      })
      .returning();

    res.json(note);
  });

  // Get chat logs for a ticket
  app.get("/api/tickets/:id/chat", async (req, res) => {
    if (!req.user) return res.status(403).send("Not authenticated");

    const { id } = req.params;

    const [ticket] = await db.select().from(tickets)
      .where(eq(tickets.id, parseInt(id)));

    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }

    // Check if user has access to this ticket
    if (req.user.role === "customer" && ticket.customerId !== req.user.id) {
      return res.status(403).send("Not authorized to view this chat");
    }

    if (req.user.role === "business" && ticket.businessId !== req.user.id) {
      return res.status(403).send("Not authorized to view this chat");
    }

    // For employees, verify they have access to this business
    if (req.user.role === "employee") {
      const [hasAccess] = await db.select()
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.businessId, ticket.businessId),
          eq(businessEmployees.isActive, true)
        ))
        .limit(1);

      if (!hasAccess) {
        return res.status(403).send("Not authorized to view this chat");
      }
    }

    const messages = await db.select()
      .from(messages)
      .where(eq(messages.ticketId, parseInt(id)))
      .orderBy(messages.createdAt);

    res.json(messages);
  });

  // Allow employees to send messages in ticket chats
  app.post("/api/tickets/:id/chat", async (req, res) => {
    if (!req.user) return res.status(403).send("Not authenticated");

    const { id } = req.params;
    const { content } = req.body;

    const [ticket] = await db.select().from(tickets)
      .where(eq(tickets.id, parseInt(id)));

    if (!ticket) {
      return res.status(404).send("Ticket not found");
    }

    // Verify access for employees
    if (req.user.role === "employee") {
      const [hasAccess] = await db.select()
        .from(businessEmployees)
        .where(and(
          eq(businessEmployees.employeeId, req.user.id),
          eq(businessEmployees.businessId, ticket.businessId),
          eq(businessEmployees.isActive, true)
        ))
        .limit(1);

      if (!hasAccess) {
        return res.status(403).send("Not authorized to send messages in this ticket");
      }
    }

    const [message] = await db.insert(messages)
      .values({
        ticketId: parseInt(id),
        senderId: req.user.id,
        content,
        senderType: req.user.role
      })
      .returning();

    res.json(message);
  });

  // Update the get employees route to show all available employees for businesses (replaced with Supabase version)
  app.get("/api/employees", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can view employees" });
      }

      // Get all employees that are not already connected to this business
      const { data: employees, error } = await supabase
        .from('users')
        .select('id, email')
        .eq('role', 'employee')
        .not('id', 'in', (sb) =>
          sb.from('business_employees')
            .select('employee_id')
            .eq('business_id', req.user.id)
            .eq('is_active', true)
        );

      if (error) {
        console.error('Error fetching employees:', error);
        return res.status(500).json({ error: "Failed to fetch employees" });
      }

      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
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

  // Add endpoint to assign/claim a ticket
  app.post("/api/tickets/:id/assign", async (req, res) => {
    if (!req.user || (req.user.role !== "business" && req.user.role !== "employee")) {
      return res.status(403).send("Only business users and employees can assign tickets");
    }

    const { id } = req.params;
    const { assignToId } = req.body;

    try {
      const [ticket] = await db.select()
        .from(tickets)
        .where(eq(tickets.id, parseInt(id)));

      if (!ticket) {
        return res.status(404).send("Ticket not found");
      }

      // Verify access for employees
      if (req.user.role === "employee") {
        const [hasAccess] = await db.select()
          .from(businessEmployees)
          .where(and(
            eq(businessEmployees.employeeId, req.user.id),
            eq(businessEmployees.businessId, ticket.businessId),
            eq(businessEmployees.isActive, true)
          ))
          .limit(1);

        if (!hasAccess) {
          return res.status(403).send("Not authorized to assign this ticket");
        }
      }

      // Update ticket assignment
      const [updatedTicket] = await db.update(tickets)
        .set({
          assignedToId: assignToId || req.user.id,
          updatedAt: new Date()
        })
        .where(eq(tickets.id, parseInt(id)))
        .returning();

      res.json(updatedTicket);
    } catch (error) {
      console.error('Error assigning ticket:', error);
      res.status(500).json({ error: "Failed to assign ticket" });
    }
  });

  const httpServer = createServer(app);

  // Setup WebSocket server
  setupWebSocket(httpServer, app);

  return httpServer;
}