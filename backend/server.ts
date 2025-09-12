import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import fs from 'fs'; // Import fs module
import { fileURLToPath } from 'url';
import multer from 'multer';
import { createClient, RedisClientType } from 'redis';
import { Project, Short } from '../src/types/youtube-shorts-content-factory/types.js';

// --- Constants for Puppeteer Worker Communication ---
const PUPPETEER_TASKS_LIST = 'puppeteer_tasks_list';
const PUPPETEER_RESPONSE_PREFIX = 'puppeteer_response:';

// --- Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
// @ts-ignore
const PORT = process.env.PORT || 3002;

// --- Redis Client Setup ---
const redisUrl = `redis://${process.env.REDIS_HOST || "redis"}:${process.env.REDIS_PORT || "6379"}`;
console.log(`Attempting to connect to Redis at: ${redisUrl}`);
const redisClient: RedisClientType = createClient({
  url: redisUrl,
  socket: { family: 4 } // Explicitly use IPv4
});

redisClient.on('error', (err: Error) => console.log('Redis Client Error', err));
(async () => {
  await redisClient.connect();
})();

// --- Helper Functions for Redis ---
const PROJECT_SET_KEY = 'projects';

async function readProject(projectId: string): Promise<Project | null> {
  const projectJSON = await redisClient.hGetAll(`project:${projectId}`);
  if (Object.keys(projectJSON).length === 0) {
    return null;
  }
  // Parse shorts array from JSON string
  const project: Project = projectJSON as unknown as Project; // Type assertion
  if (typeof projectJSON.shorts === 'string') {
    project.shorts = JSON.parse(projectJSON.shorts);
  }
  return project;
}

async function writeProject(project: Project): Promise<void> {
  const projectKey = `project:${project.id}`;
  const projectToWrite = {
    ...project,
    // Serialize shorts array into a JSON string for storage in Redis Hash
    shorts: JSON.stringify(project.shorts || []),
  };
  await redisClient.hSet(projectKey, projectToWrite as { [key: string]: string }); // Type assertion for hSet
  await redisClient.sAdd(PROJECT_SET_KEY, project.id);
}

async function readAllProjects(): Promise<Project[]> {
  const projectIds = await redisClient.sMembers(PROJECT_SET_KEY);
  if (!projectIds || projectIds.length === 0) {
    return [];
  }
  const projects = await Promise.all(projectIds.map(id => readProject(id)));
  return projects.filter((p: Project | null): p is Project => p !== null);
}

async function deleteProjectFromRedis(projectId: string): Promise<void> {
  await redisClient.del(`project:${projectId}`);
  await redisClient.sRem(PROJECT_SET_KEY, projectId);
}


// --- CORS Configuration ---
const whitelist = ['http://localhost:15173', 'http://localhost:3000'];
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));

// --- Common Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// --- Image Upload Handling (Multer) ---
const uploadsDir = path.join(__dirname, '../public', 'uploads', 'images');
// fs.mkdir is no longer needed here if we assume the dir exists or is created by other means
// For robustness, you might want a startup script to ensure dirs exist.

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, _file, cb) => cb(null, Date.now() + path.extname(_file.originalname)),
});
const upload = multer({ storage: storage });

app.post('/api/upload/multiple-images', upload.array('images', 20), (req: Request, res: Response) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    return res.status(400).send('No files uploaded.');
  }
  const imageUrls = (req.files as Express.Multer.File[]).map(file => `${req.protocol}://${req.get('host')}/uploads/images/${file.filename}`);
  res.json(imageUrls);
});

// --- GCP Routes (Authentication and YouTube data fetching) ---
// import authRoutes from './src/api/auth/auth.routes.js';
// import youtubeRoutes from './src/api/youtube/youtube.routes.js';
// app.use('/auth', authRoutes);
// app.use('/api/youtube', youtubeRoutes);

// --- Script Management API (Now Redis Based) ---
const SCRIPT_KEY = 'script:main';

