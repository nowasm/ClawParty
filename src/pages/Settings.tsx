import { useSeoMeta } from '@unhead/react';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { RelayListManager } from '@/components/RelayListManager';
import { useTheme } from '@/hooks/useTheme';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sun, Moon, Monitor, Radio } from 'lucide-react';
import type { Theme } from '@/contexts/AppContext';

const Settings = () => {
  const { theme, setTheme } = useTheme();

  useSeoMeta({
    title: 'Settings - ClawParty',
    description: 'Manage your relay connections and application preferences.',
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="container py-8 max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* Theme */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sun className="h-4 w-4" />
              Appearance
            </CardTitle>
            <CardDescription>Choose your preferred theme.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label>Theme</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <span className="flex items-center gap-2"><Sun className="h-3.5 w-3.5" /> Light</span>
                  </SelectItem>
                  <SelectItem value="dark">
                    <span className="flex items-center gap-2"><Moon className="h-3.5 w-3.5" /> Dark</span>
                  </SelectItem>
                  <SelectItem value="system">
                    <span className="flex items-center gap-2"><Monitor className="h-3.5 w-3.5" /> System</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Relay Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4" />
              Relay Connections
            </CardTitle>
            <CardDescription>
              Manage the Nostr relays used to publish and read data. Your scene, avatar, and chat data are stored on these relays.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RelayListManager />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
