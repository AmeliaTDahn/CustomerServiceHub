import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageSquarePlus } from "lucide-react";

interface QuickReplyTemplatesProps {
  onSelectTemplate: (template: string) => void;
}

// Common support responses
const templates = [
  {
    label: "Greeting",
    content: "Hello! How can I assist you today?",
  },
  {
    label: "Acknowledgment",
    content: "I understand your concern. Let me help you with that.",
  },
  {
    label: "Following Up",
    content: "I'm following up on your previous request. Has this issue been resolved?",
  },
  {
    label: "Technical Issue",
    content: "I apologize for the technical difficulty. Let's troubleshoot this together.",
  },
  {
    label: "Closing",
    content: "Is there anything else I can help you with?",
  },
  {
    label: "Escalation",
    content: "I'll need to escalate this to our specialized team for further assistance.",
  },
  {
    label: "Wait Time",
    content: "Thank you for your patience. I'll look into this and get back to you shortly.",
  }
];

export function QuickReplyTemplates({ onSelectTemplate }: QuickReplyTemplatesProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Quick Reply Templates"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {templates.map((template) => (
          <DropdownMenuItem
            key={template.label}
            onClick={() => onSelectTemplate(template.content)}
            className="flex flex-col items-start gap-1 cursor-pointer"
          >
            <span className="font-medium">{template.label}</span>
            <span className="text-xs text-muted-foreground truncate max-w-full">
              {template.content}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
