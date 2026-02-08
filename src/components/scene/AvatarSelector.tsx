import { useState, useEffect, Suspense, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { Loader2, Save, RotateCcw, Palette, User, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AvatarModel } from './AvatarModel';
import {
  AVATAR_PRESETS,
  getAvatarPreset,
  type AvatarConfig,
  type AvatarPreset,
} from '@/lib/scene';
import { useAvatar, usePublishAvatar } from '@/hooks/useAvatar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';

// ======================================================================
// Curated outfit color palette
// ======================================================================
const COLOR_PALETTE = [
  '#EF4444', '#DC2626', '#B91C1C', '#991B1B', '#EC4899', '#DB2777',
  '#F97316', '#EA580C', '#EAB308', '#CA8A04', '#FBBF24', '#F59E0B',
  '#22C55E', '#16A34A', '#15803D', '#84CC16', '#65A30D', '#4D7C0F',
  '#3B82F6', '#2563EB', '#1D4ED8', '#06B6D4', '#0891B2', '#0E7490',
  '#A855F7', '#9333EA', '#7C3AED', '#8B5CF6', '#6D28D9', '#4F46E5',
  '#64748B', '#475569', '#334155', '#94A3B8', '#CBD5E1', '#1E293B',
];

// ======================================================================
// 3D Turntable Preview
// ======================================================================
function TurntablePreview({
  preset,
  color,
}: {
  preset: AvatarPreset;
  color: string;
}) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 8, 4]} intensity={0.9} castShadow />
      <directionalLight position={[-3, 4, -2]} intensity={0.3} color="#8888ff" />

      <group position={[0, -0.8, 0]}>
        <AvatarModel
          preset={preset}
          color={color}
          animate
        />

        {/* Pedestal */}
        <mesh position={[0, -0.02, 0]} receiveShadow>
          <cylinderGeometry args={[0.6, 0.7, 0.06, 32]} />
          <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.06, 0]} receiveShadow>
          <cylinderGeometry args={[0.7, 0.75, 0.04, 32]} />
          <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.5} />
        </mesh>
      </group>

      <ContactShadows
        position={[0, -0.82, 0]}
        opacity={0.5}
        scale={3}
        blur={2.5}
        far={2}
      />

      <Environment preset="city" />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.8}
        autoRotate
        autoRotateSpeed={1.5}
        target={[0, 0.2, 0]}
      />
    </>
  );
}

// ======================================================================
// Main Component
// ======================================================================
export function AvatarSelector() {
  const { user } = useCurrentUser();
  const { data: currentAvatar } = useAvatar(user?.pubkey);
  const { publishAvatar, isPending } = usePublishAvatar();
  const { toast } = useToast();

  const [selectedModel, setSelectedModel] = useState(AVATAR_PRESETS[0].id);
  const [customColor, setCustomColor] = useState(AVATAR_PRESETS[0].color);
  const [displayName, setDisplayName] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Sync initial state from loaded avatar data
  useEffect(() => {
    if (currentAvatar) {
      setSelectedModel(currentAvatar.model);
      setCustomColor(currentAvatar.color);
      setDisplayName(currentAvatar.displayName);
    }
  }, [currentAvatar]);

  const selectedPreset = getAvatarPreset(selectedModel);

  const handlePresetSelect = useCallback((preset: AvatarPreset) => {
    setSelectedModel(preset.id);
    setCustomColor(preset.color);
    setHasChanges(true);
  }, []);

  const handleColorSelect = useCallback((c: string) => {
    setCustomColor(c);
    setHasChanges(true);
  }, []);

  const handleReset = useCallback(() => {
    if (currentAvatar) {
      setSelectedModel(currentAvatar.model);
      setCustomColor(currentAvatar.color);
      setDisplayName(currentAvatar.displayName);
    } else {
      setSelectedModel(AVATAR_PRESETS[0].id);
      setCustomColor(AVATAR_PRESETS[0].color);
      setDisplayName('');
    }
    setHasChanges(false);
  }, [currentAvatar]);

  const handleSave = async () => {
    if (!user) return;

    const config: AvatarConfig = {
      model: selectedModel,
      color: customColor,
      hairStyle: 'none',
      hairColor: '#3d2914',
      displayName: displayName.trim(),
    };

    try {
      await publishAvatar(config);
      setHasChanges(false);
      toast({ title: 'Avatar saved!', description: 'Your new look is live.' });
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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <User className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground text-lg">Log in to customize your avatar</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6 min-h-[600px]">
      {/* ============================================ */}
      {/* LEFT — 3D Preview (Turntable)                */}
      {/* ============================================ */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 border border-white/5">
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Character name badge */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-lg px-3 py-1.5 border border-white/10">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-white text-sm font-medium">
            {displayName || selectedPreset.name}
          </span>
        </div>

        {/* Hint */}
        <div className="absolute bottom-4 left-0 right-0 z-10 text-center">
          <span className="text-white/30 text-xs">Drag to rotate</span>
        </div>

        {/* 3D Canvas */}
        <div className="h-[350px] lg:h-full lg:min-h-[600px]">
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white/30" />
              </div>
            }
          >
            <Canvas camera={{ position: [0, 0.8, 3], fov: 35 }} shadows>
              <TurntablePreview
                preset={selectedPreset}
                color={customColor}
              />
            </Canvas>
          </Suspense>
        </div>
      </div>

      {/* ============================================ */}
      {/* RIGHT — Customization Panel                   */}
      {/* ============================================ */}
      <ScrollArea className="lg:h-[600px]">
        <div className="flex flex-col gap-5 py-4 lg:py-0 pr-3">
          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-sm font-semibold flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Display Name
            </Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setHasChanges(true);
              }}
              placeholder="Enter your name…"
              maxLength={30}
              className="h-10"
            />
          </div>

          {/* Shell Preset */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Shell Style
            </Label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset)}
                  className={`group relative rounded-xl border-2 p-2.5 text-left transition-all duration-200 ${
                    selectedModel === preset.id
                      ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-[1.02]'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50 hover:shadow-md'
                  }`}
                >
                  <div
                    className="h-5 w-5 rounded-full mb-1.5 ring-2 ring-white/20 shadow-inner"
                    style={{ backgroundColor: preset.color }}
                  />
                  <div className="text-xs font-medium truncate">{preset.name}</div>
                  {selectedModel === preset.id && (
                    <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center shadow">
                      <svg className="h-2.5 w-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Shell Color */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" />
              Shell Color
            </Label>
            <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => handleColorSelect(c)}
                  className={`aspect-square rounded-lg transition-all duration-150 ring-offset-background ${
                    customColor.toLowerCase() === c.toLowerCase()
                      ? 'ring-2 ring-primary ring-offset-2 scale-110 shadow-lg'
                      : 'hover:scale-110 hover:shadow-md hover:ring-1 hover:ring-white/30'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customColor}
                onChange={(e) => handleColorSelect(e.target.value)}
                className="h-8 w-10 rounded-lg border border-border cursor-pointer bg-transparent"
              />
              <Input
                value={customColor}
                onChange={(e) => handleColorSelect(e.target.value)}
                placeholder="#3B82F6"
                className="flex-1 font-mono text-sm h-8"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges || isPending}
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 gap-1.5"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Avatar
                </>
              )}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
