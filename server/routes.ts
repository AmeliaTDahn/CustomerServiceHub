import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { supabase } from "@db/index";

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
      const { data: businessProfile } = await supabase
        .from('business_profiles')
        .select()
        .eq('user_id', req.user.id)
        .single();

      if (!businessProfile) {
        return res.status(404).json({ error: "Business profile not found" });
      }

      // Get only employees connected to this specific business
      const { data: employees } = await supabase
        .from('business_employees')
        .select('employee:users(*), is_active, created_at')
        .eq('business_profile_id', businessProfile.id);

      res.json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // Get all available employees that can be invited
  app.get("/api/employees", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can search employees" });
      }

      // Get all users with role 'employee'
      const { data: employees } = await supabase
        .from('users')
        .select('id, username')
        .eq('role', 'employee');

      if (!employees) {
        return res.json([]);
      }

      res.json(employees);
    } catch (error) {
      console.error('Error fetching available employees:', error);
      res.status(500).json({ error: "Failed to fetch available employees" });
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
      const { data: businessProfile } = await supabase
        .from('business_profiles')
        .select()
        .eq('user_id', req.user.id)
        .single();

      if (!businessProfile) {
        return res.status(404).json({ error: "Business profile not found" });
      }

      // Verify the employee exists and is of role 'employee'
      const { data: employee } = await supabase
        .from('users')
        .select()
        .eq('id', employeeId)
        .eq('role', 'employee')
        .single();

      if (!employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      // Check if employee is already connected to this business
      const { data: existingConnection } = await supabase
        .from('business_employees')
        .select()
        .eq('business_profile_id', businessProfile.id)
        .eq('employee_id', employeeId)
        .single();

      if (existingConnection) {
        return res.status(400).json({ error: "Employee is already connected to this business" });
      }

      // Check if invitation already exists
      const { data: existingInvitation } = await supabase
        .from('employee_invitations')
        .select()
        .eq('business_profile_id', businessProfile.id)
        .eq('employee_id', employeeId)
        .eq('status', 'pending')
        .single();

      if (existingInvitation) {
        return res.status(400).json({ error: "Invitation already sent" });
      }

      // Create invitation
      const { data: invitation, error } = await supabase
        .from('employee_invitations')
        .insert({
          business_profile_id: businessProfile.id,
          employee_id: employeeId,
          status: 'pending',
        })
        .select();

      if (error) {
        console.error('Error creating invitation:', error);
        return res.status(500).json({ error: "Failed to create invitation" });
      }

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

      const { data: businesses } = await supabase
        .from('business_profiles')
        .select('id, business_name, user_id');

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

      const { data: ticket } = await supabase
        .from('tickets')
        .insert({
          title,
          description,
          status: 'open',
          customer_id: req.user.id,
          business_profile_id: businessProfileId,
          category: 'general_inquiry',
          priority: 'medium',
        })
        .select();

      res.json(ticket);
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  return createServer(app);
}