// GET script
app.get('/api/script', async (_req: Request, res: Response) => {
  try {
    let script = await redisClient.hGetAll(SCRIPT_KEY);
    if (Object.keys(script).length === 0) {
      script = { hook: '', immersion: '', body: '', cta: '' };
    }
    res.status(200).json(script);
  } catch (error: any) {
    console.error('Error reading script from Redis:', error);
    res.status(500).send('Failed to retrieve script.');
  }
});

// POST script (save/update)
app.post('/api/script', async (req: Request, res: Response) => {
  try {
    const script = req.body;
    await redisClient.hSet(SCRIPT_KEY, script as { [key: string]: string });
    res.status(200).json(script);
  } catch (error: any) {
    console.error('Error saving script to Redis:', error);
    res.status(500).send('Failed to save script.');
  }
});

// --- Project Management API (Redis Based) ---

// GET all projects
app.get('/api/projects', async (_req: Request, res: Response) => {
  try {
    const projects: Project[] = await readAllProjects();
    res.status(200).json(projects);
  } catch (error: any) {
    console.error('Error reading projects from Redis:', error);
    res.status(500).send('Failed to retrieve projects.');
  }
});

// POST a new project
app.post('/api/projects', async (req: Request, res: Response) => {
  try {
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name: req.body.name || 'Untitled Project',
      description: req.body.description || '',
      shorts: [], // Will be stringified by writeProject
    };
    await writeProject(newProject);
    res.status(201).json(newProject);
  } catch (error: any) {
    console.error('Error creating project in Redis:', error);
    res.status(500).send('Failed to create project.');
  }
});

// GET a single project
app.get('/api/projects/:projectId', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const project: Project | null = await readProject(projectId);
        if (!project) {
            return res.status(404).send('Project not found.');
        }
        res.status(200).json(project);
    } catch (error: any) {
        console.error('Error reading project from Redis:', error);
        res.status(500).send('Failed to retrieve project.');
    }
});


// PUT (update) a project
app.put('/api/projects/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    let project: Project | null = await readProject(projectId);

    if (!project) {
      return res.status(404).send('Project not found.');
    }

    // Update project with new data from body
    const updatedProject: Project = { ...project, ...req.body, id: projectId };

    await writeProject(updatedProject);
    res.status(200).json(updatedProject);
  } catch (error: any) {
    console.error('Error updating project in Redis:', error);
    res.status(500).send('Failed to update project.');
  }
});

// DELETE a project
app.delete('/api/projects/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    await deleteProjectFromRedis(projectId);
    res.status(204).send(); // No Content
  } catch (error: any) {
    console.error('Error deleting project from Redis:', error);
    res.status(500).send('Failed to delete project.');
  }
});

// --- Shorts Management API (Redis Based) ---

// GET all shorts for a project
app.get('/api/projects/:projectId/shorts', async (req: Request, res: Response) => {
  try {
    const { projectId = '' } = req.params; // Default to empty string if undefined
    const project: Project | null = await readProject(projectId);
    if (!project) {
      return res.status(404).send('Project not found.');
    }
    res.status(200).json(project.shorts || []);
  } catch (error: any) {
    console.error('Error reading shorts from Redis:', error);
    res.status(500).send('Failed to retrieve shorts.');
  }
});

// POST a new short to a project
app.post('/api/projects/:projectId/shorts', async (req: Request, res: Response) => {
  try {
    const { projectId = '' } = req.params; // Default to empty string if undefined
    const project: Project | null = await readProject(projectId);
    if (!project) {
      return res.status(404).send('Project not found.');
    }

    const newShort: Short = {
      id: `short-${Date.now()}`,
      projectId: projectId,
      title: req.body.title || 'Untitled Short',
      description: req.body.description || '',
      status: req.body.status || 'Idea',
      script: req.body.script || { idea: '', draft: '', hook: '', immersion: '', body: '', cta: '' },
      metadata: req.body.metadata || { tags: '', cta: '', imageIdeas: '', audioNotes: '' },
      images: [
        '/uploads/images/1756187304776.png',
        '/uploads/images/1756187305104.png',
        '/uploads/images/1756187305373.png',
        '/uploads/images/1756187489928.png'
      ],
      titleLine1: req.body.titleLine1 || '',
      titleLine2: req.body.titleLine2 || '',
      youtubeUrl: req.body.youtubeUrl || '',
    };

    project.shorts.push(newShort);
    await writeProject(project);
    res.status(201).json(newShort);
  } catch (error: any) {
    console.error('Error creating short in Redis:', error);
    res.status(500).send('Failed to create short.');
  }
});

