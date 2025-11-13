import { ScrapeConfig } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ConfigPanelProps {
  config: Omit<ScrapeConfig, "url">;
  onChange: (config: Omit<ScrapeConfig, "url">) => void;
}

export function ConfigPanel({ config, onChange }: ConfigPanelProps) {
  const updateConfig = (updates: Partial<Omit<ScrapeConfig, "url">>) => {
    onChange({ ...config, ...updates });
  };

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <div className="space-y-2">
        <Label htmlFor="maxImages" className="text-sm font-medium">
          Maximum Images
        </Label>
        <Input
          id="maxImages"
          type="number"
          min="0"
          max="500"
          value={config.maxImages}
          onChange={(e) => updateConfig({ maxImages: parseInt(e.target.value) || 0 })}
          className="h-10"
          data-testid="input-max-images"
        />
        <p className="text-xs text-muted-foreground">Limit the number of images to scrape (0 for unlimited, max 500)</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sortBy" className="text-sm font-medium">
          Sort By
        </Label>
        <Select
          value={config.sortBy}
          onValueChange={(value: any) => updateConfig({ sortBy: value })}
        >
          <SelectTrigger className="h-10" data-testid="select-sort-by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Relevance</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="extractDetails" className="text-sm font-medium">
            Extract Details
          </Label>
          <p className="text-xs text-muted-foreground">
            Fetch photographer, location, and date information
          </p>
        </div>
        <Switch
          id="extractDetails"
          checked={config.extractDetails}
          onCheckedChange={(checked) => updateConfig({ extractDetails: checked })}
          data-testid="switch-extract-details"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="autoScroll" className="text-sm font-medium">
            Auto Scroll
          </Label>
          <p className="text-xs text-muted-foreground">
            Automatically handle infinite scrolling
          </p>
        </div>
        <Switch
          id="autoScroll"
          checked={config.autoScroll}
          onCheckedChange={(checked) => updateConfig({ autoScroll: checked })}
          data-testid="switch-auto-scroll"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="scrollDelay" className="text-sm font-medium">
          Scroll Delay (ms)
        </Label>
        <Input
          id="scrollDelay"
          type="number"
          min="500"
          max="5000"
          step="100"
          value={config.scrollDelay}
          onChange={(e) => updateConfig({ scrollDelay: parseInt(e.target.value) || 500 })}
          className="h-10"
          data-testid="input-scroll-delay"
        />
        <p className="text-xs text-muted-foreground">
          Delay between scroll actions (500-5000ms)
        </p>
      </div>
    </div>
  );
}
