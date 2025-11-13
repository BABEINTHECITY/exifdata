import puppeteer, { Browser, Page, ElementHandle } from "puppeteer";
import { ScrapeConfig, ScrapedImage } from "../shared/schema";
import { storage } from "./storage";

type ScrapeProgress = {
  percentage: number;
  current: number;
  total: number;
  status: string;
};

type ScrapeCallbacks = {
  onProgress?: (scrapedCount: number, totalCount: number) => void;
  onComplete?: (images: ScrapedImage[]) => void;
  onError?: (error: Error) => void;
};

// Metadata cache for network-intercepted data
const metadataCache = new Map<string, any>();

class SmartFrameScraper {
  private browser: Browser | null = null;

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
        ],
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrape(
    jobId: string,
    url: string,
    config: ScrapeConfig,
    callbacks: ScrapeCallbacks = {}
  ): Promise<ScrapedImage[]> {
    await this.initialize();
    const page = await this.browser!.newPage();

    try {
      await storage.updateScrapeJob(jobId, { status: "scraping" });
      
      console.log('\n' + '='.repeat(60));
      console.log('STARTING SCRAPE JOB');
      console.log('='.repeat(60));
      console.log(`Job ID: ${jobId}`);
      console.log(`Target URL: ${url}`);
      console.log(`Max Images: ${config.maxImages === 0 ? 'Unlimited' : config.maxImages}`);
      console.log(`Extract Details: ${config.extractDetails ? 'Yes' : 'No'}`);
      console.log(`Auto-scroll: ${config.autoScroll ? 'Yes' : 'No'}`);
      console.log('='.repeat(60) + '\n');
      
      // Anti-detection setup
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      
      // Add benign headers that are safe to apply globally
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br'
      });
      
      // Enhanced stealth mode - hide webdriver and spoof browser properties
      await page.evaluateOnNewDocument(() => {
        // Hide webdriver property
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        
        // Add plugins to appear more like a real browser
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        
        // Add languages array
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
        
        // Add chrome runtime object (present in real Chrome browsers)
        (window as any).chrome = {
          runtime: {}
        };
      });

      // Setup network interception for API metadata (Strategy A)
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        request.continue();
      });

      page.on('response', async (response) => {
        const url = response.url();
        // Intercept SmartFrame API metadata calls
        if (url.includes('smartframe.') && (url.includes('/api/') || url.includes('/metadata') || url.includes('/image/'))) {
          try {
            const contentType = response.headers()['content-type'];
            if (contentType && contentType.includes('application/json')) {
              const data = await response.json();
              if (data && (data.imageId || data.image_id || data.id)) {
                const imageId = data.imageId || data.image_id || data.id;
                metadataCache.set(imageId, data);
                console.log(`Cached metadata for image: ${imageId}`);
              }
            }
          } catch (error) {
            // Silently skip non-JSON responses
          }
        }
      });

      console.log(`Navigating to ${url}...`);
      
      // Retry navigation with exponential backoff
      let attempts = 0;
      const maxAttempts = 3;
      let navigationSuccess = false;

      while (attempts < maxAttempts && !navigationSuccess) {
        attempts++;
        console.log(`Navigation attempt ${attempts}/${maxAttempts} to ${url}`);
        
        try {
          await page.goto(url, {
            waitUntil: "networkidle2",
            timeout: 60000
          });
          navigationSuccess = true;
        } catch (error) {
          console.error(`Navigation attempt ${attempts} failed:`, error);
          if (attempts === maxAttempts) throw error;
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts)); // Exponential backoff
        }
      }

      // Wait for SmartFrame embeds to load
      try {
        await page.waitForSelector('smartframe-embed, .sf-thumbnail, [data-testid="image-card"]', { timeout: 15000 });
      } catch (error) {
        console.log("SmartFrame elements not found with standard selectors, trying fallback...");
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Extract thumbnails from search page
      const thumbnails = await this.extractThumbnailsFromSearch(page);
      console.log(`Extracted ${thumbnails.size} thumbnails from search page`);

      // Create accumulator for incrementally discovered image links
      const discoveredLinks = new Map<string, { url: string; imageId: string; hash: string }>();

      // NEW: Collect initial page before autoScroll starts
      console.log('Collecting images from initial page...');
      const initialPageLinks = await this.collectPageImageLinks(page);
      for (const link of initialPageLinks) {
        discoveredLinks.set(link.imageId, link);
      }
      console.log(`Initial page: collected ${discoveredLinks.size} images`);

      // Auto-scroll to load all images with incremental collection
      if (config.autoScroll) {
        await this.autoScroll(
          page, 
          config.maxImages, 
          config.scrollDelay || 1000, 
          async (progress: ScrapeProgress) => {
            await storage.updateScrapeJob(jobId, {
              progress: Math.round(progress.percentage),
              scrapedImages: progress.current,
              totalImages: progress.total,
            });
          },
          async () => {
            // Collect images from current page after each pagination
            const pageLinks = await this.collectPageImageLinks(page);
            for (const link of pageLinks) {
              discoveredLinks.set(link.imageId, link);
            }
            console.log(`Collected ${discoveredLinks.size} unique images so far`);
          }
        );
      }

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Collect final page images
      const finalPageLinks = await this.collectPageImageLinks(page);
      for (const link of finalPageLinks) {
        discoveredLinks.set(link.imageId, link);
      }

      const imageLinks = Array.from(discoveredLinks.values());
      console.log(`Total unique images collected: ${imageLinks.length}`);

      const limitedLinks = config.maxImages === 0 ? imageLinks : imageLinks.slice(0, config.maxImages);

      console.log(`Processing ${limitedLinks.length} image links`);

      const images: ScrapedImage[] = [];

      for (let i = 0; i < limitedLinks.length; i++) {
        const linkData = limitedLinks[i];
        try {
          const image = await this.extractImageData(
            page, 
            linkData.url, 
            linkData.imageId,
            linkData.hash,
            config.extractDetails,
            thumbnails.get(linkData.imageId)
          );
          
          if (image) {
            images.push(image);

            const progress = Math.round(((i + 1) / limitedLinks.length) * 100);
            await storage.updateScrapeJob(jobId, {
              progress,
              scrapedImages: images.length,
              totalImages: limitedLinks.length,
              images,
            });

            if (callbacks.onProgress) {
              callbacks.onProgress(images.length, limitedLinks.length);
            }
          }

          // Random delay between images (anti-detection)
          const delay = 1000 + Math.random() * 2000; // 1-3 seconds
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
          console.error(`Error scraping image ${linkData.url}:`, error);
        }
      }

      await storage.updateScrapeJob(jobId, {
        status: "completed",
        progress: 100,
        completedAt: new Date().toISOString(),
      });

      // Log detailed export information
      console.log('\n' + '='.repeat(60));
      console.log('SCRAPING COMPLETED SUCCESSFULLY');
      console.log('='.repeat(60));
      console.log(`Total images scraped: ${images.length}`);
      console.log(`Job ID: ${jobId}`);
      
      // Show sample of extracted data
      if (images.length > 0) {
        console.log('\nData fields extracted for each image:');
        const sampleImage = images[0];
        const fields = [
          { name: 'Image ID', value: sampleImage.smartframeId },
          { name: 'URL', value: sampleImage.url },
          { name: 'Photographer', value: sampleImage.photographer || 'N/A' },
          { name: 'Image Size', value: sampleImage.imageSize || 'N/A' },
          { name: 'File Size', value: sampleImage.fileSize || 'N/A' },
          { name: 'City', value: sampleImage.city || 'N/A' },
          { name: 'Country', value: sampleImage.country || 'N/A' },
          { name: 'Date', value: sampleImage.date || 'N/A' },
          { name: 'Event', value: sampleImage.matchEvent || 'N/A' },
          { name: 'Thumbnail URL', value: sampleImage.thumbnailUrl ? 'Available' : 'N/A' },
        ];
        
        fields.forEach(field => {
          console.log(`  - ${field.name}: ${field.value}`);
        });
      }
      
      console.log('\n' + '-'.repeat(60));
      console.log('HOW TO EXPORT YOUR DATA:');
      console.log('-'.repeat(60));
      console.log('1. Open your browser to: http://localhost:5000');
      console.log('2. Click the "Export Data" button in the top-right corner');
      console.log('3. Choose your preferred format:');
      console.log('   - JSON: Full structured data with all metadata');
      console.log('   - CSV: Spreadsheet format for Excel/Google Sheets');
      console.log('\nAlternatively, use the API directly:');
      console.log(`   GET http://localhost:5000/api/export/${jobId}?format=json`);
      console.log(`   GET http://localhost:5000/api/export/${jobId}?format=csv`);
      console.log('='.repeat(60) + '\n');

      if (callbacks.onComplete) {
        callbacks.onComplete(images);
      }

      return images;
    } catch (error) {
      console.error("Scraping error:", error);
      await storage.updateScrapeJob(jobId, {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });

      if (callbacks.onError && error instanceof Error) {
        callbacks.onError(error);
      }

      throw error;
    } finally {
      await page.close();
    }
  }

  private async extractThumbnailsFromSearch(page: Page): Promise<Map<string, string>> {
    const thumbnailMap = new Map<string, string>();

    try {
      const thumbnails = await page.evaluate(() => {
        const results: Array<{ imageId: string; thumbnailUrl: string }> = [];

        // Extract from smartframe-embed elements
        const embeds = document.querySelectorAll('smartframe-embed');
        embeds.forEach((embed) => {
          const imageId = embed.getAttribute('image-id');
          if (imageId) {
            // Try to get thumbnail from computed style or child img
            const img = embed.querySelector('img');
            const thumbnailUrl = img?.src || '';
            if (thumbnailUrl) {
              results.push({ imageId, thumbnailUrl });
            }
          }
        });

        return results;
      });

      thumbnails.forEach(({ imageId, thumbnailUrl }) => {
        thumbnailMap.set(imageId, thumbnailUrl);
      });
    } catch (error) {
      console.error('Error extracting thumbnails:', error);
    }

    return thumbnailMap;
  }

  private async collectPageImageLinks(page: Page): Promise<Array<{ url: string; imageId: string; hash: string }>> {
    return await page.evaluate(() => {
      const links: Array<{ url: string; imageId: string; hash: string }> = [];
      
      // Method 1: smartframe-embed elements
      const embeds = document.querySelectorAll('smartframe-embed');
      embeds.forEach((embed) => {
        const imageId = embed.getAttribute('image-id');
        const customerId = embed.getAttribute('customer-id');
        if (imageId && customerId) {
          links.push({
            url: `https://smartframe.com/search/image/${customerId}/${imageId}`,
            imageId: imageId,
            hash: customerId
          });
        }
      });

      // Method 2: Direct links to /search/image/
      const thumbnailLinks = document.querySelectorAll('a[href*="/search/image/"]');
      thumbnailLinks.forEach((link) => {
        const href = (link as HTMLAnchorElement).href;
        const match = href.match(/\/search\/image\/([^\/]+)\/([^\/\?]+)/);
        if (match && !links.some(l => l.imageId === match[2])) {
          links.push({
            url: href,
            imageId: match[2],
            hash: match[1]
          });
        }
      });

      // Method 3: Data attributes on containers
      const containers = document.querySelectorAll('[data-image-id], .sf-thumbnail');
      containers.forEach((container) => {
        const imageId = container.getAttribute('data-image-id');
        const hash = container.getAttribute('data-customer-id') || container.getAttribute('data-hash');
        
        if (imageId && hash && !links.some(l => l.imageId === imageId)) {
          links.push({
            url: `https://smartframe.com/search/image/${hash}/${imageId}`,
            imageId: imageId,
            hash: hash
          });
        }
      });

      return links;
    });
  }

  private async autoScroll(
    page: Page, 
    maxImages: number, 
    scrollDelay: number, 
    onProgress: (progress: ScrapeProgress) => void,
    onPageChange?: () => Promise<void>
  ): Promise<void> {
    let previousHeight;
    let imageCount = 0;
    const loadedImageUrls = new Set<string>();
    const visitedPages = new Set<string>(); // Track visited pages to prevent loops
    let lastPageUrl = ''; // Track last page URL to detect pagination changes
    let justClickedPagination = false; // Track if we just clicked pagination to skip visited check

    // CSS selectors that can be used with page.$$()
    const loadMoreSelectors = [
      '[data-testid="load-more"]',
      'button.load-more',
      '#load-more-button',
      'button[class*="load-more"]',
      'button[class*="rounded-r-md"]', // Next button in pagination (right-rounded button)
      '[aria-label*="Load"]',
      '[aria-label*="Next"]',
      '[aria-label*="next"]',
      '.pagination button',
      '.pagination a',
      'nav button',
      'nav a',
      'button', // Fallback: check all buttons
      'a[href*="page"]', // Links with "page" in href
    ];

    const isUnlimited = maxImages === 0;
    const patienceRounds = 5; // Number of retry rounds when scroll height stops increasing
    const patienceDelay = scrollDelay * 2; // Delay between patience rounds
    console.log(`Starting auto-scroll (target: ${isUnlimited ? 'unlimited' : maxImages} images, delay: ${scrollDelay}ms, patience: ${patienceRounds} rounds)`);

    while (isUnlimited || imageCount < maxImages) {
      // Get current page state for comparison
      const currentUrl = page.url();
      const currentPageKey = currentUrl + '-' + imageCount; // Unique key for this page state
      
      // Check if we've already processed this exact page state (skip if we just clicked pagination)
      if (!justClickedPagination && visitedPages.has(currentPageKey)) {
        console.log(`Already visited page state: ${currentPageKey}. Breaking pagination loop.`);
        break;
      }
      
      // Reset the flag at the start of each iteration
      justClickedPagination = false;
      
      visitedPages.add(currentPageKey);
      
      const thumbnails = await page.$$('img');
      imageCount = thumbnails.length;
      console.log(`Scrolled to ${await page.evaluate(() => document.body.scrollHeight)}px, found ${imageCount} images`);

      onProgress({
        percentage: isUnlimited ? 0 : (imageCount / maxImages) * 100,
        current: imageCount,
        total: isUnlimited ? imageCount : maxImages,
        status: 'Scrolling and discovering images...',
      });

      // Attempt to click "Load More" or "Next" button if it exists and is visible
      let loadMoreButton: ElementHandle<Element> | null = null;
      let matchedSelector = '';
      let buttonText = '';
      
      // First, try to find pagination buttons by evaluating all buttons and getting the element
      try {
        const buttonInfo = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a'));
          
          // Priority 1: Look for "Next" buttons specifically
          for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const text = btn.textContent?.toLowerCase().trim() || '';
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            
            // Check if this is specifically a "Next" button
            if (text === 'next' || ariaLabel === 'next' || text.startsWith('next')) {
              // Check if button is enabled and visible
              const isDisabled = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true';
              if (isDisabled) continue;
              
              const rect = btn.getBoundingClientRect();
              const isVisible = rect.top >= 0 && 
                               rect.left >= 0 && 
                               rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) * 2 &&
                               rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
                               rect.width > 0 && rect.height > 0;
              
              if (isVisible && btn instanceof HTMLElement) {
                const style = window.getComputedStyle(btn);
                if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                  return {
                    found: true,
                    index: i,
                    text: btn.textContent?.trim() || '',
                    tagName: btn.tagName.toLowerCase()
                  };
                }
              }
            }
          }
          
          // Priority 2: Look for other pagination buttons
          for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const text = btn.textContent?.toLowerCase() || '';
            const classList = Array.from(btn.classList || []);
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            
            // Check if this is a pagination button
            const isPaginationText = text.includes('load more') || 
                                     text.includes('show more') ||
                                     text.includes('load all');
            
            const isPaginationClass = classList.some(cls => 
              cls.includes('load') || 
              cls.includes('pagination') ||
              cls.includes('rounded-r-md') // Specific to Next button in the provided HTML
            );
            
            const isPaginationAria = ariaLabel.includes('load') ||
                                     ariaLabel.includes('more');
            
            if (isPaginationText || isPaginationClass || isPaginationAria) {
              // Check if button is enabled and visible
              const isDisabled = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true';
              if (isDisabled) continue;
              
              const rect = btn.getBoundingClientRect();
              const isVisible = rect.top >= 0 && 
                               rect.left >= 0 && 
                               rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) * 2 &&
                               rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
                               rect.width > 0 && rect.height > 0;
              
              if (isVisible && btn instanceof HTMLElement) {
                const style = window.getComputedStyle(btn);
                if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                  return {
                    found: true,
                    index: i,
                    text: btn.textContent?.trim() || '',
                    tagName: btn.tagName.toLowerCase()
                  };
                }
              }
            }
          }
          return { found: false };
        });
        
        if (buttonInfo.found) {
          // Get the actual element handle
          const allButtons = await page.$$('button, a');
          if (buttonInfo.index !== undefined && allButtons[buttonInfo.index]) {
            loadMoreButton = allButtons[buttonInfo.index];
            matchedSelector = 'evaluated pagination button';
            buttonText = buttonInfo.text || '';
            console.log(`Found pagination button with text: "${buttonText}"`);
          }
        }
      } catch (error) {
        console.log('Error finding pagination button via evaluation:', error);
      }
      
      // Fallback: try CSS selectors
      if (!loadMoreButton) {
        for (const selector of loadMoreSelectors) {
          try {
            const elements = await page.$$(selector);
            for (const element of elements) {
              const isVisible = await element.isIntersectingViewport();
              if (isVisible) {
                // Check if element is disabled
                const isDisabled = await element.evaluate(el => {
                  return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
                });
                if (isDisabled) continue;
                
                // Check if element text suggests it's a pagination control
                const text = await element.evaluate(el => el.textContent?.toLowerCase().trim() || '');
                const isPagination = text === 'next' ||
                                     text.includes('load') || 
                                     text.includes('more') || 
                                     text.includes('next') || 
                                     text.includes('show');
                
                if (isPagination) {
                  loadMoreButton = element;
                  matchedSelector = selector;
                  buttonText = text;
                  console.log(`Found pagination button with selector: ${selector}, text: "${text}"`);
                  break;
                }
              }
            }
            if (loadMoreButton) break;
          } catch (error) {
            // This selector is not supported or failed, try the next one
          }
        }
      }

      if (loadMoreButton) {
        try {
          // Capture state before clicking
          const beforeClickImageCount = imageCount;
          const beforeClickUrl = page.url();
          
          // Scroll button into view before clicking
          await loadMoreButton.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          await new Promise(resolve => setTimeout(resolve, 500));
          
          await loadMoreButton.click();
          console.log(`Clicked pagination button (${matchedSelector}).`);
          
          // Wait longer for page to fully load and new content to appear
          await new Promise(resolve => setTimeout(resolve, scrollDelay + 2000)); // Increased wait time
          
          // Verify that clicking resulted in a change
          const afterClickUrl = page.url();
          const afterClickThumbnails = await page.$$('img');
          const afterClickImageCount = afterClickThumbnails.length;
          
          if (afterClickUrl !== beforeClickUrl) {
            console.log(`Page URL changed from ${beforeClickUrl} to ${afterClickUrl} - pagination successful`);
            lastPageUrl = afterClickUrl; // Update last page URL to detect next pagination
            justClickedPagination = true; // Mark that we just clicked pagination successfully
            if (onPageChange) await onPageChange();
            continue; // Continue to next iteration with new page
          } else if (afterClickImageCount > beforeClickImageCount) {
            console.log(`Image count increased from ${beforeClickImageCount} to ${afterClickImageCount} - pagination successful`);
            justClickedPagination = true; // Mark that we just clicked pagination successfully
            if (onPageChange) await onPageChange();
            continue; // Continue to next iteration with new content
          } else {
            console.log(`Click did not result in page change or new content. Proceeding with scroll.`);
            loadMoreButton = null;
          }
        } catch (error) {
          console.log('Pagination button no longer clickable or disappeared. Proceeding with scroll.');
          loadMoreButton = null;
        }
      }

      previousHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await new Promise(resolve => setTimeout(resolve, scrollDelay));

      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === previousHeight) {
        // Height unchanged - check for pagination button that may now be visible at bottom
        console.log('Scroll height unchanged. Checking for pagination button before patience mechanism...');
        
        let paginationButton: ElementHandle<Element> | null = null;
        let paginationSelector = '';
        let paginationButtonText = '';
        
        // Try to find pagination button now that we're at the bottom
        try {
          const buttonInfo = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a'));
            
            // Priority 1: Look for "Next" buttons specifically
            for (let i = 0; i < buttons.length; i++) {
              const btn = buttons[i];
              const text = btn.textContent?.toLowerCase().trim() || '';
              const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
              
              // Check if this is specifically a "Next" button
              if (text === 'next' || ariaLabel === 'next' || text.startsWith('next')) {
                // Check if button is enabled and visible
                const isDisabled = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true';
                if (isDisabled) continue;
                
                const rect = btn.getBoundingClientRect();
                const isVisible = rect.top >= 0 && 
                                 rect.left >= 0 && 
                                 rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) * 2 &&
                                 rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
                                 rect.width > 0 && rect.height > 0;
                
                if (isVisible && btn instanceof HTMLElement) {
                  const style = window.getComputedStyle(btn);
                  if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                    return {
                      found: true,
                      index: i,
                      text: btn.textContent?.trim() || '',
                      tagName: btn.tagName.toLowerCase()
                    };
                  }
                }
              }
            }
            
            // Priority 2: Look for other pagination buttons
            for (let i = 0; i < buttons.length; i++) {
              const btn = buttons[i];
              const text = btn.textContent?.toLowerCase() || '';
              const classList = Array.from(btn.classList || []);
              const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
              
              // Check if this is a pagination button
              const isPaginationText = text.includes('load more') || 
                                       text.includes('show more') ||
                                       text.includes('load all');
              
              const isPaginationClass = classList.some(cls => 
                cls.includes('load') || 
                cls.includes('pagination') ||
                cls.includes('rounded-r-md')
              );
              
              const isPaginationAria = ariaLabel.includes('load') ||
                                       ariaLabel.includes('more');
              
              if (isPaginationText || isPaginationClass || isPaginationAria) {
                // Check if button is enabled and visible
                const isDisabled = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true';
                if (isDisabled) continue;
                
                const rect = btn.getBoundingClientRect();
                const isVisible = rect.top >= 0 && 
                                 rect.left >= 0 && 
                                 rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) * 2 &&
                                 rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
                                 rect.width > 0 && rect.height > 0;
                
                if (isVisible && btn instanceof HTMLElement) {
                  const style = window.getComputedStyle(btn);
                  if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                    return {
                      found: true,
                      index: i,
                      text: btn.textContent?.trim() || '',
                      tagName: btn.tagName.toLowerCase()
                    };
                  }
                }
              }
            }
            return { found: false };
          });
          
          if (buttonInfo.found) {
            const allButtons = await page.$$('button, a');
            if (buttonInfo.index !== undefined && allButtons[buttonInfo.index]) {
              paginationButton = allButtons[buttonInfo.index];
              paginationSelector = 'evaluated pagination button';
              paginationButtonText = buttonInfo.text || '';
              console.log(`Found pagination button at bottom with text: "${paginationButtonText}"`);
            }
          }
        } catch (error) {
          console.log('Error finding pagination button at bottom:', error);
        }
        
        // Try CSS selectors as fallback
        if (!paginationButton) {
          for (const selector of loadMoreSelectors) {
            try {
              const elements = await page.$$(selector);
              for (const element of elements) {
                const isVisible = await element.isIntersectingViewport();
                if (isVisible) {
                  // Check if element is disabled
                  const isDisabled = await element.evaluate(el => {
                    return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
                  });
                  if (isDisabled) continue;
                  
                  const text = await element.evaluate(el => el.textContent?.toLowerCase().trim() || '');
                  const isPagination = text === 'next' ||
                                       text.includes('load') || 
                                       text.includes('more') || 
                                       text.includes('next') || 
                                       text.includes('show');
                  
                  if (isPagination) {
                    paginationButton = element;
                    paginationSelector = selector;
                    paginationButtonText = text;
                    console.log(`Found pagination button at bottom with selector: ${selector}, text: "${text}"`);
                    break;
                  }
                }
              }
              if (paginationButton) break;
            } catch (error) {
              // This selector failed, try the next one
            }
          }
        }
        
        // If we found a pagination button, click it
        if (paginationButton) {
          try {
            // Capture state before clicking
            const beforeClickImageCount = imageCount;
            const beforeClickUrl = page.url();
            
            await paginationButton.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
            await new Promise(resolve => setTimeout(resolve, 500));
            
            await paginationButton.click();
            console.log(`Clicked pagination button at bottom (${paginationSelector}).`);
            
            // Wait longer for page to fully load
            await new Promise(resolve => setTimeout(resolve, scrollDelay + 2000)); // Increased wait time
            
            // Verify that clicking resulted in a change
            const afterClickUrl = page.url();
            const afterClickThumbnails = await page.$$('img');
            const afterClickImageCount = afterClickThumbnails.length;
            
            if (afterClickUrl !== beforeClickUrl) {
              console.log(`Page URL changed after click at bottom - pagination successful`);
              lastPageUrl = afterClickUrl;
              justClickedPagination = true; // Mark that we just clicked pagination successfully
              if (onPageChange) await onPageChange();
              continue; // Continue to next iteration with new page
            } else if (afterClickImageCount > beforeClickImageCount) {
              console.log(`Image count increased after click at bottom - pagination successful`);
              justClickedPagination = true; // Mark that we just clicked pagination successfully
              if (onPageChange) await onPageChange();
              continue; // Continue to next iteration with new content
            } else {
              console.log(`Click at bottom did not result in page change. Proceeding with patience mechanism.`);
            }
          } catch (error) {
            console.log('Failed to click pagination button at bottom. Proceeding with patience mechanism.');
          }
        }
        
        // No pagination button found, try patience mechanism
        console.log('No pagination button found. Starting patience mechanism...');
        let moreImagesLoaded = false;
        
        for (let round = 1; round <= patienceRounds; round++) {
          console.log(`Patience round ${round}/${patienceRounds}: Waiting ${patienceDelay}ms for more images to load...`);
          await new Promise(resolve => setTimeout(resolve, patienceDelay));
          
          const currentHeight = await page.evaluate(() => document.body.scrollHeight);
          if (currentHeight > newHeight) {
            console.log(`Patience round ${round}/${patienceRounds}: New content detected! Scroll height increased from ${newHeight}px to ${currentHeight}px.`);
            moreImagesLoaded = true;
            break;
          }
          
          console.log(`Patience round ${round}/${patienceRounds}: No new content yet (height still ${currentHeight}px).`);
        }
        
        if (!moreImagesLoaded) {
          console.log(`Patience mechanism exhausted after ${patienceRounds} rounds. Reached end of page.`);
          break; // End of page
        }
      }
    }
  }

  // Helper function to clean and validate extracted text (plain JS for serialization)
  private cleanTextHelper(text: string | null): string | null {
    if (!text) return null;
    
    // Early rejection: Check for suspicious patterns in raw text before cleaning
    const lowerText = text.toLowerCase();
    if (lowerText.includes('script') || 
        lowerText.includes('iframe') ||
        lowerText.includes('onclick') ||
        lowerText.includes('onerror') ||
        lowerText.includes('onload')) return null;
    
    // Reject common UI text that's not metadata
    if (lowerText.includes('add to board') ||
        lowerText.includes('copy link') ||
        lowerText.includes('copy embed') ||
        lowerText.includes('google tag manager') ||
        lowerText.includes('smartframe content partner')) return null;
    
    // Multi-step sanitization to remove HTML tags and prevent injection
    let cleaned = text;
    // Step 1: Remove complete tags
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    // Step 2: Remove incomplete tags at start/end
    cleaned = cleaned.replace(/^<[^>]*/, '').replace(/[^<]*>$/, '');
    // Step 3: Remove any remaining angle brackets (prevents any HTML parsing)
    cleaned = cleaned.replace(/[<>]/g, '');
    cleaned = cleaned.trim();
    
    // Reject if text is too long (likely grabbed too much content)
    if (cleaned.length > 200) return null;
    // Reject if text contains multiple newlines (likely multiple elements)
    if (cleaned.split('\n').length > 3) return null;
    
    return cleaned || null;
  }

  private parseMetadata(rawData: any): Partial<ScrapedImage> {
    const result: Partial<ScrapedImage> = {
      photographer: null,
      imageSize: null,
      fileSize: null,
      country: null,
      city: null,
      date: null,
      matchEvent: null
    };

    // Process title and caption
    const title = this.cleanTextHelper(rawData.title);
    const caption = this.cleanTextHelper(rawData.caption);

    // Process label-value pairs from DOM
    for (const item of rawData.labelValues || []) {
      const label = item.label?.toLowerCase() || '';
      const value = this.cleanTextHelper(item.value);

      if (!value) continue;

      // Map label to field
      switch (label) {
        case 'photographer':
        case 'credit':
          result.photographer = result.photographer || value;
          break;
        case 'image size':
        case 'size':
        case 'dimensions':
          result.imageSize = result.imageSize || value;
          break;
        case 'file size':
          result.fileSize = result.fileSize || value;
          break;
        case 'country':
          result.country = result.country || value;
          break;
        case 'city':
        case 'location':
          result.city = result.city || value;
          break;
        case 'date':
        case 'date taken':
          result.date = result.date || value;
          break;
        case 'event':
        case 'title':
        case 'caption':
        case 'description':
          result.matchEvent = result.matchEvent || value;
          break;
      }
    }

    // Use title/caption as fallback for matchEvent
    result.matchEvent = result.matchEvent || title || caption;

    // Regex fallback: Parse caption for structured metadata
    if (caption) {
      if (!result.photographer) {
        const creditMatch = caption.match(/(?:Credit|Photographer):\s*([^\/\n]+)/i);
        if (creditMatch) result.photographer = this.cleanTextHelper(creditMatch[1]);
      }

      if (!result.city && !result.country) {
        const whereMatch = caption.match(/Where:\s*([^\/\n]+)/i);
        if (whereMatch) {
          const location = this.cleanTextHelper(whereMatch[1]);
          if (location && location.includes(',')) {
            const parts = location.split(',').map((p: string) => p.trim());
            result.city = this.cleanTextHelper(parts[0]);
            result.country = this.cleanTextHelper(parts[1]);
          } else {
            result.city = location;
          }
        }
      }

      if (!result.date) {
        const whenMatch = caption.match(/When:\s*([^\/\n]+)/i);
        if (whenMatch) result.date = this.cleanTextHelper(whenMatch[1]);
      }

      if (!result.matchEvent) {
        const featuringMatch = caption.match(/Featuring:\s*([^\/\n]+)/i);
        if (featuringMatch) result.matchEvent = this.cleanTextHelper(featuringMatch[1]);
      }
    }

    // Process __NEXT_DATA__ JSON
    if (rawData.nextData) {
      result.photographer = result.photographer || this.cleanTextHelper(rawData.nextData.photographer);
      result.imageSize = result.imageSize || this.cleanTextHelper(rawData.nextData.dimensions);
      result.fileSize = result.fileSize || this.cleanTextHelper(rawData.nextData.fileSize);
      result.country = result.country || this.cleanTextHelper(rawData.nextData.country);
      result.city = result.city || this.cleanTextHelper(rawData.nextData.city);
      result.date = result.date || this.cleanTextHelper(rawData.nextData.date);
      result.matchEvent = result.matchEvent || this.cleanTextHelper(rawData.nextData.eventTitle || rawData.nextData.title || rawData.nextData.caption);
    }

    return result;
  }

  private async extractImageData(
    page: Page,
    url: string,
    imageId: string,
    hash: string,
    extractDetails: boolean,
    thumbnailUrl?: string
  ): Promise<ScrapedImage | null> {
    const image: ScrapedImage = {
      imageId,
      hash,
      url,
      copyLink: url,
      smartframeId: imageId,
      photographer: null,
      imageSize: null,
      fileSize: null,
      country: null,
      city: null,
      date: null,
      matchEvent: null,
      thumbnailUrl: thumbnailUrl || null,
    };

    // Check if we have cached metadata from network interception (Strategy A)
    if (metadataCache.has(imageId)) {
      const cachedData = metadataCache.get(imageId);
      console.log(`Using cached network metadata for ${imageId}`);
      
      // Map cached data to image fields
      image.photographer = cachedData.photographer || cachedData.credit || cachedData.author || null;
      image.imageSize = cachedData.dimensions || cachedData.size || cachedData.imageSize || null;
      image.fileSize = cachedData.fileSize || cachedData.file_size || null;
      image.country = cachedData.country || cachedData.location?.country || null;
      image.city = cachedData.city || cachedData.location?.city || null;
      image.date = cachedData.date || cachedData.dateCreated || cachedData.created_at || null;
      image.matchEvent = cachedData.title || cachedData.event || cachedData.description || null;
    }

    if (extractDetails) {
      try {
        // Set viewport to desktop size to ensure lg:block elements are visible
        await page.setViewport({ width: 1280, height: 800 });
        
        // Retry mechanism for page navigation with improved timeout and wait strategy
        let navSuccess = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            // Use domcontentloaded instead of networkidle2 for faster, more reliable loading
            // Increase timeout to 60 seconds to handle slow-loading pages
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
            navSuccess = true;
            break;
          } catch (error) {
            console.log(`Navigation attempt ${attempt} failed for ${url}:`, error instanceof Error ? error.message : error);
            if (attempt === 2) {
              // Don't throw - gracefully handle timeout by returning image with available data
              console.log(`Failed to navigate to ${url} after ${attempt} attempts. Continuing with available data.`);
              return image;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        if (!navSuccess) return image;

        // Wait for metadata section to be rendered (critical for SPA hydration)
        try {
          await page.waitForSelector('li strong', { visible: true, timeout: 15000 });
        } catch (error) {
          console.log(`Metadata section not found for ${url}, trying alternate selector`);
          // Try alternate wait - sometimes the metadata is in a different structure
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Strategy B: DOM extraction with modern <li><strong> pattern
        // SmartFrame uses semantic list items where labels are in <strong> tags
        // Extract RAW data only - all processing happens in Node context
        const rawData = await page.evaluate(() => {
          const labelValues: Array<{ label: string; value: string }> = [];

          // Extract raw title
          const titleEl = document.querySelector('h1');
          const title = titleEl?.textContent || null;
          
          // Extract raw caption
          const captionEl = document.querySelector('p.text-iy-midnight-400');
          const caption = captionEl?.textContent || null;

          // Extract raw label-value pairs from list items
          document.querySelectorAll('li').forEach(li => {
            const strong = li.querySelector('strong');
            if (!strong) return;
            
            const label = strong.textContent?.replace(':', '').trim() || '';
            
            // Get raw value - could be in button or text node
            let value: string | null = null;
            
            const button = li.querySelector('button');
            if (button) {
              value = button.textContent || null;
            } else if (strong.nextSibling) {
              value = strong.nextSibling.textContent || null;
            }
            
            if (label && value) {
              labelValues.push({ label, value });
            }
          });

          // Extract raw __NEXT_DATA__ JSON
          let nextData: any = null;
          try {
            const nextDataScript = document.querySelector('script#__NEXT_DATA__');
            if (nextDataScript?.textContent) {
              const parsed = JSON.parse(nextDataScript.textContent);
              const imageMetadata = parsed?.props?.pageProps?.image?.metadata;
              if (imageMetadata) {
                nextData = {
                  photographer: imageMetadata.photographer,
                  dimensions: imageMetadata.dimensions,
                  fileSize: imageMetadata.fileSize,
                  country: imageMetadata.country,
                  city: imageMetadata.city,
                  date: imageMetadata.date,
                  eventTitle: imageMetadata.eventTitle,
                  title: imageMetadata.title,
                  caption: imageMetadata.caption
                };
              }
            }
          } catch (e) {
            // Silently ignore JSON parse errors
          }

          return { title, caption, labelValues, nextData };
        });

        // Process raw data in Node context using helper functions
        const metadata = this.parseMetadata(rawData);

        // Merge DOM-extracted data (only if network data didn't provide it)
        image.photographer = image.photographer || (metadata.photographer ?? null);
        image.imageSize = image.imageSize || (metadata.imageSize ?? null);
        image.fileSize = image.fileSize || (metadata.fileSize ?? null);
        image.country = image.country || (metadata.country ?? null);
        image.city = image.city || (metadata.city ?? null);
        image.date = image.date || (metadata.date ?? null);
        image.matchEvent = image.matchEvent || (metadata.matchEvent ?? null);

      } catch (error) {
        console.error(`Error extracting details for ${url}:`, error);
      }
    }

    return image;
  }
}

export const scraper = new SmartFrameScraper();
