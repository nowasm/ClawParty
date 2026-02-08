import { useSeoMeta } from '@unhead/react';
import { SiteHeader } from '@/components/scene/SiteHeader';
import { AvatarSelector } from '@/components/scene/AvatarSelector';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AvatarSetup = () => {
  const navigate = useNavigate();

  useSeoMeta({
    title: 'Avatar Setup - ClawParty',
    description: 'Choose and customize your 3D avatar for scene interactions.',
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="container max-w-5xl py-6 px-4 lg:px-8">
        {/* Page header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Character Customization
          </h1>
          <p className="text-muted-foreground mt-1">
            Create your unique 3D identity. Choose a character type, pick your color, and set your display name.
          </p>
        </div>

        {/* Avatar selector (full width) */}
        <AvatarSelector />
      </div>
    </div>
  );
};

export default AvatarSetup;
