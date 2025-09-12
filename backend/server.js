import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { createClient } from 'redis';

// --- Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3002;

// --- Redis Client Setup ---
const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
await redisClient.connect();

// --- Helper Functions for Redis ---
const PROJECT_SET_KEY = 'projects';

async function readProject(projectId) {
  const projectJSON = await redisClient.hGetAll(`project:${projectId}`);
  if (Object.keys(projectJSON).length === 0) {
    return null;
  }
  // Parse shorts array from JSON string
  if (projectJSON.shorts) {
    projectJSON.shorts = JSON.parse(projectJSON.shorts);
  }
  return projectJSON;
}

async function writeProject(project) {
  const projectKey = `project:${project.id}`;
  const projectToWrite = {
    ...project,
    // Serialize shorts array into a JSON string for storage in Redis Hash
    shorts: JSON.stringify(project.shorts || []),
  };
  await redisClient.hSet(projectKey, projectToWrite);
  await redisClient.sAdd(PROJECT_SET_KEY, project.id);
}

async function readAllProjects() {
  const projectIds = await redisClient.sMembers(PROJECT_SET_KEY);
  if (!projectIds || projectIds.length === 0) {
    return [];
  }
  const projects = await Promise.all(projectIds.map(id => readProject(id)));
  return projects.filter(p => p !== null);
}

async function deleteProjectFromRedis(projectId) {
  await redisClient.del(`project:${projectId}`);
  await redisClient.sRem(PROJECT_SET_KEY, projectId);
}


// --- CORS Configuration ---
const whitelist = ['http://localhost:15173', 'http://localhost:3000'];
const corsOptions = {
  origin: function (origin, callback) {
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
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage: storage });

app.post('/api/upload/multiple-images', upload.array('images', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded.');
  }
  const imageUrls = req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/images/${file.filename}`);
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
app.get('/api/script', async (req, res) => {
  try {
    let script = await redisClient.hGetAll(SCRIPT_KEY);
    if (Object.keys(script).length === 0) {
      script = { hook: '', immersion: '', body: '', cta: '' };
    }
    res.status(200).json(script);
  } catch (error) {
    console.error('Error reading script from Redis:', error);
    res.status(500).send('Failed to retrieve script.');
  }
});

// POST script (save/update)
app.post('/api/script', async (req, res) => {
  try {
    const script = req.body;
    await redisClient.hSet(SCRIPT_KEY, script);
    res.status(200).json(script);
  } catch (error) {
    console.error('Error saving script to Redis:', error);
    res.status(500).send('Failed to save script.');
  }
});

// --- Project Management API (Redis Based) ---

// GET all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await readAllProjects();
    res.status(200).json(projects);
  } catch (error) {
    console.error('Error reading projects from Redis:', error);
    res.status(500).send('Failed to retrieve projects.');
  }
});

// POST a new project
app.post('/api/projects', async (req, res) => {
  try {
    const newProject = {
      id: `proj-${Date.now()}`,
      name: req.body.name || 'Untitled Project',
      description: req.body.description || '',
      shorts: [], // Will be stringified by writeProject
    };
    await writeProject(newProject);
    res.status(201).json(newProject);
  } catch (error) {
    console.error('Error creating project in Redis:', error);
    res.status(500).send('Failed to create project.');
  }
});

// GET a single project
app.get('/api/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await readProject(projectId);
        if (!project) {
            return res.status(404).send('Project not found.');
        }
        res.status(200).json(project);
    } catch (error) {
        console.error('Error reading project from Redis:', error);
        res.status(500).send('Failed to retrieve project.');
    }
});


// PUT (update) a project
app.put('/api/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    let project = await readProject(projectId);

    if (!project) {
      return res.status(404).send('Project not found.');
    }

    // Update project with new data from body
    const updatedProject = { ...project, ...req.body, id: projectId };

    await writeProject(updatedProject);
    res.status(200).json(updatedProject);
  } catch (error) {
    console.error('Error updating project in Redis:', error);
    res.status(500).send('Failed to update project.');
  }
});

// DELETE a project
app.delete('/api/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    await deleteProjectFromRedis(projectId);
    res.status(204).send(); // No Content
  } catch (error) {
    console.error('Error deleting project from Redis:', error);
    res.status(500).send('Failed to delete project.');
  }
});

// --- Shorts Management API (Redis Based) ---

// GET all shorts for a project
app.get('/api/projects/:projectId/shorts', async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await readProject(projectId);
    if (!project) {
      return res.status(404).send('Project not found.');
    }
    res.status(200).json(project.shorts || []);
  } catch (error) {
    console.error('Error reading shorts from Redis:', error);
    res.status(500).send('Failed to retrieve shorts.');
  }
});

// POST a new short to a project
app.post('/api/projects/:projectId/shorts', async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await readProject(projectId);
    if (!project) {
      return res.status(404).send('Project not found.');
    }

    const newShort = {
      id: `short-${Date.now()}`,
      projectId: projectId,
      title: req.body.title || 'Untitled Short',
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
  } catch (error) {
    console.error('Error creating short in Redis:', error);
    res.status(500).send('Failed to create short.');
  }
});

// PUT (update) an existing short in a project
app.put('/api/projects/:projectId/shorts/:shortId', async (req, res) => {
  try {
    const { projectId, shortId } = req.params;
    const project = await readProject(projectId);
    if (!project) {
      return res.status(404).send('Project not found.');
    }

    const shortIndex = project.shorts.findIndex(s => s.id === shortId);
    if (shortIndex === -1) {
      return res.status(404).send('Short not found.');
    }

    const updatedShort = { ...project.shorts[shortIndex], ...req.body, id: shortId, projectId: projectId };
    project.shorts[shortIndex] = updatedShort;

    await writeProject(project);
    res.status(200).json(updatedShort);
  } catch (error) {
    console.error('Error updating short in Redis:', error);
    res.status(500).send('Failed to update short.');
  }
});

// DELETE a short from a project
app.delete('/api/projects/:projectId/shorts/:shortId', async (req, res) => {
  try {
    const { projectId, shortId } = req.params;
    const project = await readProject(projectId);
    if (!project) {
      return res.status(404).send('Project not found.');
    }

    const initialShortsLength = project.shorts.length;
    project.shorts = project.shorts.filter(s => s.id !== shortId);

    if (project.shorts.length === initialShortsLength) {
      return res.status(404).send('Short not found.');
    }

    await writeProject(project);
    res.status(204).send(); // No Content
  } catch (error) {
    console.error('Error deleting short from Redis:', error);
    res.status(500).send('Failed to delete short.');
  }
});

// --- Static File Serving ---
app.use(express.static(path.join(__dirname, '../public')));

// --- Health Check Endpoint ---
app.get('/api/health', async (req, res) => {
  try {
    await redisClient.ping();
    res.status(200).send({ status: 'ok', message: 'Backend is healthy and connected to Redis.' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).send({ status: 'error', message: 'Backend cannot connect to Redis.' });
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
