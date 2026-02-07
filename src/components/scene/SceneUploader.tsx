import { useState, useRef } from 'react';
import { Upload, FileBox, X, Image, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUploadFile } from '@/hooks/useUploadFile';
import { usePublishScene } from '@/hooks/usePublishScene';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';

interface SceneUploaderProps {
  /** Pre-fill with existing scene data for editing */
  initialData?: {
    dTag: string;
    title: string;
    summary: string;
    imageUrl: string;
    sceneUrl: string;
  };
  onSuccess?: () => void;
}

export function SceneUploader({ initialData, onSuccess }: SceneUploaderProps) {
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

  const isEditing = !!initialData;
  const isBusy = isUploading || isPublishing;

  const handleSceneUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
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
    if (!user || !sceneUrl || !title.trim()) return;

    try {
      const dTag = initialData?.dTag ?? `scene-${Date.now()}`;
      await publishScene({
        dTag,
        title: title.trim(),
        summary: summary.trim(),
        imageUrl,
        sceneUrl,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileBox className="h-5 w-5 text-primary" />
          {isEditing ? 'Update Your Scene' : 'Publish a New Scene'}
        </CardTitle>
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

          {/* Scene file upload */}
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
            disabled={!title.trim() || !sceneUrl || isBusy}
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
