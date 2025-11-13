import { useState } from "react";
import { ScrapeJob } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Grid3x3, List, Search, Loader2, FileJson, FileSpreadsheet, Download } from "lucide-react";
import { ImageGrid } from "./image-grid";
import { ImageTable } from "./image-table";
import { useToast } from "@/hooks/use-toast";

interface ResultsDisplayProps {
  job: ScrapeJob;
  viewMode: "grid" | "table";
  onViewModeChange: (mode: "grid" | "table") => void;
}

export function ResultsDisplay({ job, viewMode, onViewModeChange }: ResultsDisplayProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const filteredImages = job.images?.filter((image) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      image.imageId.toLowerCase().includes(query) ||
      image.photographer?.toLowerCase().includes(query) ||
      image.city?.toLowerCase().includes(query) ||
      image.country?.toLowerCase().includes(query)
    );
  }) || [];

  const handleExport = async (format: "json" | "csv") => {
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
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Could not export the data. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (job.status === "error") {
    return (
      <div className="bg-card rounded-lg border border-card-border p-12 text-center">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-foreground">Scraping Failed</h3>
          <p className="text-muted-foreground">{job.error || "An unknown error occurred"}</p>
        </div>
      </div>
    );
  }

  if (!job.images || job.images.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-card-border p-12 text-center shadow-sm">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto animate-pulse">
            {job.status === "scraping" ? (
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            ) : (
              <Search className="w-10 h-10 text-muted-foreground" />
            )}
          </div>
          <h3 className="text-xl font-semibold text-foreground">
            {job.status === "scraping" ? "Scraping in Progress..." : "No Results"}
          </h3>
          <p className="text-muted-foreground">
            {job.status === "scraping"
              ? "Please wait while we extract image data from the page. This may take a few minutes."
              : "No images were found at the provided URL."}
          </p>
          {job.status === "scraping" && (
            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <p className="text-sm text-primary font-medium animate-pulse">
                Loading page and discovering images...
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {job.status === "scraping" && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center gap-3 animate-pulse">
          <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-primary">
              Scraping in progress - {job.scrapedImages} of {job.totalImages || "?"} images extracted
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Results will update automatically as more images are discovered
            </p>
          </div>
        </div>
      )}
      
      <div className="bg-card rounded-lg border border-card-border p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID, photographer, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
              data-testid="input-search"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground mr-2">
              {filteredImages.length} {filteredImages.length === 1 ? "result" : "results"}
              {job.status === "scraping" && " (updating...)"}
            </span>
            
            {/* Export Buttons */}
            <div className="flex items-center gap-1 border-r border-border pr-2 mr-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("json")}
                className="gap-1.5 h-9"
                data-testid="button-export-json"
                title="Export as JSON"
              >
                <FileJson className="w-4 h-4" />
                <span className="hidden sm:inline">JSON</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("csv")}
                className="gap-1.5 h-9"
                data-testid="button-export-csv"
                title="Export as CSV"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
            </div>

            {/* View Mode Buttons */}
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="icon"
              onClick={() => onViewModeChange("grid")}
              data-testid="button-view-grid"
              title="Grid view"
            >
              <Grid3x3 className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "outline"}
              size="icon"
              onClick={() => onViewModeChange("table")}
              data-testid="button-view-table"
              title="Table view"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        <ImageGrid images={filteredImages} />
      ) : (
        <ImageTable images={filteredImages} />
      )}
    </div>
  );
}
