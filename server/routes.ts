import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, businessProfiles, businessEmployees, employeeInvitations, tickets } from "@db/schema";
import { eq, and } from "drizzle-orm";

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      role: 'business' | 'customer' | 'employee';
    }
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Get all employees for a specific business
  app.get("/api/businesses/employees", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can view their employees" });
      }

      // Get the current business profile
      const [businessProfile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.userId, req.user.id))
        .limit(1);

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
        .innerJoin(users, eq(businessEmployees.employeeId, users.id))
        .where(eq(businessEmployees.businessProfileId, businessProfile.id));

      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // Employee invitation endpoint
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
        .where(eq(businessProfiles.userId, req.user.id))
        .limit(1);

      if (!businessProfile) {
        return res.status(404).json({ error: "Business profile not found" });
      }

      // Verify the employee exists and is of role 'employee'
      const [employee] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.id, employeeId),
          eq(users.role, 'employee')
        ))
        .limit(1);

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
        ))
        .limit(1);

      if (existingConnection) {
        return res.status(400).json({ error: "Employee is already connected to this business" });
      }

      // Check if invitation already exists
      const [existingInvitation] = await db
        .select()
        .from(employeeInvitations)
        .where(and(
          eq(employeeInvitations.businessProfileId, businessProfile.id),
          eq(employeeInvitations.employeeId, employeeId),
          eq(employeeInvitations.status, 'pending')
        ))
        .limit(1);

      if (existingInvitation) {
        return res.status(400).json({ error: "Invitation already sent" });
      }

      // Create invitation
      const [invitation] = await db
        .insert(employeeInvitations)
        .values({
          businessProfileId: businessProfile.id,
          employeeId: employeeId,
          status: 'pending',
        })
        .returning();

      res.json(invitation);
    } catch (error) {
      console.error('Error inviting employee:', error);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  });

  // Get all available businesses for ticket creation
  app.get("/api/businesses", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const businesses = await db
        .select({
          id: businessProfiles.id,
          name: businessProfiles.businessName,
          userId: businessProfiles.userId
        })
        .from(businessProfiles);

      res.json(businesses);
    } catch (error) {
      console.error('Error fetching businesses:', error);
      res.status(500).json({ error: "Failed to fetch businesses" });
    }
  });

  // Create ticket with business selection
  app.post("/api/tickets", async (req, res) => {
    try {
      const { title, description, businessProfileId } = req.body;

      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!businessProfileId) {
        return res.status(400).json({ error: "Business profile ID is required" });
      }

      const [ticket] = await db
        .insert(tickets)
        .values({
          title,
          description,
          status: 'open',
          customerId: req.user.id,
          businessProfileId,
          category: 'general_inquiry',
          priority: 'medium',
        })
        .returning();

      res.json(ticket);
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  // Get invitations for an employee
  app.get("/api/employees/invitations", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can view their invitations" });
      }

      const invitations = await db
        .select({
          employeeInvitations: {
            id: employeeInvitations.id,
            businessProfileId: employeeInvitations.businessProfileId,
            employeeId: employeeInvitations.employeeId,
            status: employeeInvitations.status,
            createdAt: employeeInvitations.createdAt,
            updatedAt: employeeInvitations.updatedAt
          },
          business: {
            id: businessProfiles.id,
            businessName: businessProfiles.businessName,
            userId: businessProfiles.userId
          }
        })
        .from(employeeInvitations)
        .innerJoin(businessProfiles, eq(employeeInvitations.businessProfileId, businessProfiles.id))
        .where(and(
          eq(employeeInvitations.employeeId, req.user.id),
          eq(employeeInvitations.status, 'pending')
        ));

      res.json(invitations);
    } catch (error) {
      console.error('Error fetching invitations:', error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });

  // Get active businesses for employee
  app.get("/api/employees/active-businesses", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can view their business connections" });
      }

      const connections = await db
        .select({
          business: {
            id: businessProfiles.id,
            businessName: businessProfiles.businessName,
            userId: businessProfiles.userId
          },
          isActive: businessEmployees.isActive
        })
        .from(businessEmployees)
        .innerJoin(businessProfiles, eq(businessEmployees.businessProfileId, businessProfiles.id))
        .where(eq(businessEmployees.employeeId, req.user.id));


      res.json(connections);
    } catch (error) {
      console.error('Error fetching business connections:', error);
      res.status(500).json({ error: "Failed to fetch business connections" });
    }
  });

  // Get all tickets -  modified to include businessProfileId filtering
  app.get("/api/tickets", async (req, res) => {
    try {
      if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'business' && req.user.role !== 'employee')) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const businessProfileId = req.user.role === 'business' ? (await db.select().from(businessProfiles).where(eq(businessProfiles.userId, req.user.id)).limit(1))[0]?.id : undefined;

      const ticketsQuery = db.select({
        tickets: {
          id: tickets.id,
          title: tickets.title,
          description: tickets.description,
          status: tickets.status,
          customerId: tickets.customerId,
          businessProfileId: tickets.businessProfileId,
          claimedById: tickets.claimedById,
          createdAt: tickets.createdAt,
          updatedAt: tickets.updatedAt,
          category: tickets.category,
          priority: tickets.priority
        },
        customer: {
          id: users.id,
          username: users.username,
          role: users.role
        },
        business: {
          id: businessProfiles.id,
          businessName: businessProfiles.businessName,
          userId: businessProfiles.userId
        },
        claimedBy: {
          id: users.id,
          username: users.username,
          role: users.role
        }
      }).from(tickets)
        .leftJoin(users, eq(tickets.customerId, users.id), 'customer')
        .leftJoin(businessProfiles, eq(tickets.businessProfileId, businessProfiles.id), 'business')
        .leftJoin(users, eq(tickets.claimedById, users.id), 'claimedBy')
        .orderBy(tickets.createdAt, 'desc');


      const ticketsResult = businessProfileId ? await ticketsQuery.where(eq(tickets.businessProfileId, businessProfileId)) : await ticketsQuery;
      res.json(ticketsResult);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });


  // Update ticket
  app.patch("/api/tickets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const [ticket] = await db
        .update(tickets)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(tickets.id, id))
        .returning();

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      res.json(ticket);
    } catch (error) {
      console.error('Error updating ticket:', error);
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });

  return createServer(app);
}