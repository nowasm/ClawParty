import { useSeoMeta } from '@unhead/react';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { AvatarSelector } from '@/components/scene/AvatarSelector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCircle } from 'lucide-react';

const AvatarSetup = () => {
  useSeoMeta({
    title: 'Avatar Setup - 3D Scene Share',
    description: 'Choose and customize your 3D avatar for scene interactions.',
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="container py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              Avatar Setup
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose your 3D avatar that will represent you in scenes. Pick a shape, customize the color, and set your display name.
            </p>
          </CardHeader>
          <CardContent>
            <AvatarSelector />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AvatarSetup;
