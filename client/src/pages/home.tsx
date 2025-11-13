import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrapeForm } from "@/components/scraper/scrape-form";
import { ConfigPanel } from "@/components/scraper/config-panel";
import { ProgressIndicator } from "@/components/scraper/progress-indicator";
import { ResultsDisplay } from "@/components/scraper/results-display";
import { ExportModal } from "@/components/scraper/export-modal";
import { ScrapeConfig, ScrapeJob } from "@shared/schema";
import { Globe, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [config, setConfig] = useState<Omit<ScrapeConfig, "url">>({
    maxImages: 0,
    extractDetails: true,
    sortBy: "relevance",
    autoScroll: true,
    scrollDelay: 1000,
  });

  const { data: currentJob } = useQuery<ScrapeJob>({
    queryKey: ["/api/scrape/job", currentJobId],
    enabled: !!currentJobId,
    refetchInterval: (query) => {
      const job = query.state.data;
      return job?.status === "scraping" ? 1000 : false;
    },
  });

  const handleStartScrape = (jobId: string) => {
    setCurrentJobId(jobId);
  };

  const hasResults = currentJob?.images && currentJob.images.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-card-border shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-md flex items-center justify-center">
              <Globe className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">SmartFrame Scraper</h1>
              <p className="text-xs text-muted-foreground">Professional Image Metadata Extraction</p>
            </div>
          </div>
          {hasResults && (
            <Button
              onClick={() => setShowExport(true)}
              variant="default"
              className="gap-2"
              data-testid="button-export"
            >
              <Download className="w-4 h-4" />
              Export Data
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-card rounded-lg border border-card-border p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-card-foreground mb-4">
                Scrape Configuration
              </h2>
              <ScrapeForm
                onSubmit={handleStartScrape}
                isLoading={currentJob?.status === "scraping"}
                config={config}
              />
              
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="mt-4 text-sm text-primary hover:underline"
                data-testid="button-toggle-config"
              >
                {showConfig ? "Hide" : "Show"} Advanced Options
              </button>
              
              {showConfig && (
                <div className="mt-4">
                  <ConfigPanel config={config} onChange={setConfig} />
                </div>
              )}
            </div>

            {currentJob && currentJob.status === "scraping" && (
              <ProgressIndicator job={currentJob} />
            )}
          </div>

          <div className="lg:col-span-2">
            {currentJob ? (
              <ResultsDisplay
                job={currentJob}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            ) : (
              <div className="bg-card rounded-lg border border-card-border p-12 text-center shadow-sm">
                <div className="max-w-md mx-auto space-y-4">
                  <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto">
                    <Globe className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">
                    Ready to Extract Image Data
                  </h3>
                  <p className="text-muted-foreground">
                    Enter a SmartFrame search URL in the form to start scraping image metadata.
                    The tool will automatically handle infinite scrolling and extract detailed information.
                  </p>
                  <div className="pt-4 text-sm text-muted-foreground space-y-1">
                    <p className="font-medium">Example URL:</p>
                    <code className="block bg-muted px-4 py-2 rounded-md text-xs break-all">
                      https://smartframe.com/search?searchQuery=steps&sortBy=relevance
                    </code>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {showExport && currentJob && (
        <ExportModal
          job={currentJob}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
