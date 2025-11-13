import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ScrapeConfig } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play } from "lucide-react";

const formSchema = z.object({
  url: z.string()
    .url("Please enter a valid URL")
    .refine(
      (url) => url.includes("smartframe.com"),
      "URL must be from smartframe.com"
    ),
});

interface ScrapeFormProps {
  onSubmit: (jobId: string) => void;
  isLoading: boolean;
  config: Omit<ScrapeConfig, "url">;
}

export function ScrapeForm({ onSubmit, isLoading, config }: ScrapeFormProps) {
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await apiRequest("POST", "/api/scrape/start", {
        ...data,
        ...config,
      });
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Scrape Started",
        description: "The scraping process has begun. This may take a few minutes.",
      });
      onSubmit(data.jobId);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start scraping",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    mutation.mutate(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold">SmartFrame URL</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="https://smartframe.com/search?searchQuery=..."
                  className="h-12"
                  data-testid="input-url"
                  disabled={isLoading || mutation.isPending}
                />
              </FormControl>
              <FormDescription className="text-xs">
                Enter a SmartFrame search page URL
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full h-12 gap-2"
          disabled={isLoading || mutation.isPending}
          data-testid="button-start-scrape"
        >
          {mutation.isPending || isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Scraping...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start Scraping
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
