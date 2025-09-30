import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

interface NetworkPathProps {
  forwardingChain?: Array<{
    user_id: string;
    user_name: string;
    user_handle: string;
  }>;
  degreeOfSeparation?: number | null;
  connectionPath?: string[];
}

export function NetworkPath({ 
  forwardingChain = [], 
  degreeOfSeparation,
  connectionPath = []
}: NetworkPathProps) {
  if (forwardingChain.length === 0 && !degreeOfSeparation && connectionPath.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Connection Path Display */}
      {connectionPath.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          <span className="font-medium">Connection:</span>
          {connectionPath.map((name, index) => (
            <div key={index} className="flex items-center">
              <span className="text-foreground">{name}</span>
              {index < connectionPath.length - 1 && (
                <ChevronRight className="h-3 w-3 mx-1" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Degree of Separation Badge */}
      {degreeOfSeparation !== null && degreeOfSeparation !== undefined && degreeOfSeparation > 0 && (
        <Badge variant="secondary" className="text-xs">
          {degreeOfSeparation === 1 ? "Direct Friend" : `${degreeOfSeparation}${degreeOfSeparation === 2 ? "nd" : degreeOfSeparation === 3 ? "rd" : "th"} Degree`}
        </Badge>
      )}

      {/* Forwarding Chain Display */}
      {forwardingChain.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          <span className="font-medium">Shared by:</span>
          {forwardingChain.map((user, index) => (
            <div key={user.user_id} className="flex items-center">
              <Link 
                to={`/profile/${user.user_handle}`}
                className="text-foreground hover:underline font-medium"
              >
                {user.user_name}
              </Link>
              {index < forwardingChain.length - 1 && (
                <ChevronRight className="h-3 w-3 mx-1" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}