import { useState } from "react";
import { ScrapeJob, ExportFormat } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportModalProps {
  job: ScrapeJob;
  onClose: () => void;
}

export function ExportModal({ job, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/export/${job.id}?format=${format}`);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smartframe-export-${job.id}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: `Your data has been downloaded as ${format.toUpperCase()}.`,
      });
      onClose();
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export the data. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="modal-export">
        <DialogHeader>
          <DialogTitle>Export Scraped Data</DialogTitle>
          <DialogDescription>
            Choose your preferred format to download the scraped image data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={format} onValueChange={(value) => setFormat(value as ExportFormat)}>
            <div className="flex items-center space-x-3 p-4 rounded-lg border border-border hover-elevate">
              <RadioGroupItem value="json" id="json" data-testid="radio-format-json" />
              <Label htmlFor="json" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-3">
                  <FileJson className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">JSON</p>
                    <p className="text-xs text-muted-foreground">
                      Structured data with all metadata
                    </p>
                  </div>
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-3 p-4 rounded-lg border border-border hover-elevate">
              <RadioGroupItem value="csv" id="csv" data-testid="radio-format-csv" />
              <Label htmlFor="csv" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-success" />
                  <div>
                    <p className="font-medium">CSV</p>
                    <p className="text-xs text-muted-foreground">
                      Spreadsheet-compatible format
                    </p>
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>

          <div className="bg-muted rounded-lg p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Preview
            </p>
            <div className="bg-background rounded-md p-3 font-mono text-xs overflow-x-auto">
              {format === "json" ? (
                <pre>{`{
  "jobId": "${job.id}",
  "totalImages": ${job.images?.length || 0},
  "images": [...]
}`}</pre>
              ) : (
                <pre>{`Image ID,Photographer,Size,Location,Date
"${job.images?.[0]?.smartframeId || "..."}","${job.images?.[0]?.photographer || "..."}","${job.images?.[0]?.imageSize || "..."}","...","..."`}</pre>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-export">
            Cancel
          </Button>
          <Button onClick={handleExport} className="gap-2" data-testid="button-download">
            <Download className="w-4 h-4" />
            Download {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
