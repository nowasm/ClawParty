import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Box, Compass, MessageCircle, Sun, Moon, UserCircle, Settings, LogOut, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from '@/hooks/useTheme';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import LoginDialog from '@/components/auth/LoginDialog';
import SignupDialog from '@/components/auth/SignupDialog';

const NAV_ITEMS = [
  { href: '/', label: 'Explore', icon: Compass },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
];

export function SiteHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { currentUser, otherUsers, setLogin, removeLogin } = useLoggedInAccounts();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [signupDialogOpen, setSignupDialogOpen] = useState(false);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? genUserName(account.pubkey);
  };

  const handleLogin = () => {
    setLoginDialogOpen(false);
    setSignupDialogOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-14 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 mr-6 group">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-md rounded-full group-hover:bg-primary/30 transition-colors" />
            <Box className="h-6 w-6 text-primary relative" />
          </div>
          <span className="font-bold text-base hidden sm:inline-block">
            ClawParty
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} to={item.href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'gap-2 text-sm',
                    isActive && 'bg-primary/10 text-primary'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {/* User menu or Login buttons */}
          {currentUser ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-accent transition-all text-foreground" title={getDisplayName(currentUser)}>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={currentUser.metadata.picture} alt={getDisplayName(currentUser)} />
                    <AvatarFallback className="text-xs">
                      {getDisplayName(currentUser).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56 p-2">
                {/* User info (name once, then pubkey) */}
                <div className="px-2 py-2 mb-1 space-y-0.5">
                  <p className="text-sm font-semibold truncate">{getDisplayName(currentUser)}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {currentUser.pubkey.slice(0, 16)}...
                  </p>
                </div>
                <DropdownMenuSeparator />

                {/* Personal menu items */}
                <DropdownMenuItem
                  onClick={() => navigate('/avatar')}
                  className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
                >
                  <UserCircle className="h-4 w-4" />
                  <span>Avatar</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate('/settings')}
                  className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>

                {/* Account switching */}
                {otherUsers.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      Switch Account
                    </div>
                    {otherUsers.map((user) => (
                      <DropdownMenuItem
                        key={user.id}
                        onClick={() => setLogin(user.id)}
                        className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={user.metadata.picture} alt={getDisplayName(user)} />
                          <AvatarFallback className="text-[10px]">
                            {getDisplayName(user).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{getDisplayName(user)}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => removeLogin(currentUser.id)}
                  className="flex items-center gap-2 cursor-pointer p-2 rounded-md text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setLoginDialogOpen(true)}
                size="sm"
                className="rounded-full px-4"
              >
                Log in
              </Button>
              <Button
                onClick={() => setSignupDialogOpen(true)}
                variant="outline"
                size="sm"
                className="rounded-full px-4 hidden sm:inline-flex"
              >
                Sign up
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={handleLogin}
      />
      <SignupDialog
        isOpen={signupDialogOpen}
        onClose={() => setSignupDialogOpen(false)}
      />
    </header>
  );
}
