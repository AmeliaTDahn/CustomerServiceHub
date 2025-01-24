import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";

import { supabase } from "@db";
import type { Tables } from "@/lib/supabase";

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

  // Get all employees for a business
  app.get("/api/businesses/employees", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can view their employees" });
      }

      // Get the current business profile
      const { data: businessProfile, error: profileError } = await supabase
        .from('business_profiles')
        .select()
        .eq('user_id', req.user.id)
        .single();

      if (profileError || !businessProfile) {
        return res.status(404).json({ error: "Business profile not found" });
      }

      // Get only employees connected to this specific business
      const { data: employees, error: employeesError } = await supabase
        .from('business_employees')
        .select(`
          employee:users (
            id,
            username,
            role
          ),
          connection:business_employees (
            is_active,
            created_at
          )
        `)
        .eq('business_profile_id', businessProfile.id)
        .order('created_at');

      if (employeesError) {
        throw employeesError;
      }

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
      const { data: businessProfile, error: profileError } = await supabase
        .from('business_profiles')
        .select()
        .eq('user_id', req.user.id)
        .single();

      if (profileError || !businessProfile) {
        return res.status(404).json({ error: "Business profile not found" });
      }

      // Verify the employee exists and is of role 'employee'
      const { data: employee, error: employeeError } = await supabase
        .from('users')
        .select()
        .eq('id', employeeId)
        .eq('role', 'employee')
        .single();

      if (employeeError || !employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      // Check if employee is already connected to this business
      const { data: existingConnection, error: connectionError } = await supabase
        .from('business_employees')
        .select()
        .eq('business_profile_id', businessProfile.id)
        .eq('employee_id', employeeId)
        .single();

      if (existingConnection) {
        return res.status(400).json({ error: "Employee is already connected to this business" });
      }

      // Check if invitation already exists
      const { data: existingInvitation, error: invitationError } = await supabase
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
      const { data: invitation, error: createError } = await supabase
        .from('employee_invitations')
        .insert([{
          business_profile_id: businessProfile.id,
          employee_id: employeeId,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
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

  // Get invitations for an employee
  app.get("/api/employees/invitations", async (req, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can view their invitations" });
      }

      const { data: invitations, error } = await supabase
        .from('employee_invitations')
        .select(`
          *,
          business:business_profiles (
            id,
            business_name,
            user_id
          )
        `)
        .eq('employee_id', req.user.id)
        .eq('status', 'pending');

      if (error) {
        throw error;
      }

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

      const { data: connections, error } = await supabase
        .from('business_employees')
        .select(`
          business:business_profiles (
            id,
            business_name,
            user_id
          ),
          is_active
        `)
        .eq('employee_id', req.user.id);

      if (error) {
        throw error;
      }

      res.json(connections);
    } catch (error) {
      console.error('Error fetching business connections:', error);
      res.status(500).json({ error: "Failed to fetch business connections" });
    }
  });

  // Get all tickets
  app.get("/api/tickets", async (req, res) => {
    try {
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select(`
          *,
          customer:users!customer_id(*),
          business:business_profiles!business_profile_id(*),
          claimed_by:users!claimed_by_id(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json(tickets);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  // Create ticket
  app.post("/api/tickets", async (req, res) => {
    try {
      const { title, description, businessProfileId } = req.body;

      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { data: ticket, error } = await supabase
        .from('tickets')
        .insert([{
          title,
          description,
          status: 'open',
          customer_id: req.user.id,
          business_profile_id: businessProfileId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      res.json(ticket);
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  // Update ticket
  app.patch("/api/tickets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const { data: ticket, error } = await supabase
        .from('tickets')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      res.json(ticket);
    } catch (error) {
      console.error('Error updating ticket:', error);
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });

  return createServer(app);
}