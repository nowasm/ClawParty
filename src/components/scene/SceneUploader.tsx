import { useState, useRef } from 'react';
import { Upload, FileBox, X, Image, Loader2, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useUploadFile } from '@/hooks/useUploadFile';
import { usePublishScene } from '@/hooks/usePublishScene';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { SCENE_PRESETS, type ScenePreset, isPresetScene, SCENE_D_TAG } from '@/lib/scene';
import { cn } from '@/lib/utils';

interface SceneUploaderProps {
  /** Pre-fill with existing scene data for editing */
  initialData?: {
    title: string;
    summary: string;
    imageUrl: string;
    sceneUrl: string;
  };
  onSuccess?: () => void;
}

type Step = 'choose' | 'details';

export function SceneUploader({ initialData, onSuccess }: SceneUploaderProps) {
  const isEditing = !!initialData;

  // Figure out if we already selected a preset
  const initialPreset = initialData
    ? SCENE_PRESETS.find((p) => p.sceneUrl === initialData.sceneUrl) ?? null
    : null;
  const initialIsCustom = initialData ? !isPresetScene(initialData.sceneUrl) && !!initialData.sceneUrl : false;

  const [step, setStep] = useState<Step>(isEditing ? 'details' : 'choose');
  const [selectedPreset, setSelectedPreset] = useState<ScenePreset | null>(initialPreset);
  const [isCustomUpload, setIsCustomUpload] = useState(initialIsCustom);

  const [title, setTitle] = useState(initialData?.title ?? '');
  const [summary, setSummary] = useState(initialData?.summary ?? '');
  const [sceneUrl, setSceneUrl] = useState(initialData?.sceneUrl ?? '');
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? '');
  const [sceneFileName, setSceneFileName] = useState('');
  const sceneInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { user } = useCurrentUser();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { publishScene, isPending: isPublishing } = usePublishScene();
  const { toast } = useToast();

  const isBusy = isUploading || isPublishing;

  // -------------------------------------------------------
  // Handlers
  // -------------------------------------------------------

  const handlePresetSelect = (preset: ScenePreset) => {
    setSelectedPreset(preset);
    setIsCustomUpload(false);
    setSceneUrl(preset.sceneUrl);
    // Pre-fill title & summary from preset if empty
    if (!title) setTitle(preset.title);
    if (!summary) setSummary(preset.summary);
    setStep('details');
  };

  const handleCustomSelect = () => {
    setSelectedPreset(null);
    setIsCustomUpload(true);
    setSceneUrl('');
    setStep('details');
  };

  const handleSceneUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['.glb', '.gltf'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(ext)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a .glb or .gltf file',
        variant: 'destructive',
      });
      return;
    }

    try {
      const tags = await uploadFile(file);
      const url = tags[0]?.[1];
      if (url) {
        setSceneUrl(url);
        setSceneFileName(file.name);
        toast({ title: 'Scene uploaded', description: file.name });
      }
    } catch (error) {
      console.error('Failed to upload scene:', error);
      toast({
        title: 'Upload failed',
        description: 'Could not upload scene file. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const tags = await uploadFile(file);
      const url = tags[0]?.[1];
      if (url) {
        setImageUrl(url);
        toast({ title: 'Thumbnail uploaded' });
      }
    } catch (error) {
      console.error('Failed to upload thumbnail:', error);
      toast({
        title: 'Upload failed',
        description: 'Could not upload thumbnail. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;

    // For presets, sceneUrl can be the preset marker (or empty for green-plains)
    const finalSceneUrl = isCustomUpload ? sceneUrl : (selectedPreset?.sceneUrl ?? '');

    try {
      await publishScene({
        dTag: SCENE_D_TAG,
        title: title.trim(),
        summary: summary.trim(),
        imageUrl,
        sceneUrl: finalSceneUrl,
      });
      toast({
        title: isEditing ? 'Scene updated' : 'Scene published',
        description: `"${title}" is now ${isEditing ? 'updated' : 'live'}!`,
      });
      onSuccess?.();
    } catch (error) {
      console.error('Failed to publish scene:', error);
      toast({
        title: 'Publish failed',
        description: 'Could not publish your scene. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const canSubmit = title.trim() && (isCustomUpload ? !!sceneUrl : true);

  // -------------------------------------------------------
  // Step 1: Choose scene template
  // -------------------------------------------------------

  if (step === 'choose') {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Choose Your World</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Pick a preset terrain to get started instantly, or upload your own 3D model.
          </p>
        </div>

        {/* Preset grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {SCENE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePresetSelect(preset)}
              className={cn(
                'group relative overflow-hidden rounded-2xl border-2 border-border p-6 text-left transition-all duration-300',
                'hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selectedPreset?.id === preset.id && 'border-primary ring-2 ring-primary/20',
              )}
            >
              <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60', preset.gradient)} />
              <div className="relative space-y-3">
                <span className="text-4xl block">{preset.icon}</span>
                <div>
                  <h3 className="font-semibold text-base">{preset.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {preset.summary}
                  </p>
                </div>
              </div>
              {selectedPreset?.id === preset.id && (
                <div className="absolute top-3 right-3">
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary-foreground" />
                  </div>
                </div>
              )}
            </button>
          ))}

          {/* Custom upload option */}
          <button
            onClick={handleCustomSelect}
            className={cn(
              'group relative overflow-hidden rounded-2xl border-2 border-dashed border-border p-6 text-left transition-all duration-300',
              'hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isCustomUpload && 'border-primary ring-2 ring-primary/20',
            )}
          >
            <div className="relative space-y-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <Upload className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Custom Upload</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  Upload your own glTF/glb 3D model file.
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // Step 2: Details form
  // -------------------------------------------------------

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          {!isEditing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep('choose')}
              className="text-muted-foreground -ml-2"
            >
              &larr; Back
            </Button>
          )}
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              {selectedPreset ? (
                <>
                  <span className="text-2xl">{selectedPreset.icon}</span>
                  {isEditing ? 'Update Your Scene' : 'Set Up Your Scene'}
                </>
              ) : (
                <>
                  <FileBox className="h-5 w-5 text-primary" />
                  {isEditing ? 'Update Your Scene' : 'Upload & Publish'}
                </>
              )}
            </CardTitle>
            {selectedPreset && !isEditing && (
              <CardDescription className="flex items-center gap-1 mt-1">
                <Sparkles className="h-3 w-3" />
                Using preset: {selectedPreset.title}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Scene Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Amazing 3D World"
              disabled={isBusy}
            />
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <Label htmlFor="summary">Description</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Describe your scene..."
              rows={3}
              disabled={isBusy}
            />
          </div>

          {/* Custom file upload — only shown if custom mode */}
          {isCustomUpload && (
            <div className="space-y-2">
              <Label>Scene File (.glb / .gltf) *</Label>
              <input
                ref={sceneInputRef}
                type="file"
                accept=".glb,.gltf"
                onChange={handleSceneUpload}
                className="hidden"
              />
              {sceneUrl ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/50">
                  <FileBox className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm truncate flex-1">
                    {sceneFileName || 'Scene file uploaded'}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      setSceneUrl('');
                      setSceneFileName('');
                    }}
                    disabled={isBusy}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-20 border-dashed"
                  onClick={() => sceneInputRef.current?.click()}
                  disabled={isBusy}
                >
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-5 w-5 mr-2" />
                  )}
                  {isUploading ? 'Uploading...' : 'Upload glTF/glb file'}
                </Button>
              )}
            </div>
          )}

          {/* Thumbnail upload */}
          <div className="space-y-2">
            <Label>Thumbnail Image (optional)</Label>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            {imageUrl ? (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border">
                <img src={imageUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2 h-6 w-6 p-0"
                  onClick={() => setImageUrl('')}
                  disabled={isBusy}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full h-16 border-dashed"
                onClick={() => imageInputRef.current?.click()}
                disabled={isBusy}
              >
                <Image className="h-4 w-4 mr-2" />
                Upload thumbnail
              </Button>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full"
            disabled={!canSubmit || isBusy}
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {isEditing ? 'Updating...' : 'Publishing...'}
              </>
            ) : (
              isEditing ? 'Update Scene' : 'Publish Scene'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