// PUT (update) an existing short in a project
app.put('/api/projects/:projectId/shorts/:shortId', async (req: Request, res: Response) => {
  try {
    const { projectId = '' , shortId = '' } = req.params; // Default to empty string if undefined
    const project: Project | null = await readProject(projectId);
    if (!project) {
      return res.status(404).send('Project not found.');
    }

    const shortIndex = project.shorts.findIndex((s: Short) => s.id === shortId);
    if (shortIndex === -1) {
      return res.status(404).send('Short not found.');
    }

    const updatedShort: Short = { ...project.shorts[shortIndex], ...req.body, id: shortId, projectId: projectId };
    project.shorts[shortIndex] = updatedShort;

    await writeProject(project);
    res.status(200).json(updatedShort);
  } catch (error: any) {
    console.error('Error updating short in Redis:', error);
    res.status(500).send('Failed to update short.');
  }
});

// DELETE a short from a project
app.delete('/api/projects/:projectId/shorts/:shortId', async (req: Request, res: Response) => {
  try {
    const { projectId = '' , shortId = '' } = req.params; // Default to empty string if undefined
    const project: Project | null = await readProject(projectId);
    if (!project) {
      return res.status(404).send('Project not found.');
    }

    const initialShortsLength = project.shorts.length;
    project.shorts = project.shorts.filter((s: Short) => s.id !== shortId);

    if (project.shorts.length === initialShortsLength) {
      return res.status(404).send('Short not found.');
    }

    await writeProject(project);
    res.status(204).send(); // No Content
  } catch (error: any) {
    console.error('Error deleting short from Redis:', error);
    res.status(500).send('Failed to delete short.');
  }
});

// Function to get short report data
async function getShortReportData(projectId: string, shortId: string) {
  const project: Project | null = await readProject(projectId);
  if (!project) {
    throw new Error('Project not found.');
  }
  const short: Short | undefined = project.shorts.find((s: Short) => s.id === shortId);
  if (!short) {
    throw new Error('Short not found.');
  }

  // Mock performance data for now
  const mockPerformance = {
    views: '1,234,567',
    viewsChange: '+15%',
    bounceRate: '5%',
    bounceRateChange: '-2%',
    likes: '78,910',
    likesChange: '+20%',
    comments: '1,234',
    commentsChange: '+10%',
    shares: '567',
    sharesChange: '+12%',
  };

  const reportData = {
    title: short.title || 'Untitled Short',
    description: short.description || 'A comprehensive breakdown and performance summary of your short video.', // Assuming short has a description field
    breakdown: {
      hook: {
        description: short.script.hook || 'The initial seconds of your short, designed to grab attention with a compelling question or a visually striking scene.',
        imageUrl: short.images && short.images[0] ? short.images[0] : '/uploads/images/placeholder.png', // Placeholder
      },
      immersion: {
        description: short.script.immersion || 'The core content of your short, aiming to keep viewers engaged through quick cuts and developing the initial hook.',
        imageUrl: short.images && short.images[1] ? short.images[1] : '/uploads/images/placeholder.png', // Placeholder
      },
      body: {
        description: short.script.body || 'The main part of your short, delivering the key message, product demonstration, or story climax.',
        imageUrl: short.images && short.images[2] ? short.images[2] : '/uploads/images/placeholder.png', // Placeholder
      },
      cta: {
        description: short.script.cta || 'The call to action, encouraging viewers to like, comment, subscribe, or visit a link with a clear on-screen graphic and audio cue.',
        imageUrl: short.images && short.images[3] ? short.images[3] : '/uploads/images/placeholder.png', // Placeholder
      },
    },
    performance: {
      views: short.youtubeViewCount || mockPerformance.views,
      viewsChange: mockPerformance.viewsChange,
      bounceRate: mockPerformance.bounceRate,
      bounceRateChange: mockPerformance.bounceRateChange,
      likes: short.youtubeLikeCount || mockPerformance.likes,
      likesChange: mockPerformance.likesChange,
      comments: short.youtubeCommentCount || mockPerformance.comments,
      commentsChange: mockPerformance.commentsChange,
      shares: mockPerformance.shares,
      sharesChange: mockPerformance.sharesChange,
    },
  };
  return reportData;
}

