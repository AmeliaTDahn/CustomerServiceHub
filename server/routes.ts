import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { supabase } from "@db/index";

// Extend Express Request type to include user
declare module 'express' {
  interface Request {
    user?: {
      id: number;
      username: string;
      role: 'business' | 'customer' | 'employee';
    };
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Get business profile
  app.get("/api/business-profile", async (req: Request, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can access this endpoint" });
      }

      const { data: profile, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', req.user.id)
        .single();

      if (error) {
        console.error('Error fetching business profile:', error);
        return res.status(404).json({ error: "Business profile not found" });
      }

      res.json(profile);
    } catch (error) {
      console.error('Error fetching business profile:', error);
      res.status(500).json({ error: "Failed to fetch business profile" });
    }
  });

  // Create or update business profile
  app.post("/api/business-profile", async (req: Request, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can access this endpoint" });
      }

      const { businessName } = req.body;

      if (!businessName) {
        return res.status(400).json({ error: "Business name is required" });
      }

      // Check if profile already exists
      const { data: existingProfile } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', req.user.id)
        .single();

      let profile;
      if (existingProfile) {
        // Update existing profile
        const { data, error } = await supabase
          .from('business_profiles')
          .update({ business_name: businessName })
          .eq('id', existingProfile.id)
          .select()
          .single();

        if (error) throw error;
        profile = data;
      } else {
        // Create new profile
        const { data, error } = await supabase
          .from('business_profiles')
          .insert({
            user_id: req.user.id,
            business_name: businessName
          })
          .select()
          .single();

        if (error) throw error;
        profile = data;
      }

      res.json(profile);
    } catch (error) {
      console.error('Error creating/updating business profile:', error);
      res.status(500).json({ error: "Failed to create/update business profile" });
    }
  });

  // Employee invitation endpoint
  app.post("/api/businesses/employees/invite", async (req: Request, res) => {
    try {
      if (!req.user || req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can invite employees" });
      }

      const { employeeId } = req.body;

      if (!employeeId) {
        return res.status(400).json({ error: "Employee ID is required" });
      }

      // Check if employee exists and is actually an employee
      const { data: employee, error: employeeError } = await supabase
        .from('users')
        .select('*')
        .eq('id', employeeId)
        .single();

      if (employeeError || !employee) {
        return res.status(404).json({ error: "Employee not found" });
      }

      if (employee.role !== 'employee') {
        return res.status(400).json({ error: "Selected user is not an employee" });
      }

      // Get or create business profile
      let { data: businessProfile, error: profileError } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', req.user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching business profile:', profileError);
        return res.status(500).json({
          error: "Failed to fetch business profile",
          details: profileError.message
        });
      }

      if (!businessProfile) {
        // Create default business profile
        const { data: newProfile, error: createError } = await supabase
          .from('business_profiles')
          .insert({
            user_id: req.user.id,
            business_name: req.user.username
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating business profile:', createError);
          return res.status(500).json({
            error: "Failed to create business profile",
            details: createError.message
          });
        }

        businessProfile = newProfile;
      }

      // Employee check already done above

      // Check for existing connection
      const { data: existingConnection, error: connectionError } = await supabase
        .from('business_employees')
        .select('*')
        .eq('business_profile_id', businessProfile.id)
        .eq('employee_id', employeeId)
        .single();

      if (connectionError && connectionError.code !== 'PGRST116') {
        console.error('Error checking existing connection:', connectionError);
        return res.status(500).json({
          error: "Failed to check existing connection",
          details: connectionError.message
        });
      }

      if (existingConnection) {
        return res.status(400).json({ error: "Employee is already connected to this business" });
      }

      // Check for existing invitation
      const { data: existingInvitation } = await supabase
        .from('employee_invitations')
        .select('*')
        .eq('business_profile_id', businessProfile.id)
        .eq('employee_id', employeeId)
        .eq('status', 'pending')
        .single();

      if (existingInvitation) {
        return res.status(400).json({ error: "An invitation is already pending for this employee" });
      }

      try {
        const { data: invitation, error: invitationError } = await supabase
          .from('employee_invitations')
          .insert({
            business_profile_id: businessProfile.id,
            employee_id: employeeId,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (invitationError) {
          console.error('Error creating invitation:', invitationError);
          return res.status(500).json({
            error: "Failed to create invitation",
            details: invitationError.message || "Database error occurred"
          });
        }

        if (!invitation) {
          throw new Error("Failed to create invitation record");
        }

        res.json({
          message: "Invitation sent successfully",
          invitation
        });
      } catch (error) {
        console.error('Error inviting employee:', error);
        res.status(500).json({ error: "Failed to send invitation" });
      }
    } catch (error) {
      console.error('Error inviting employee:', error);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  });

  // Get all employees for a specific business
  app.get("/api/businesses/employees", async (req: Request, res) => {
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
  app.get("/api/employees", async (req: Request, res) => {
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


  // Get all available businesses for ticket creation
  app.get("/api/businesses", async (req: Request, res) => {
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

  // Add new endpoint for getting employee's active business connections
  app.get("/api/employees/active-businesses", async (req: Request, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can access their businesses" });
      }

      // Get all active business connections for this employee
      const { data: connections, error } = await supabase
        .from('business_employees')
        .select(`
          business:business_profiles(
            id,
            business_name
          ),
          connection:business_employees!inner(
            is_active,
            created_at
          )
        `)
        .eq('employee_id', req.user.id)
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching active businesses:', error);
        return res.status(500).json({ error: "Failed to fetch active businesses" });
      }

      res.json(connections);
    } catch (error) {
      console.error('Error fetching active businesses:', error);
      res.status(500).json({ error: "Failed to fetch active businesses" });
    }
  });

  // Update tickets endpoint to filter by business
  app.get("/api/tickets", async (req: Request, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const businessProfileId = req.query.businessProfileId;

      let query = supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (req.user.role === 'employee' && businessProfileId) {
        query = query.eq('business_profile_id', businessProfileId);
      } else if (req.user.role === 'business') {
        query = query.eq('business_profile_id', businessProfileId);
      } else if (req.user.role === 'customer') {
        query = query.eq('customer_id', req.user.id);
      }

      const { data: tickets, error } = await query;

      if (error) {
        console.error('Error fetching tickets:', error);
        return res.status(500).json({ error: "Failed to fetch tickets" });
      }

      res.json(tickets);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  // Get pending invitations for employee
  app.get("/api/employees/invitations", async (req: Request, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can view invitations" });
      }

      const { data: invitations, error } = await supabase
        .from('employee_invitations')
        .select(`
          id,
          business_profile_id,
          status,
          created_at,
          businessProfile:business_profiles(business_name)
        `)
        .eq('employee_id', req.user.id)
        .eq('status', 'pending');

      if (error) {
        console.error('Error fetching invitations:', error);
        return res.status(500).json({ error: "Failed to fetch invitations" });
      }

      res.json(invitations);
    } catch (error) {
      console.error('Error fetching invitations:', error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });

  // Handle invitation response
  app.post("/api/invitations/:id/respond", async (req: Request, res) => {
    try {
      if (!req.user || req.user.role !== "employee") {
        return res.status(403).json({ error: "Only employees can respond to invitations" });
      }

      const invitationId = parseInt(req.params.id);
      const { accept } = req.body;

      if (typeof accept !== 'boolean') {
        return res.status(400).json({ error: "Accept parameter must be a boolean" });
      }

      // Get the invitation details first
      const { data: invitation, error: invitationError } = await supabase
        .from('employee_invitations')
        .select('*')
        .eq('id', invitationId)
        .eq('employee_id', req.user.id)
        .single();

      if (invitationError || !invitation) {
        console.error('Error fetching invitation:', invitationError);
        return res.status(404).json({ error: "Invitation not found" });
      }

      // Start a transaction
      const { error: updateError } = await supabase
        .rpc('handle_invitation_response', {
          p_invitation_id: invitationId,
          p_employee_id: req.user.id,
          p_business_profile_id: invitation.business_profile_id,
          p_accept: accept
        });

      if (updateError) {
        console.error('Error handling invitation:', updateError);
        return res.status(500).json({
          error: "Failed to handle invitation response",
          details: updateError.message
        });
      }

      res.json({ message: `Invitation ${accept ? 'accepted' : 'declined'} successfully` });
    } catch (error) {
      console.error('Error handling invitation response:', error);
      res.status(500).json({ error: "Failed to handle invitation response" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}