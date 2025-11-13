# SmartFrame Web Scraper

A professional web application for extracting image metadata from SmartFrame-enabled websites.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

## Features

- 🔍 **Automated Scraping**: Extract image metadata from SmartFrame search pages
- 📊 **Multiple View Modes**: Grid and table views for browsing results
- 🎯 **Advanced Filtering**: Filter images by photographer, location, date, and more
- 📥 **Export Options**: Export results as JSON or CSV files
- ⚡ **Real-time Progress**: Live progress updates during scraping
- 🎨 **Modern UI**: Clean, professional interface with Material Design principles

## Quick Start

### For Windows Users (Easy Method)

1. **Install Node.js** (one-time setup):
   - Visit [https://nodejs.org/](https://nodejs.org/)
   - Download the **LTS (Long Term Support)** version
   - Run the installer and follow the prompts
   - Restart your computer

2. **Launch the application**:
   - Double-click `launch.bat` in the project folder
   - Wait for the command window to show "serving on port 5000"
   - Open your web browser and go to: **http://localhost:5000**

**To stop the application:** Press `Ctrl+C` in the command window, then type `Y` when prompted.

### For All Users (Manual Method)

#### Prerequisites
- Node.js 18+ and npm
- Modern web browser

#### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

The application will be available at `http://localhost:5000`

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production (frontend + backend)
- `npm start` - Run production build
- `npm run check` - TypeScript type checking

## How to Use

1. **Enter a SmartFrame URL**: Paste a SmartFrame search page URL into the form
2. **Configure Options** (optional):
   - Maximum images to scrape
   - Enable/disable auto-scroll
   - Scroll delay
   - Sort order
3. **Click "Start Scraping"**: The tool will begin extracting image data
4. **View Results**: Switch between grid and table views
5. **Export Data**: Download results as JSON or CSV

### Example SmartFrame URL
```
https://smartframe.com/search?searchQuery=climate+change&sortBy=relevance
```

## Understanding the Scraper

Our scraper uses a **dual-strategy approach** to ensure robustness:

### Strategy A: Network Interception (Primary)
- Intercepts API responses in real-time as SmartFrame loads data
- Captures raw JSON metadata directly from SmartFrame's servers
- Fast and reliable - no extra page loads needed

### Strategy B: DOM Extraction (Fallback)
- Visits each image page and extracts metadata from the rendered HTML
- Uses modern SmartFrame selectors with `data-field` attributes
- Multiple fallback layers for maximum reliability:
  1. Modern data-field selectors (`li[data-field="photographer"]`)
  2. Label-based discovery (searches for "Photographer:", "Date:", etc.)
  3. Next.js `__NEXT_DATA__` JSON parsing
  4. Text inference and meta tags

### Benefits
- ✅ **Complete Data**: Both visible and hidden metadata is captured
- ✅ **Reliable**: If one method fails, the other still works
- ✅ **Automatic**: Handles infinite scroll and pagination automatically
- ✅ **Robust**: Works even when SmartFrame updates their website

## Exporting Your Data

After scraping completes, export your data:

1. Click the **"Export Data"** button in the top-right corner
2. Choose your preferred format:
   - **JSON**: Full structured data with all metadata
   - **CSV**: Spreadsheet-compatible format for Excel, Google Sheets, etc.
3. Click **"Download"** and the file will be saved to your computer

### Exported Data Fields

Each scraped image includes:
- **Image ID**: Unique SmartFrame identifier
- **URL**: Direct link to the image page
- **Photographer**: Image credit/photographer name
- **Image Size**: Dimensions (e.g., "1920x1080")
- **File Size**: File size in bytes or KB/MB
- **City**: Location where image was taken
- **Country**: Country where image was taken
- **Date**: Date the image was taken
- **Event**: Event or match name associated with the image
- **Copy Link**: Alternative link for copying
- **Thumbnail URL**: URL to the thumbnail image (typically blank for SmartFrame)

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **shadcn/ui** component library
- **TanStack Query** for data fetching
- **React Hook Form** with Zod validation

### Backend
- **Express.js** with TypeScript
- **Puppeteer** for web scraping
- **In-memory storage** (can be upgraded to PostgreSQL)
- **Rate limiting** to prevent abuse
- **CSV/JSON export** functionality

## Project Structure

```
smartframe-scraper/
├── client/              # Frontend React application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # Custom hooks
│   │   └── lib/         # Utilities
│   └── index.html
├── server/              # Backend Express server
│   ├── index.ts         # Server entry point
│   ├── routes.ts        # API routes
│   ├── scraper.ts       # Puppeteer scraping logic
│   └── storage.ts       # Data storage layer
└── shared/              # Shared types and schemas
    └── schema.ts        # Zod validation schemas
```

## API Endpoints

### Scraping Operations
- `POST /api/scrape/start` - Start a new scraping job
  - Body: `{ url: string, maxImages?: number, extractDetails?: boolean, autoScroll?: boolean, scrollDelay?: number }`
  - Returns: `{ jobId: string, status: string }`

- `GET /api/scrape/job/:id` - Get job status and results
  - Returns: Full job object with status, progress, and scraped images

- `GET /api/scrape/jobs` - List all scraping jobs
  - Returns: Array of all scraping jobs

### Export Operations
- `GET /api/export/:id?format=json` - Export results as JSON
- `GET /api/export/:id?format=csv` - Export results as CSV

## Troubleshooting

### Dependencies won't install
- Check your internet connection
- Delete the `node_modules` folder and try again
- Make sure you have the latest npm: `npm install -g npm`

### Scraping fails or times out
- Check that the SmartFrame URL is valid
- Reduce the number of images to scrape
- Increase scroll delay in advanced options

### No metadata appearing in results
- Make sure you're running the latest version of the code
- The scraper now uses modern SmartFrame selectors (updated November 2025)
- Check console logs for any errors

## Development

### Setting Up Development Environment

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# In another terminal, run TypeScript checker
npm run check
```

## License

MIT

## Support

For issues or questions, check [replit.md](replit.md) for project documentation and recent changes.