app.get('/api/projects/:projectId/shorts/:shortId/report', async (req: Request, res: Response) => {
  try {
    const { projectId = '' , shortId = '' } = req.params; // Default to empty string if undefined
    const reportData = await getShortReportData(projectId, shortId);
    res.status(200).json(reportData);
  } catch (error: any) {
    console.error('Error fetching short report from Redis:', error);
    res.status(500).send('Failed to retrieve short report.');
  }
});

// GET a single short's report as PDF
app.get('/api/projects/:projectId/shorts/:shortId/report/pdf', async (req: Request, res: Response) => {
  try {
    const { projectId = '' , shortId = '' } = req.params; // Default to empty string if undefined

    // 1. Get report data using the new function
    const reportData = await getShortReportData(projectId, shortId);

    // 2. Construct HTML string for the report
    const htmlContent = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<link crossorigin="" href="https://fonts.gstatic.com/" rel="preconnect"/>
<link as="style" href="https://fonts.googleapis.com/css2?display=swap&amp;family=Inter%3Awght%40400%3B500%3B700%3B900&amp;family=Noto+Sans%3Awght%40400%3B500%3B700%3B900" onload="this.rel='stylesheet'" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet"/>
<title>Short Report: ${reportData.title}</title>
<link href="data:image/x-icon;base64," rel="icon" type="image/x-icon"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<style type="text/tailwindcss">
      :root {
        --primary-color: #137fec;
      }
      body {
        font-family: 'Inter', sans-serif;
      }
    </style>
</head>
<body class="bg-gray-50">
<div class="relative flex size-full min-h-screen flex-col bg-white group/design-root overflow-x-hidden" style='font-family: Inter, "Noto Sans", sans-serif;'>
<div class="layout-container flex h-full grow flex-col">
<header class="flex items-center justify-between whitespace-nowrap border-b border-solid border-gray-200 px-10 py-4 bg-white">
<div class="flex items-center gap-8">
<div class="flex items-center gap-3 text-gray-800">
<svg class="h-8 w-8 text-[var(--primary-color)]" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
<path clip-rule="evenodd" d="M24 4H42V17.3333V30.6667H24V44H6V30.6667V17.3333H24V4Z" fill="currentColor" fill-rule="evenodd"></path>
</svg>
<h2 class="text-gray-800 text-xl font-bold leading-tight tracking-[-0.015em]">Video Platform</h2>
</div>
<nav class="flex items-center gap-6">
<a class="text-gray-600 hover:text-gray-900 text-sm font-medium leading-normal" href="#">Home</a>
<a class="text-[var(--primary-color)] font-semibold text-sm leading-normal" href="#">Shorts</a>
<a class="text-gray-600 hover:text-gray-900 text-sm font-medium leading-normal" href="#">Subscriptions</a>
<a class="text-gray-600 hover:text-gray-900 text-sm font-medium leading-normal" href="#">Library</a>
</nav>
</div>
<div class="flex flex-1 justify-end gap-4 items-center">
<label class="flex flex-col relative w-full max-w-xs">
<div class="flex w-full flex-1 items-stretch rounded-full h-10">
<div class="text-gray-400 flex items-center justify-center pl-4">
<span class="material-symbols-outlined"> search </span>
</div>
<input class="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-full text-gray-800 focus:outline-0 focus:ring-0 border-none bg-transparent h-full placeholder:text-gray-400 px-4 text-sm font-normal leading-normal" placeholder="Search" value=""/>
</div>
</label>
<button class="flex items-center justify-center rounded-full h-10 w-10 hover:bg-gray-100 text-gray-700">
<span class="material-symbols-outlined"> add </span>
</button>
<button class="flex items-center justify-center rounded-full h-10 w-10 hover:bg-gray-100 text-gray-700">
<span class="material-symbols-outlined"> notifications </span>
</button>
<div class="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10" style='background-image: url("https://lh3.googleusercontent.com/aida-public/AB6AXuCDSrV5j9upGtLlQmKY3ljBA6DuF6gjxXwhYb1QsbSdMCvtabpv4Dze_cZUqnQEt5cKEqDnDqNReieq8GVpBuXdxBxf8v7O1qgS5L1Rm_bWOAROZROEF0qds02RJh-_vHsvzB5fistXwHJ-U_wW48ep5aocPBLn8mS-Eqy2aF9gudx6w1NJYpJGrMMFbNaTpBSj4C40NZvQHZ-Iz-H1xwRdA0Ru8YqUdqYH8WtP07LQIRiNrq1bSNRIbElMsQ34NJno4LoT3MZ_Ruhh");'></div>
</div>
</header>
<main class="flex-1 bg-gray-50/50">
<div class="max-w-7xl mx-auto py-8 px-4">
<div class="mb-8">
<div class="flex items-center text-sm text-gray-500 mb-4">
<a class="hover:text-[var(--primary-color)]" href="#">Shorts</a>
<span class="mx-2">/</span>
<span class="font-medium text-gray-700">Short Report</span>
</div>
<h1 class="text-4xl font-bold text-gray-900 tracking-tight">Short Report: "${reportData.title}"</h1>
<p class="mt-2 text-lg text-gray-600">${reportData.description}</p>
</div>
<div class="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
<div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
<div>
<h2 class="text-2xl font-bold text-gray-900 mb-6">Short Breakdown</h2>
<div class="space-y-6">
<div class="flex gap-4 items-start">
<div class="w-28 flex-shrink-0">
<div class="w-full bg-center bg-no-repeat aspect-[9/16] bg-cover rounded-md shadow-md" style='background-image: url("${reportData.breakdown.hook.imageUrl}");'></div>
</div>
<div>
<h3 class="text-lg font-bold text-gray-900">Hook (0-3s)</h3>
<p class="text-gray-600 mt-1">${reportData.breakdown.hook.description}</p>
</div>
</div>
<div class="flex gap-4 items-start">
<div class="w-28 flex-shrink-0">
<div class="w-full bg-center bg-no-repeat aspect-[9/16] bg-cover rounded-md shadow-md" style='background-image: url("${reportData.breakdown.immersion.imageUrl}");'></div>
</div>
<div>
<h3 class="text-lg font-bold text-gray-900">Immersion (4-15s)</h3>
<p class="text-gray-600 mt-1">${reportData.breakdown.immersion.description}</p>
</div>
</div>
<div class="flex gap-4 items-start">
<div class="w-28 flex-shrink-0">
<div class="w-full bg-center bg-no-repeat aspect-[9/16] bg-cover rounded-md shadow-md" style='background-image: url("${reportData.breakdown.body.imageUrl}");'></div>
</div>
<div>
<h3 class="text-lg font-bold text-gray-900">Body (16-25s)</h3>
<p class="text-gray-600 mt-1">${reportData.breakdown.body.description}</p>
</div>
</div>
<div class="flex gap-4 items-start">
<div class="w-28 flex-shrink-0">
<div class="w-full bg-center bg-no-repeat aspect-[9/16] bg-cover rounded-md shadow-md" style='background-image: url("${reportData.breakdown.cta.imageUrl}");'></div>
</div>
<div>
<h3 class="text-lg font-bold text-gray-900">CTA (26-30s)</h3>
<p class="text-gray-600 mt-1">${reportData.breakdown.cta.description}</p>
</div>
</div>
</div>
</div>
<div class="border-l border-gray-200 pl-12">
<h2 class="text-2xl font-bold text-gray-900 mb-6">Performance Summary</h2>
<div class="space-y-6">
<div class="flex flex-col gap-2">
<div class="flex items-center gap-2 text-gray-600">
<span class="material-symbols-outlined text-xl">visibility</span>
<p class="text-base font-medium">Views</p>
</div>
<p class="text-gray-900 text-4xl font-bold tracking-tight">${reportData.performance.views}</p>
<p class="text-sm text-gray-500">${reportData.performance.viewsChange} from last week</p>
</div>
<div class="flex flex-col gap-2">
<div class="flex items-center gap-2 text-gray-600">
<span class="material-symbols-outlined text-xl">trending_down</span>
<p class="text-base font-medium">Bounce Rate</p>
</div>
<p class="text-gray-900 text-4xl font-bold tracking-tight">${reportData.performance.bounceRate}</p>
<p class="text-sm text-gray-500">${reportData.performance.bounceRateChange} from last week</p>
</div>
<div class="flex flex-col gap-2">
<div class="flex items-center gap-2 text-gray-600">
<span class="material-symbols-outlined text-xl">thumb_up</span>
<p class="text-base font-medium">Likes</p>
</div>
<p class="text-gray-900 text-4xl font-bold tracking-tight">${reportData.performance.likes}</p>
<p class="text-sm text-gray-500">${reportData.performance.likesChange} from last week</p>
</div>
<div class="flex flex-col gap-2">
<div class="flex items-center gap-2 text-gray-600">
<span class="material-symbols-outlined text-xl">comment</span>
<p class="text-base font-medium">Comments</p>
</div>
<p class="text-gray-900 text-4xl font-bold tracking-tight">${reportData.performance.comments}</p>
<p class="text-sm text-gray-500">${reportData.performance.commentsChange} from last week</p>
</div>
<div class="flex flex-col gap-2">
<div class="flex items-center gap-2 text-gray-600">
<span class="material-symbols-outlined text-xl">share</span>
<p class="text-base font-medium">Shares</p>
</div>
<p class="text-gray-900 text-4xl font-bold tracking-tight">${reportData.performance.shares}</p>
<p class="text-sm text-gray-500">${reportData.performance.sharesChange} from last week</p>
</div>
</div>
</div>
</div>
</div>
</div>
</main>
</div>
</div>

</body></html>`;

    // 3. Push task to Puppeteer worker
    const taskId = `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await redisClient.lPush(PUPPETEER_TASKS_LIST, JSON.stringify({
      type: 'generate_pdf_from_html',
      payload: { htmlContent, task_id: taskId }
    }));

    // 4. Poll Redis for the result
    let pdfResult = null;
    const pollStartTime = Date.now();
    const pollTimeout = 60000; // 60 seconds timeout

    while (!pdfResult && (Date.now() - pollStartTime < pollTimeout)) {
      const result = await redisClient.get(PUPPETEER_RESPONSE_PREFIX + taskId);
      if (result) {
        pdfResult = JSON.parse(result);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 1 second
    }

    if (!pdfResult) {
      throw new Error('PDF generation timed out.');
    }

    if (pdfResult.status === 'error') {
      throw new Error(`PDF generation failed: ${pdfResult.error.message || 'Unknown error'}`);
    }

    // 5. Send PDF file as response
    const pdfFilePath = path.join(__dirname, '../../services/puppeteer_worker/data', `${taskId}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportData.title.replace(/[^a-z0-9]/gi, '_')}_report.pdf"`);
    res.sendFile(pdfFilePath, (err) => {
      if (err) {
        console.error('Error sending PDF file:', err);
        res.status(500).send('Failed to send PDF file.');
      } else {
        // Clean up the generated PDF file after sending
        fs.unlink(pdfFilePath, (unlinkErr) => {
          if (unlinkErr) console.error('Error deleting PDF file:', unlinkErr);
        });
      }
    });

  } catch (error: any) {
    console.error('Error generating PDF report:', error);
    res.status(500).send('Failed to generate PDF report.');
  }
});

// --- Static File Serving ---
app.use(express.static(path.join(__dirname, '../public')));

// --- Health Check Endpoint ---
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await redisClient.ping();
    res.status(200).send({ status: 'ok', message: 'Backend is healthy and connected to Redis.' });
  } catch (error: any) {
    console.error('Health check failed:', error);
    res.status(503).send({ status: 'error', message: 'Backend cannot connect to Redis.' });
  }
});

// Export the app for testing purposes
export default app;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
