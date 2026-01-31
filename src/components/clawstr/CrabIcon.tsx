import { cn } from '@/lib/utils';

interface CrabIconProps {
  className?: string;
}

/**
 * Crab mascot icon for Clawstr.
 */
export function CrabIcon({ className }: CrabIconProps) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.5"
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={cn("h-6 w-6", className)}
    >
      {/* Body (shell) */}
      <ellipse cx="12" cy="13" rx="7" ry="5" />
      
      {/* Eyes */}
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <circle cx="15" cy="10" r="1.5" fill="currentColor" />
      
      {/* Eye stalks */}
      <path d="M9 10 L8 7" />
      <path d="M15 10 L16 7" />
      
      {/* Left claw */}
      <path d="M5 13 L2 10 L4 8" />
      <path d="M2 10 L4 11" />
      
      {/* Right claw */}
      <path d="M19 13 L22 10 L20 8" />
      <path d="M22 10 L20 11" />
      
      {/* Legs - left side */}
      <path d="M6 15 L3 17" />
      <path d="M6 16 L4 19" />
      <path d="M7 17 L5 20" />
      
      {/* Legs - right side */}
      <path d="M18 15 L21 17" />
      <path d="M18 16 L20 19" />
      <path d="M17 17 L19 20" />
    </svg>
  );
}

/**
 * Filled crab icon variant.
 */
export function CrabIconFilled({ className }: CrabIconProps) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="currentColor"
      className={cn("h-6 w-6", className)}
    >
      {/* Body */}
      <ellipse cx="12" cy="13" rx="7" ry="5" />
      
      {/* Eye stalks with eyes */}
      <circle cx="8" cy="7" r="1.5" />
      <circle cx="16" cy="7" r="1.5" />
      <rect x="7.5" y="7" width="1" height="3" rx="0.5" />
      <rect x="15.5" y="7" width="1" height="3" rx="0.5" />
      
      {/* Claws */}
      <path d="M5 13 Q2 11 2 10 Q2 8 4 8 Q3 9 4 10 Q3 11 5 13" />
      <path d="M19 13 Q22 11 22 10 Q22 8 20 8 Q21 9 20 10 Q21 11 19 13" />
      
      {/* Legs */}
      <rect x="3" y="16" width="4" height="1.5" rx="0.75" transform="rotate(-30 5 17)" />
      <rect x="3" y="18" width="4" height="1.5" rx="0.75" transform="rotate(-45 5 19)" />
      <rect x="4" y="19" width="4" height="1.5" rx="0.75" transform="rotate(-60 6 20)" />
      
      <rect x="17" y="16" width="4" height="1.5" rx="0.75" transform="rotate(30 19 17)" />
      <rect x="17" y="18" width="4" height="1.5" rx="0.75" transform="rotate(45 19 19)" />
      <rect x="16" y="19" width="4" height="1.5" rx="0.75" transform="rotate(60 18 20)" />
    </svg>
  );
}
