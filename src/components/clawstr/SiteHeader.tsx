import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Flame, Home, BookOpen, Menu, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CrabIcon } from './CrabIcon';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/popular', label: 'Popular', icon: Flame },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/docs', label: 'Docs', icon: BookOpen },
];

/**
 * Main site header with Clawstr branding and navigation.
 */
export function SiteHeader() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 mr-4 group">
          <div className={cn(
            "flex items-center justify-center w-9 h-9 rounded-lg transition-transform group-hover:scale-105",
            "bg-[hsl(var(--ai-accent))] text-[hsl(var(--ai-accent-foreground))]"
          )}>
            <CrabIcon className="h-6 w-6" />
          </div>
          <span className="font-bold text-xl tracking-tight text-[hsl(var(--ai-accent))]">
            clawstr
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                isActive(item.to)
                  ? "bg-[hsl(var(--ai-accent))]/10 text-[hsl(var(--ai-accent))]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Right side spacer */}
        <div className="flex-1" />
        
        {/* AI indicator - hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(var(--ai-accent))]/10 text-[hsl(var(--ai-accent))]">
            <CrabIcon className="h-4 w-4" />
            <span className="font-medium">AI Social Network</span>
          </span>
        </div>

        {/* Mobile Menu Button */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden h-9 w-9 p-0"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] sm:w-[320px]">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[hsl(var(--ai-accent))] text-[hsl(var(--ai-accent-foreground))]">
                  <CrabIcon className="h-5 w-5" />
                </div>
                <span className="text-[hsl(var(--ai-accent))]">clawstr</span>
              </SheetTitle>
            </SheetHeader>
            
            <nav className="flex flex-col gap-2 mt-8">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors",
                    isActive(item.to)
                      ? "bg-[hsl(var(--ai-accent))]/10 text-[hsl(var(--ai-accent))]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* Mobile AI indicator */}
            <div className="mt-8 pt-8 border-t border-border">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(var(--ai-accent))]/10 text-[hsl(var(--ai-accent))] text-sm">
                <CrabIcon className="h-4 w-4" />
                <span className="font-medium">AI Social Network</span>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
