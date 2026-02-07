import { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { AvatarModel } from './AvatarModel';
import { AVATAR_PRESETS, getAvatarPreset, type AvatarConfig, type AvatarPreset } from '@/lib/scene';
import { useAvatar, usePublishAvatar } from '@/hooks/useAvatar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';

/** Mini 3D preview for an avatar preset */
function AvatarPreview({ preset, color }: { preset: AvatarPreset; color: string }) {
  return (
    <Canvas camera={{ position: [0, 1.2, 3], fov: 40 }} gl={{ antialias: true }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 3]} intensity={0.8} />
      <AvatarModel preset={preset} color={color} />
      <Environment preset="city" />
    </Canvas>
  );
}

export function AvatarSelector() {
  const { user } = useCurrentUser();
  const { data: currentAvatar } = useAvatar(user?.pubkey);
  const { publishAvatar, isPending } = usePublishAvatar();
  const { toast } = useToast();

  const [selectedModel, setSelectedModel] = useState(currentAvatar?.model ?? AVATAR_PRESETS[0].id);
  const [customColor, setCustomColor] = useState(currentAvatar?.color ?? AVATAR_PRESETS[0].color);
  const [displayName, setDisplayName] = useState(currentAvatar?.displayName ?? '');

  // Update state when avatar data loads
  const selectedPreset = getAvatarPreset(selectedModel);

  const handleSave = async () => {
    if (!user) return;

    const config: AvatarConfig = {
      model: selectedModel,
      color: customColor,
      displayName: displayName.trim(),
    };

    try {
      await publishAvatar(config);
      toast({
        title: 'Avatar updated',
        description: 'Your 3D avatar has been saved!',
      });
    } catch (error) {
      console.error('Failed to save avatar:', error);
      toast({
        title: 'Save failed',
        description: 'Could not save your avatar. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Log in to customize your avatar</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Large preview */}
      <Card className="overflow-hidden">
        <div className="h-[300px] bg-gradient-to-b from-muted/50 to-muted">
          <Suspense fallback={
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }>
            <AvatarPreview preset={selectedPreset} color={customColor} />
          </Suspense>
        </div>
      </Card>

      {/* Display name */}
      <div className="space-y-2">
        <Label htmlFor="displayName">Display Name</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter your display name"
          maxLength={30}
        />
      </div>

      {/* Preset selection */}
      <div className="space-y-2">
        <Label>Choose Your Avatar</Label>
        <div className="grid grid-cols-4 gap-3">
          {AVATAR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                setSelectedModel(preset.id);
                setCustomColor(preset.color);
              }}
              className={`relative aspect-square rounded-xl border-2 transition-all duration-200 overflow-hidden ${
                selectedModel === preset.id
                  ? 'border-primary shadow-lg shadow-primary/20 scale-105'
                  : 'border-border hover:border-primary/50 hover:shadow-md'
              }`}
            >
              <div className="h-full bg-gradient-to-b from-muted/30 to-muted">
                <Suspense fallback={
                  <div className="h-full flex items-center justify-center">
                    <div
                      className="h-8 w-8 rounded-full"
                      style={{ backgroundColor: preset.color }}
                    />
                  </div>
                }>
                  <AvatarPreview preset={preset} color={preset.color} />
                </Suspense>
              </div>
              {selectedModel === preset.id && (
                <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm px-1 py-0.5">
                <p className="text-[10px] text-white text-center truncate">{preset.name}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom color */}
      <div className="space-y-2">
        <Label htmlFor="color">Custom Color</Label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            id="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className="h-10 w-14 rounded-lg border border-border cursor-pointer"
          />
          <Input
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            placeholder="#3B82F6"
            className="flex-1 font-mono text-sm"
          />
        </div>
      </div>

      {/* Save button */}
      <Button onClick={handleSave} disabled={isPending} className="w-full">
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Saving...
          </>
        ) : (
          'Save Avatar'
        )}
      </Button>
    </div>
  );
}
