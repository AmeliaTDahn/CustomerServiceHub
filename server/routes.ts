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

      // Get only employees connected to this specific business with their connection status
      const { data: employees, error } = await supabase
        .from('business_employees')
        .select(`
          employee_id,
          is_active,
          created_at,
          employee:users!employee_id(
            id,
            username,
            role
          )
        `)
        .eq('business_profile_id', businessProfile.id);

      if (error) {
        console.error('Error fetching employees:', error);
        return res.status(500).json({ error: "Failed to fetch employees" });
      }

      // Transform the data to match the expected structure
      const transformedEmployees = employees?.map(emp => ({
        employee: emp.employee,
        connection: {
          isActive: emp.is_active,
          createdAt: emp.created_at
        }
      })) || [];

      res.json(transformedEmployees);
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
          business_profile:business_profiles(
            id,
            business_name
          ),
          is_active,
          created_at
        `)
        .eq('employee_id', req.user.id)
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching active businesses:', error);
        return res.status(500).json({ error: "Failed to fetch active businesses" });
      }

      // Transform the data to match the expected structure
      const transformedConnections = connections?.map(conn => ({
        business: conn.business_profile,
        connection: {
          isActive: conn.is_active,
          createdAt: conn.created_at
        }
      })) || [];

      res.json(transformedConnections);
    } catch (error) {
      console.error('Error fetching active businesses:', error);
      res.status(500).json({ error: "Failed to fetch active businesses" });
    }
  });

  // Get tickets with proper filtering based on user role
  app.get("/api/tickets", async (req: Request, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const businessProfileId = req.query.businessProfileId;

      let query = supabase
        .from('tickets')
        .select(`
          *,
          customer:users!customer_id(
            id,
            username
          ),
          business:business_profiles!business_profile_id(
            id,
            business_name,
            user_id
          )
        `)
        .order('created_at', { ascending: false });

      // Apply filters based on user role
      if (req.user.role === 'employee') {
        // For employees, first get their active business connections
        const { data: activeConnections } = await supabase
          .from('business_employees')
          .select('business_profile_id')
          .eq('employee_id', req.user.id)
          .eq('is_active', true);

        if (!activeConnections?.length) {
          return res.json([]); // No active business connections
        }

        const businessIds = activeConnections.map(conn => conn.business_profile_id);

        if (businessProfileId) {
          // If specific business is selected, check if employee has access
          if (!businessIds.includes(Number(businessProfileId))) {
            return res.status(403).json({ error: "No access to this business" });
          }
          query = query.eq('business_profile_id', businessProfileId);
        } else {
          // Show tickets from all connected businesses
          query = query.in('business_profile_id', businessIds);
        }
      } else if (req.user.role === 'business') {
        // For business users, show only their tickets
        const { data: businessProfile } = await supabase
          .from('business_profiles')
          .select('id')
          .eq('user_id', req.user.id)
          .single();

        if (!businessProfile) {
          return res.status(404).json({ error: "Business profile not found" });
        }

        query = query.eq('business_profile_id', businessProfile.id);
      } else if (req.user.role === 'customer') {
        // For customers, show only their tickets
        query = query.eq('customer_id', req.user.id);
      }

      const { data: tickets, error } = await query;

      if (error) {
        console.error('Error fetching tickets:', error);
        return res.status(500).json({ error: "Failed to fetch tickets" });
      }

      // Transform the data to include only necessary information
      const transformedTickets = tickets?.map(ticket => ({
        ...ticket,
        customer: ticket.customer,
        business: ticket.business,
        hasBusinessResponse: false, // You can implement this based on your needs
        hasFeedback: false, // You can implement this based on your needs
        unreadCount: 0, // You can implement this based on your needs
      })) || [];

      res.json(transformedTickets);
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

  // Create ticket with business selection
  app.post("/api/tickets", async (req: Request, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { title, description, businessProfileId, category } = req.body;

      if (!businessProfileId) {
        return res.status(400).json({ error: "Business profile ID is required" });
      }

      if (!title || !description) {
        return res.status(400).json({ error: "Title and description are required" });
      }

      // Create the ticket
      const { data: ticket, error } = await supabase
        .from('tickets')
        .insert({
          title,
          description,
          business_profile_id: businessProfileId,
          customer_id: req.user.id,
          category: category || 'general_inquiry',
          status: 'open',
          priority: 'medium',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating ticket:', error);
        return res.status(500).json({ error: "Failed to create ticket" });
      }

      res.json(ticket);
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  // Add notes endpoints after the tickets endpoints
  app.get("/api/tickets/:id/notes", async (req: Request, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const ticketId = parseInt(req.params.id);

      // Get the ticket first to check permissions
      const { data: ticket } = await supabase
        .from('tickets')
        .select(`
          *,
          business:business_profiles!business_profile_id(
            id,
            user_id
          )
        `)
        .eq('id', ticketId)
        .single();

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Check if user has access to the ticket
      if (req.user.role === 'business' && ticket.business.user_id !== req.user.id) {
        return res.status(403).json({ error: "No access to this ticket" });
      }

      if (req.user.role === 'employee') {
        const { data: hasAccess } = await supabase
          .from('business_employees')
          .select()
          .eq('employee_id', req.user.id)
          .eq('business_profile_id', ticket.business_profile_id)
          .eq('is_active', true)
          .single();

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      // Get notes with author information
      const { data: notes, error } = await supabase
        .from('ticket_notes')
        .select(`
          *,
          author:users(
            id,
            username,
            role
          )
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching notes:', error);
        return res.status(500).json({ error: "Failed to fetch notes" });
      }

      res.json(notes);
    } catch (error) {
      console.error('Error fetching notes:', error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.post("/api/tickets/:id/notes", async (req: Request, res) => {
    try {
      if (!req.user || !['business', 'employee'].includes(req.user.role)) {
        return res.status(403).json({ error: "Only business and employees can add notes" });
      }

      const ticketId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content?.trim()) {
        return res.status(400).json({ error: "Note content is required" });
      }

      // Get the ticket first to check permissions
      const { data: ticket } = await supabase
        .from('tickets')
        .select(`
          *,
          business:business_profiles!business_profile_id(
            id,
            user_id
          )
        `)
        .eq('id', ticketId)
        .single();

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Check if user has access to the ticket
      if (req.user.role === 'business' && ticket.business.user_id !== req.user.id) {
        return res.status(403).json({ error: "No access to this ticket" });
      }

      if (req.user.role === 'employee') {
        const { data: hasAccess } = await supabase
          .from('business_employees')
          .select()
          .eq('employee_id', req.user.id)
          .eq('business_profile_id', ticket.business_profile_id)
          .eq('is_active', true)
          .single();

        if (!hasAccess) {
          return res.status(403).json({ error: "No access to this ticket" });
        }
      }

      // Add the note
      const { data: note, error } = await supabase
        .from('ticket_notes')
        .insert({
          ticket_id: ticketId,
          author_id: req.user.id,
          content: content.trim(),
          created_at: new Date().toISOString()
        })
        .select(`
          *,
          author:users(
            id,
            username,
            role
          )
        `)
        .single();

      if (error) {
        console.error('Error creating note:', error);
        return res.status(500).json({ error: "Failed to create note" });
      }

      res.json(note);
    } catch (error) {
      console.error('Error creating note:', error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Claim ticket endpoint
  app.post("/api/tickets/:id/claim", async (req: Request, res) => {
    try {
      if (!req.user || req.user.role !== 'employee') {
        return res.status(403).json({ error: "Only employees can claim tickets" });
      }

      const ticketId = parseInt(req.params.id);

      // Get the ticket first to check permissions
      const { data: ticket } = await supabase
        .from('tickets')
        .select(`
          *,
          business:business_profiles!business_profile_id(
            id,
            user_id
          )
        `)
        .eq('id', ticketId)
        .single();

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Check if employee has access to this business's tickets
      const { data: hasAccess } = await supabase
        .from('business_employees')
        .select()
        .eq('employee_id', req.user.id)
        .eq('business_profile_id', ticket.business_profile_id)
        .eq('is_active', true)
        .single();

      if (!hasAccess) {
        return res.status(403).json({ error: "No access to this business's tickets" });
      }

      // Check if ticket is already claimed
      if (ticket.claimed_by_id) {
        return res.status(400).json({ error: "Ticket is already claimed" });
      }

      // Update the ticket with claim information
      const { data: updatedTicket, error } = await supabase
        .from('tickets')
        .update({
          claimed_by_id: req.user.id,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', ticketId)
        .select()
        .single();

      if (error) {
        console.error('Error claiming ticket:', error);
        return res.status(500).json({ error: "Failed to claim ticket" });
      }

      res.json(updatedTicket);
    } catch (error) {
      console.error('Error claiming ticket:', error);
      res.status(500).json({ error: "Failed to claim ticket" });
    }
  });

  // Unclaim ticket endpoint
  app.post("/api/tickets/:id/unclaim", async (req: Request, res) => {
    try {
      if (!req.user || req.user.role !== 'employee') {
        return res.status(403).json({ error: "Only employees can unclaim tickets" });
      }

      const ticketId = parseInt(req.params.id);

      // Get the ticket first to check permissions
      const { data: ticket } = await supabase
        .from('tickets')
        .select(`
          *,
          business:business_profiles!business_profile_id(
            id,
            user_id
          )
        `)
        .eq('id', ticketId)
        .single();

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Check if the ticket is claimed by the requesting employee
      if (ticket.claimed_by_id !== req.user.id) {
        return res.status(403).json({ error: "You can only unclaim tickets that you have claimed" });
      }

      // Update the ticket to remove claim information
      const { data: updatedTicket, error } = await supabase
        .from('tickets')
        .update({
          claimed_by_id: null,
          claimed_at: null,
        })
        .eq('id', ticketId)
        .select()
        .single();

      if (error) {
        console.error('Error unclaiming ticket:', error);
        return res.status(500).json({ error: "Failed to unclaim ticket" });
      }

      res.json(updatedTicket);
    } catch (error) {
      console.error('Error unclaiming ticket:', error);
      res.status(500).json({ error: "Failed to unclaim ticket" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}