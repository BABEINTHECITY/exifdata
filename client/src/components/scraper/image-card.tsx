import { ScrapedImage } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImageCardProps {
  image: ScrapedImage;
}

export function ImageCard({ image }: ImageCardProps) {
  const { toast } = useToast();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(image.copyLink);
      toast({
        title: "Link Copied",
        description: "The image URL has been copied to your clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Could not copy the link to clipboard.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="overflow-hidden hover-elevate" data-testid={`card-image-${image.imageId}`}>
      <div className="aspect-square bg-muted flex items-center justify-center relative overflow-hidden">
        {image.thumbnailUrl ? (
          <img
            src={image.thumbnailUrl}
            alt={image.matchEvent || image.smartframeId}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon className="w-16 h-16 text-muted-foreground" />
        )}
      </div>
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Image ID
          </p>
          <p className="text-sm font-mono text-foreground truncate" title={image.smartframeId}>
            {image.smartframeId}
          </p>
        </div>

        {image.photographer && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Photographer
            </p>
            <p className="text-sm text-foreground truncate" title={image.photographer}>
              {image.photographer}
            </p>
          </div>
        )}

        {image.imageSize && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Dimensions
            </p>
            <p className="text-sm text-foreground">{image.imageSize}</p>
          </div>
        )}

        {(image.city || image.country) && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Location
            </p>
            <p className="text-sm text-foreground">
              {[image.city, image.country].filter(Boolean).join(", ")}
            </p>
          </div>
        )}

        {image.date && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Date
            </p>
            <p className="text-sm text-foreground">{image.date}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            onClick={handleCopyLink}
            data-testid={`button-copy-${image.imageId}`}
          >
            <Copy className="w-3 h-3" />
            Copy Link
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            data-testid={`button-view-${image.imageId}`}
          >
            <a href={image.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3 h-3" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
